const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ForwardingRule = require("../models/ForwardingRule");
const Member = require("../models/Member");
const Group = require("../models/Group");
const logger = require("../utils/logger");
const { escapeRegex } = require("../utils/helpers");
let io = null;
let emitToUserFn = null;

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
};

class BroadcastManager {
  constructor() {
    this.messageQueue = [];
    this.isProcessing = false;
    this.messageCount = 0;
    this.messageWindow = [];
  }

  async handleIncoming(sock, msg, from, userId) {
    if (!from.endsWith("@g.us")) {
      logger.debug(`Message ignoré: pas un groupe (${from})`);
      return;
    }

    try {
      const rules = await ForwardingRule.find({ sourceGroupId: from, isActive: true, userId });
      logger.info(`handleIncoming: ${rules.length} règle(s) trouvée(s) pour ${from}`);
      if (!rules.length) {
        logger.debug(`Aucune règle active pour le groupe ${from}`);
        return;
      }

      let senderJid = msg.key.participant || msg.key.remoteJid;
      if (msg.key.fromMe && sock?.user?.id) {
        senderJid = sock.user.id;
      }

      // Si c'est un message envoyé par le bot/user, c'est forcément un admin
      const isAdmin = msg.key.fromMe ? true : await this.checkIsAdmin(from, senderJid);
      logger.info(`handleIncoming: sender=${senderJid} admin=${isAdmin} fromMe=${msg.key.fromMe}`);

      for (const rule of rules) {
        const requireAdmin = rule.onlyAdmins;
        if (requireAdmin && !isAdmin) {
          logger.debug(`Règle "${rule.name}" ignorée: admin requis mais ${senderJid} n'est pas admin`);
          continue;
        }

        let targets = [];
        if (rule.forwardToAllGroups || rule.masterGroup) {
          let query = {};
          if (rule.targetGroupPattern) {
            query.name = { $regex: escapeRegex(rule.targetGroupPattern), $options: "i" };
          }
          const groups = await Group.find(query);
          targets = groups.map((g) => g.groupId).filter((id) => id !== from);
          logger.debug(`Règle "${rule.name}": ${groups.length} groupes trouvés avec filtre "${rule.targetGroupPattern}"`);
        } else if (rule.targetGroupIds?.length) {
          targets = rule.targetGroupIds.filter((id) => id !== from);
        }

        this.emitActivity(rule, msg, senderJid, targets.length);

        if (!targets.length) {
          logger.debug(`Règle "${rule.name}": aucun groupe cible`);
          continue;
        }

        logger.info(`Forward: ${targets.length} cibles pour la règle "${rule.name}"`);

        if (rule.forwardToMembers) {
          logger.warn(`Règle "${rule.name}": Envoi individuel aux membres activé pour ${targets.length} groupes.`);
          for (const groupId of targets) {
            const members = await Member.find({ groupId });
            logger.info(`Groupe ${groupId}: Envoi à ${members.length} membres.`);
            for (const member of members) {
              this.queueMessage(sock, member.jid, msg, rule);
            }
          }
        } else {
          for (const targetId of targets) {
            this.queueMessage(sock, targetId, msg, rule);
          }
        }
      }
    } catch (err) {
      logger.error("Erreur broadcastManager:", err);
    }
  }

  async checkIsAdmin(groupId, jid) {
    try {
      if (!jid) return false;
      const cleanJid = jid.split("@")[0].split(":")[0] + "@" + (jid.split("@")[1] || "s.whatsapp.net");
      let member = await Member.findOne({ groupId, jid: cleanJid });
      if (member) return member.isAdmin || false;
      const altJid = cleanJid.includes("@lid") ? cleanJid.replace(/@lid/, "@s.whatsapp.net") : cleanJid.replace(/@s\.whatsapp\.net/, "@lid");
      member = await Member.findOne({ groupId, jid: altJid });
      return member?.isAdmin || false;
    } catch (e) {
      logger.warn("Erreur checkIsAdmin:", e);
      return false;
    }
  }

  canSend() {
    const now = Date.now();
    this.messageWindow = this.messageWindow.filter((t) => now - t < 60000);
    return this.messageWindow.length < 25;
  }

  queueMessage(sock, targetId, msg, rule) {
    this.messageQueue.push({ sock, targetId, msg, rule });
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    this.isProcessing = true;
    while (this.messageQueue.length) {
      if (!this.canSend()) {
        logger.warn("Limite messages/minute atteinte, pause 10s...");
        await this.sleep(10000);
        continue;
      }

      const { sock, targetId, msg, rule } = this.messageQueue.shift();

      if (!sock) {
        logger.warn("WhatsApp socket null. Vidage de la file d'attente.");
        this.messageQueue = [];
        break;
      }

      try {
        const delay = 2000 + Math.random() * 3000;
        await this.sleep(delay);

        await sock.sendPresenceUpdate("composing", targetId);
        await this.sleep(800 + Math.random() * 1200);

        await this.forwardMessage(sock, targetId, msg, rule);

        this.messageWindow.push(Date.now());
        this.messageCount++;
      } catch (err) {
        logger.error(`Erreur envoi vers ${targetId}: ${err.message}`);
        const errMsg = err.message || "";
        if (errMsg.includes("Closed") || errMsg.includes("closed") || errMsg.includes("not opened") || errMsg.includes("conflict")) {
          logger.warn("Déconnexion détectée lors de l'envoi. Vidage de la file d'attente.");
          this.messageQueue = [];
          break;
        }
      }
    }
    this.isProcessing = false;
  }

  getMessageText(msgContent) {
    if (!msgContent) return "";
    for (const field of ["conversation", "extendedTextMessage", "imageMessage", "videoMessage", "documentMessage"]) {
      const text = msgContent[field]?.text || msgContent[field]?.caption || (field === "conversation" ? msgContent[field] : null);
      if (text) return text;
    }
    return "";
  }

  async forwardMessage(sock, targetId, msg, rule) {
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    if (!msgContent) return;

    const msgType = this.getMessageType(msgContent);
    const caption = this.getMessageText(msgContent);

    if (rule.includeMedia && msgType) {
      try {
        switch (msgType) {
          case "imageMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            await sock.sendMessage(targetId, { image: stream, caption });
            return;
          }
          case "videoMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            await sock.sendMessage(targetId, { video: stream, caption });
            return;
          }
          case "ptvMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            await sock.sendMessage(targetId, { video: stream, ptv: true });
            return;
          }
          case "audioMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            const ptt = !!msgContent.audioMessage?.ptt;
            await sock.sendMessage(targetId, { audio: stream, ptt });
            return;
          }
          case "documentMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            const doc = msgContent.documentMessage;
            await sock.sendMessage(targetId, {
              document: stream,
              fileName: doc?.fileName || "document",
              mimetype: doc?.mimetype || "application/octet-stream",
              caption,
            });
            return;
          }
          case "stickerMessage": {
            const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
            await sock.sendMessage(targetId, { sticker: stream });
            return;
          }
          case "pollCreationMessage": {
            const poll = msgContent.pollCreationMessage;
            await sock.sendMessage(targetId, {
              poll: {
                name: poll.name,
                values: poll.options.map(o => o.optionName),
                selectableOptionsCount: poll.selectableOptionsCount
              }
            });
            return;
          }
          case "locationMessage": {
            const loc = msgContent.locationMessage;
            await sock.sendMessage(targetId, {
              location: {
                degreesLatitude: loc.degreesLatitude,
                degreesLongitude: loc.degreesLongitude,
                name: loc.name || "",
                address: loc.address || ""
              }
            });
            return;
          }
          case "contactMessage": {
            const con = msgContent.contactMessage;
            await sock.sendMessage(targetId, {
              contacts: {
                displayName: con.displayName,
                contacts: [{ vcard: con.vcard }]
              }
            });
            return;
          }
          case "contactsArrayMessage": {
            const con = msgContent.contactsArrayMessage;
            await sock.sendMessage(targetId, {
              contacts: {
                displayName: con.displayName,
                contacts: con.contacts.map(c => ({ vcard: c.vcard }))
              }
            });
            return;
          }
          default: {
            if (caption) {
              await sock.sendMessage(targetId, { text: caption });
              return;
            }
            try {
              const stream = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock?.updateMediaMessage });
              await sock.sendMessage(targetId, { document: stream, fileName: "media", mimetype: "application/octet-stream" });
              return;
            } catch {}
          }
        }
      } catch (err) {
        logger.warn(`Échec téléchargement média: ${err.message}`);
      }
    }

    if (caption) {
      await sock.sendMessage(targetId, { text: caption });
    }
  }

  getMessageType(message) {
    if (!message) return null;
    const types = [
      "conversation", "extendedTextMessage",
      "imageMessage", "videoMessage", "audioMessage",
      "documentMessage", "stickerMessage", "ptvMessage",
      "pollCreationMessage", "locationMessage",
      "contactMessage", "contactsArrayMessage"
    ];
    for (const t of types) {
      if (message[t]) return t;
    }
    if (message.buttonsResponseMessage) return "buttonsResponseMessage";
    if (message.listResponseMessage) return "listResponseMessage";
    if (message.templateButtonReplyMessage) return "templateButtonReplyMessage";
    if (message.reactionMessage) return "reactionMessage";
    if (message.groupInviteMessage) return "groupInviteMessage";
    if (message.liveLocationMessage) return "liveLocationMessage";
    if (message.productMessage) return "productMessage";
    if (message.orderMessage) return "orderMessage";
    if (message.listMessage) return "listMessage";
    if (message.buttonsMessage) return "buttonsMessage";
    if (message.templateMessage) return "templateMessage";
    if (message.protocolMessage) return "protocolMessage";
    return "unknown";
  }

  emitActivity(rule, msg, senderJid, targetCount) {
    if (!io) return;
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    const msgType = this.getMessageType(msgContent) || "inconnu";
    const msgPreview = this.getMessageText(msgContent) || `[${msgType}]`;
    const data = {
      ruleName: rule.name,
      sender: senderJid.split("@")[0],
      message: msgPreview.substring(0, 80),
      type: msgType,
      targets: targetCount,
      masterGroup: rule.masterGroup,
      time: new Date().toISOString(),
    };
    logger.info(`Activité forwarding: "${rule.name}" vers ${targetCount} cibles, sender: ${senderJid.split("@")[0]}, masterGroup: ${rule.masterGroup}`);
    if (emitToUserFn && rule.userId) {
      emitToUserFn(rule.userId, "forwarding:activity", data);
    } else {
      io.emit("forwarding:activity", data);
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  setIO(instance, emitFn) {
    io = instance;
    emitToUserFn = emitFn;
  }

  startMasterPolling(sock, userId) {
    // Remplacé par le traitement temps réel direct.
    logger.info("startMasterPolling appelé - mode temps réel actif (sans polling)");
  }

  stopMasterPolling() {
    // Remplacé par le traitement temps réel direct.
    logger.info("stopMasterPolling appelé");
  }
}

module.exports = new BroadcastManager();
