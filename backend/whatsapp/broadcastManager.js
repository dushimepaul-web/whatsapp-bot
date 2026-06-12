const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ForwardingRule = require("../models/ForwardingRule");
const ForwardedMessage = require("../models/ForwardedMessage");
const Member = require("../models/Member");
const Group = require("../models/Group");
const Setting = require("../models/Setting");
const logger = require("../utils/logger");
const { escapeRegex } = require("../utils/helpers");
const path = require("path");
const fs = require("fs");
let io = null;
let emitToUserFn = null;

const MEDIA_CACHE_DIR = path.join(__dirname, "..", "media_cache");

const cloneMsg = (msg) => {
  if (!msg) return msg;
  const deepClone = (obj) => {
    if (Buffer.isBuffer(obj)) return Buffer.from(obj);
    if (obj instanceof Uint8Array) return Buffer.from(obj);
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const copy = {};
    for (const [k, v] of Object.entries(obj)) {
      copy[k] = deepClone(v);
    }
    return copy;
  };
  return {
    key: msg.key ? deepClone(msg.key) : undefined,
    message: msg.message ? deepClone(msg.message) : undefined,
    messageTimestamp: msg.messageTimestamp,
    pushName: msg.pushName,
  };
};

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
};

const BATCH_DELAY_MS = 2000;
const MAX_BATCH_SIZE = 15;
const MAX_BATCH_WAIT_MS = 15000;
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
const MAX_MEM_CACHE = 20;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const BURST_DURATION_MS = 2 * 60 * 60 * 1000;
const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_QUEUE_SIZE = 5000;

class BroadcastManager {
  constructor() {
    this.messageQueue = [];
    this.isProcessing = false;
    this.stopRequested = false;
    this.messageCount = 0;
    this.messageWindow = [];
    this.batchBuffer = {};
    this.memCache = new Map();
    this.mediaCacheDir = MEDIA_CACHE_DIR;
    this.burstStartTime = Date.now();
    this.adaptiveDelay = 1;
    this.errorWindow = [];
    this.lastErrorTime = 0;
    this.ensureMediaCacheDir();
  }

  ensureMediaCacheDir() {
    try {
      if (!fs.existsSync(this.mediaCacheDir)) {
        fs.mkdirSync(this.mediaCacheDir, { recursive: true });
        logger.info(`Dossier cache média créé: ${this.mediaCacheDir}`);
      } else {
        this.cleanMediaCache();
      }
    } catch (err) {
      logger.error(`Erreur création dossier cache média: ${err.message}`);
    }
  }

  getMediaCachePath(cacheKey) {
    return path.join(this.mediaCacheDir, `${cacheKey}.bin`);
  }

  getMediaSize() {
    try {
      const files = fs.readdirSync(this.mediaCacheDir);
      let totalBytes = 0;
      for (const f of files) {
        try {
          totalBytes += fs.statSync(path.join(this.mediaCacheDir, f)).size;
        } catch {}
      }
      return totalBytes;
    } catch {
      return 0;
    }
  }

  cleanMediaCache(maxBytes = 500 * 1024 * 1024) {
    try {
      const files = fs.readdirSync(this.mediaCacheDir).map((f) => {
        const fp = path.join(this.mediaCacheDir, f);
        try {
          return { name: f, path: fp, mtime: fs.statSync(fp).mtimeMs, size: fs.statSync(fp).size };
        } catch {
          return null;
        }
      }).filter(Boolean).sort((a, b) => a.mtime - b.mtime);

      let totalBytes = files.reduce((s, f) => s + f.size, 0);
      if (totalBytes <= maxBytes) return;

      const toRemove = [];
      for (const f of files) {
        if (totalBytes <= maxBytes) break;
        toRemove.push(f);
        totalBytes -= f.size;
      }
      for (const f of toRemove) {
        try {
          fs.unlinkSync(f.path);
          this.memCache.delete(f.name.replace(".bin", ""));
          logger.debug(`Cache média purgé: ${f.name}`);
        } catch {}
      }
      logger.info(`Cache média nettoyé: ${toRemove.length} fichier(s) supprimé(s), ${(totalBytes / 1024 / 1024).toFixed(1)}MB restants`);
    } catch (err) {
      logger.warn(`Erreur nettoyage cache média: ${err.message}`);
    }
  }

  stop(userId) {
    this.stopRequested = true;
    const before = this.messageQueue.length;
    this.messageQueue = this.messageQueue.filter(
      item => item.rule?.userId?.toString() !== userId?.toString()
    );
    const removed = before - this.messageQueue.length;
    for (const ruleId of Object.keys(this.batchBuffer)) {
      const batch = this.batchBuffer[ruleId];
      if (batch.rule?.userId?.toString() === userId?.toString()) {
        if (batch.timer) clearTimeout(batch.timer);
        if (batch.forceTimer) clearTimeout(batch.forceTimer);
        delete this.batchBuffer[ruleId];
      }
    }
    logger.info(`Arrêt du forwarding pour user=${userId}, ${removed} messages retirés`);
    if (emitToUserFn && userId) {
      emitToUserFn(userId, "forwarding:stopped", { stopped: true, messages: removed });
    } else if (io) {
      io.emit("forwarding:stopped", { stopped: true, messages: removed });
    }
  }

  async handleIncoming(sock, msg, from, userId) {
    if (!from || !from.endsWith("@g.us")) {
      return;
    }

    // Détection de suppression de message (protocol REVOKE)
    const proto = msg.message?.protocolMessage;
    if (proto?.type === 0 && proto.key) {
      await this.handleMessageDeletion(sock, proto.key, userId);
      return;
    }

    try {
      const setting = await Setting.findOne({ userId });
      const rules = await ForwardingRule.find({ sourceGroupId: from, isActive: true, userId });
      logger.info(`handleIncoming: ${rules.length} règle(s) trouvée(s) pour ${from}`);

      if (!rules.length && setting?.masterGroupKeyword) {
        const sourceGroup = await Group.findOne({ groupId: from, userId });
        if (sourceGroup && sourceGroup.name && new RegExp(escapeRegex(setting.masterGroupKeyword), "i").test(sourceGroup.name)) {
          const fakeRule = { _id: "auto", name: `Auto: ${sourceGroup.name}`, masterGroup: true, forwardToAllGroups: true, forwardToMembers: false, onlyAdmins: false, includeMedia: true, isActive: true, userId };
          rules.push(fakeRule);
          logger.info(`Auto-règle master créée via mot-clé "${setting.masterGroupKeyword}" pour ${sourceGroup.name}`);
        }
      }

      if (!rules.length) {
        logger.debug(`Aucune règle active pour le groupe ${from}`);
        return;
      }

      let senderJid = msg.key.participant;
      if (!senderJid || !senderJid.includes("@")) {
        if (msg.key.fromMe && sock?.user?.id) {
          senderJid = sock.user.id;
        } else {
          senderJid = msg.key.participant || msg.key.remoteJid;
        }
      }
      if (msg.key.fromMe && sock?.user?.id) {
        senderJid = sock.user.id;
      }

      // Si c'est un message envoyé par le bot/user, c'est forcément un admin
      const isAdmin = msg.key.fromMe ? true : await this.checkIsAdmin(from, senderJid, userId);
      logger.info(`handleIncoming: sender=${senderJid} admin=${isAdmin} fromMe=${msg.key.fromMe}`);

      for (const rule of rules) {
        const requireAdmin = rule.onlyAdmins;
        if (requireAdmin && !isAdmin) {
          logger.debug(`Règle "${rule.name}" ignorée: admin requis mais ${senderJid} n'est pas admin`);
          continue;
        }

        let targets = [];
        if (rule.forwardToAllGroups || rule.masterGroup) {
          let query = { userId };
          let pattern = rule.targetGroupPattern;
          if (!pattern) {
            pattern = setting?.forwardingKeyword || "";
          }
          if (pattern) {
            query.name = { $regex: escapeRegex(pattern), $options: "i" };
          }
          const groups = await Group.find(query);
          targets = groups.map((g) => g.groupId).filter((id) => id !== from);
          logger.debug(`Règle "${rule.name}": ${groups.length} groupes trouvés avec filtre "${pattern}"`);
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
            const cloned = cloneMsg(msg);
            const senderPhone = senderJid.split("@")[0].split(":")[0];
            const seen = new Set();
            let uniqueCount = 0;
            for (const groupId of targets) {
              let skip = 0;
              const batchSize = 100;
              while (true) {
                const members = await Member.find({ groupId, userId })
                  .skip(skip).limit(batchSize).lean();
                if (!members.length) break;
                for (const member of members) {
                  const memberPhone = member.jid.split("@")[0].split(":")[0];
                  if (memberPhone === senderPhone || seen.has(memberPhone)) continue;
                  seen.add(memberPhone);
                  uniqueCount++;
                  this.queueMessage(sock, member.jid, cloned, rule);
                }
                skip += batchSize;
              }
            }
            logger.info(`Inbox: ${uniqueCount} membres uniques en file d'attente (burst 2h/2h)`);
        } else {
          this.addToBatch(sock, rule, msg, targets);
        }
      }
    } catch (err) {
      logger.error("Erreur broadcastManager:", err);
    }
  }

  async checkIsAdmin(groupId, jid, userId) {
    try {
      if (!jid) return false;
      const cleanJid = jid.split("@")[0].split(":")[0] + "@" + (jid.split("@")[1] || "s.whatsapp.net");
      let member = await Member.findOne({ groupId, userId, jid: cleanJid });
      if (member) return member.isAdmin || false;
      const altJid = cleanJid.includes("@lid") ? cleanJid.replace(/@lid/, "@s.whatsapp.net") : cleanJid.replace(/@s\.whatsapp\.net/, "@lid");
      member = await Member.findOne({ groupId, userId, jid: altJid });
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
    if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
      logger.warn(`File pleine (${MAX_QUEUE_SIZE}), message ignoré vers ${targetId}`);
      return;
    }
    this.messageQueue.push({ sock, targetId, msg, rule });
    if (!this.isProcessing) {
      this.processQueue().catch(e => logger.error("processQueue crash:", e));
    }
  }

  addToBatch(sock, rule, msg, targets) {
    const ruleId = rule._id.toString();
    if (!this.batchBuffer[ruleId]) {
      this.batchBuffer[ruleId] = { messages: [], timer: null, forceTimer: null, targets: [], sock, rule };
    }
    const batch = this.batchBuffer[ruleId];
    batch.messages.push(cloneMsg(msg));
    batch.targets = targets;
    batch.sock = sock;
    batch.rule = rule;

    if (!batch.forceTimer) {
      batch.forceTimer = setTimeout(() => {
        logger.info(`Batch force-déclenché pour "${batch.rule.name}" après ${MAX_BATCH_WAIT_MS}ms (${batch.messages.length} msg(s))`);
        this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e));
      }, MAX_BATCH_WAIT_MS);
    }

    if (batch.messages.length >= MAX_BATCH_SIZE) {
      if (batch.timer) clearTimeout(batch.timer);
      logger.info(`Batch déclenché par taille max pour "${batch.rule.name}" (${batch.messages.length} msg(s))`);
      this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e));
      return;
    }

    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(() => this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e)), BATCH_DELAY_MS);
  }

  async processBatch(ruleId) {
    const batch = this.batchBuffer[ruleId];
    if (!batch || !batch.messages.length) {
      if (batch) delete this.batchBuffer[ruleId];
      return;
    }
    delete this.batchBuffer[ruleId];

    if (batch.timer) clearTimeout(batch.timer);
    if (batch.forceTimer) clearTimeout(batch.forceTimer);

    logger.info(`Batch "${batch.rule.name}": ${batch.messages.length} msg(s) → ${batch.targets.length} groupe(s)`);

    for (const targetId of batch.targets) {
      for (const msg of batch.messages) {
        this.queueMessage(batch.sock, targetId, msg, batch.rule);
      }
    }
  }

  async processQueue() {
    this.isProcessing = true;
    this.stopRequested = false;
    let batchLogTimer = Date.now();
    while (this.messageQueue.length) {
      if (this.stopRequested) {
        logger.info("Arrêt du forwarding demandé pendant l'envoi.");
        this.messageQueue = [];
        this.stopRequested = false;
        break;
      }

      const now = Date.now();
      this.errorWindow = this.errorWindow.filter((t) => now - t < 120000);
      if (this.errorWindow.length > 5) {
        this.adaptiveDelay = Math.min(this.adaptiveDelay + 0.5, 5);
      } else if (now - this.lastErrorTime > 60000) {
        this.adaptiveDelay = Math.max(this.adaptiveDelay - 0.1, 1);
      }

      const nextItem = this.messageQueue[0];
      if (nextItem?.rule?.forwardToMembers) {
        const elapsed = Date.now() - this.burstStartTime;
        if (elapsed >= BURST_DURATION_MS) {
          const cooldownMin = COOLDOWN_DURATION_MS / 60000;
          logger.info(`Burst inbox terminé (${(elapsed/3600000).toFixed(1)}h), pause de ${cooldownMin}min...`);
          await this.sleep(COOLDOWN_DURATION_MS);
          this.burstStartTime = Date.now();
          logger.info("Reprise du burst inbox après pause.");
          continue;
        }
      }

      if (!this.canSend()) {
        logger.warn(`File: ${this.messageQueue.length} en attente, limite atteinte, pause 10s...`);
        await this.sleep(10000);
        continue;
      }

      const { sock, targetId, msg, rule } = this.messageQueue.shift();

      if (!sock) {
        logger.warn("WhatsApp socket null pour un message. Passage au suivant.");
        continue;
      }

      try {
        await sock.sendPresenceUpdate("composing", targetId);

        const baseDelay = 3000 + Math.floor(Math.random() * 4000);
        const delay = Math.round(baseDelay * this.adaptiveDelay);
        await this.sleep(delay);

        await this.forwardMessage(sock, targetId, msg, rule);

        this.messageWindow.push(Date.now());
        this.messageCount++;

        if (Date.now() - batchLogTimer > 10000) {
          logger.info(`File: ${this.messageQueue.length} restant(s), ${this.messageCount} envoyé(s)`);
          batchLogTimer = Date.now();
        }
      } catch (err) {
        logger.error(`Erreur envoi vers ${targetId}: ${err.message}`);
        this.errorWindow.push(Date.now());
        this.lastErrorTime = Date.now();
        const errMsg = err.message || "";
        if (errMsg.includes("Closed") || errMsg.includes("closed") || errMsg.includes("not opened") || errMsg.includes("conflict")) {
          logger.warn("Erreur socket détectée lors de l'envoi, message ignoré.");
        }
      }
    }
    this.isProcessing = false;
    if (this.memCache.size > 0) {
      this.memCache.clear();
    }
  }

  getMessageText(msgContent) {
    if (!msgContent) return "";
    for (const field of ["conversation", "extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"]) {
      const text = msgContent[field]?.text || msgContent[field]?.caption || (field === "conversation" ? msgContent[field] : null);
      if (text) return text;
    }
    if (msgContent.buttonsResponseMessage?.selectedButtonId) return msgContent.buttonsResponseMessage.selectedButtonId;
    if (msgContent.listResponseMessage?.singleSelectReply?.selectedRowId) return msgContent.listResponseMessage.singleSelectReply.selectedRowId;
    if (msgContent.templateButtonReplyMessage?.selectedId) return msgContent.templateButtonReplyMessage.selectedId;
    return "";
  }

  async getCachedMedia(msg) {
    const cacheKey = msg.key?.id;
    if (!cacheKey) {
      logger.warn(`[MEDIA] Pas de cacheKey pour ce message, téléchargement direct`);
      return this.downloadAndCacheMedia(msg, null);
    }

    const cachePath = this.getMediaCachePath(cacheKey);

    if (this.memCache.has(cacheKey)) {
      logger.info(`[MEDIA] MemCache HIT pour ${cacheKey}`);
      return this.memCache.get(cacheKey);
    }

    if (fs.existsSync(cachePath)) {
      logger.info(`[MEDIA] DiskCache HIT pour ${cacheKey}`);
      try {
        const data = fs.readFileSync(cachePath);
        this.memCache.set(cacheKey, data);
        logger.info(`[MEDIA] Chargé depuis disque: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
        return data;
      } catch (err) {
        logger.warn(`[MEDIA] Erreur lecture disque pour ${cacheKey}: ${err.message}. Re-téléchargement.`);
      }
    }

    return this.downloadAndCacheMedia(msg, cacheKey);
  }

  async downloadAndCacheMedia(msg, cacheKey) {
    const msgContent = getRealMessage(msg.message);
    const content = msgContent?.imageMessage || msgContent?.videoMessage || msgContent?.audioMessage || msgContent?.documentMessage || msgContent?.stickerMessage;
    if (content?.fileLength && content.fileLength > MAX_MEDIA_SIZE) {
      logger.warn(`[MEDIA] Fichier trop volumineux: ${(content.fileLength / 1024 / 1024).toFixed(1)}MB, max ${MAX_MEDIA_SIZE / 1024 / 1024}MB. Envoi du texte uniquement.`);
      return null;
    }

    logger.info(`[MEDIA] Téléchargement média...`);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const data = await downloadMediaMessage(msg, "buffer", {}, { logger, abortSignal: abortController.signal });
      logger.info(`[MEDIA] Téléchargé: ${Buffer.isBuffer(data) ? (data.length / 1024 / 1024).toFixed(1) + "MB" : typeof data}`);

      if (cacheKey && Buffer.isBuffer(data)) {
        const cachePath = this.getMediaCachePath(cacheKey);
        try {
          fs.writeFileSync(cachePath, data);
          this.memCache.set(cacheKey, data);
          if (this.memCache.size > MAX_MEM_CACHE) {
            const firstKey = this.memCache.keys().next().value;
            this.memCache.delete(firstKey);
          }
          this.cleanMediaCache();
          logger.info(`[MEDIA] Sauvegardé sur disque: ${cacheKey}.bin (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err) {
          logger.warn(`[MEDIA] Échec sauvegarde disque pour ${cacheKey}: ${err.message}`);
        }
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        logger.warn(`[MEDIA] Téléchargement annulé (timeout ${DOWNLOAD_TIMEOUT_MS / 1000}s)`);
      } else {
        logger.warn(`[MEDIA] Échec téléchargement: ${err.message}`);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _sendAndTrack(sock, targetId, content, msg, rule) {
    try {
      const result = await sock.sendMessage(targetId, content);
      if (result?.key?.id && msg?.key?.id) {
        try {
          await ForwardedMessage.create({
            userId: rule.userId,
            sourceMsgId: msg.key.id,
            sourceGroupId: msg.key.remoteJid,
            targetGroupId: targetId,
            targetMsgId: result.key.id,
            ruleId: rule._id?.toString() || "auto",
          });
        } catch (e) {
          logger.warn(`Erreur enregistrement mapping forward: ${e.message}`);
        }
      }
      return result;
    } catch (err) {
      logger.warn(`[SEND] Échec envoi vers ${targetId}: ${err.message}`);
      throw err;
    }
  }

  async handleMessageDeletion(sock, protocolKey, userId) {
    try {
      const originalMsgId = protocolKey.id;
      const sourceGroupId = protocolKey.remoteJid;
      if (!originalMsgId || !sourceGroupId) return;

      logger.info(`Suppression détectée: msg=${originalMsgId} dans ${sourceGroupId}`);

      const forwarded = await ForwardedMessage.find({
        sourceMsgId: originalMsgId,
        sourceGroupId,
        userId,
      });

      if (!forwarded.length) {
        logger.debug(`Aucun forward trouvé pour msg=${originalMsgId}`);
        return;
      }

      logger.info(`Propagation suppression: ${forwarded.length} copie(s) à supprimer`);
      for (const fwd of forwarded) {
        try {
          await sock.sendMessage(fwd.targetGroupId, {
            delete: { id: fwd.targetMsgId, remoteJid: fwd.targetGroupId, fromMe: true },
          });
          logger.info(`Supprimé dans ${fwd.targetGroupId} (msg=${fwd.targetMsgId})`);
        } catch (err) {
          logger.warn(`Échec suppression dans ${fwd.targetGroupId}: ${err.message}`);
        }
      }

      await ForwardedMessage.deleteMany({
        sourceMsgId: originalMsgId,
        sourceGroupId,
        userId,
      });

      await logger.db({
        userId,
        type: "system",
        action: "message_deletion_propagated",
        details: {
          sourceMsgId: originalMsgId,
          sourceGroupId,
          count: forwarded.length,
        },
      });
    } catch (err) {
      logger.error(`Erreur handleMessageDeletion: ${err.message}`);
    }
  }

  async forwardMessage(sock, targetId, msg, rule) {
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    if (!msgContent) return;

    const msgType = this.getMessageType(msgContent);
    const caption = this.getMessageText(msgContent);

    if (rule.includeMedia && msgType && msgType !== "protocolMessage") {
      logger.info(`[MEDIA] Type=${msgType}, caption="${caption.substring(0, 40)}", cible=${targetId.split("@")[0]}`);
      try {
        switch (msgType) {
          case "imageMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { image: stream, caption }, msg, rule);
            return;
          }
          case "videoMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { video: stream, caption }, msg, rule);
            return;
          }
          case "ptvMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { video: stream, ptv: true }, msg, rule);
            return;
          }
          case "audioMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            const ptt = !!msgContent.audioMessage?.ptt;
            await this._sendAndTrack(sock, targetId, { audio: stream, ptt }, msg, rule);
            return;
          }
          case "documentMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            const doc = msgContent.documentMessage;
            await this._sendAndTrack(sock, targetId, {
              document: stream,
              fileName: doc?.fileName || "document",
              mimetype: doc?.mimetype || "application/octet-stream",
              caption,
            }, msg, rule);
            return;
          }
          case "stickerMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { sticker: stream }, msg, rule);
            return;
          }
          case "pollCreationMessage": {
            const poll = msgContent.pollCreationMessage;
            await this._sendAndTrack(sock, targetId, {
              poll: {
                name: poll.name,
                values: poll.options.map(o => o.optionName),
                selectableOptionsCount: poll.selectableOptionsCount
              }
            }, msg, rule);
            return;
          }
          case "locationMessage": {
            const loc = msgContent.locationMessage;
            await this._sendAndTrack(sock, targetId, {
              location: {
                degreesLatitude: loc.degreesLatitude,
                degreesLongitude: loc.degreesLongitude,
                name: loc.name || "",
                address: loc.address || ""
              }
            }, msg, rule);
            return;
          }
          case "contactMessage": {
            const con = msgContent.contactMessage;
            await this._sendAndTrack(sock, targetId, {
              contacts: {
                displayName: con.displayName,
                contacts: [{ vcard: con.vcard }]
              }
            }, msg, rule);
            return;
          }
          case "contactsArrayMessage": {
            const con = msgContent.contactsArrayMessage;
            await this._sendAndTrack(sock, targetId, {
              contacts: {
                displayName: con.displayName,
                contacts: con.contacts.map(c => ({ vcard: c.vcard }))
              }
            }, msg, rule);
            return;
          }
          default: {
            if (caption) {
              await this._sendAndTrack(sock, targetId, { text: caption }, msg, rule);
              return;
            }
            try {
              const stream = await this.getCachedMedia(msg);
              if (stream) {
                await this._sendAndTrack(sock, targetId, { document: stream, fileName: "media", mimetype: "application/octet-stream" }, msg, rule);
              }
            } catch {}
            return;
          }
        }
      } catch (err) {
        logger.warn(`[MEDIA] Échec média: ${err.message}`);
      }
    }

    if (caption) {
      await this._sendAndTrack(sock, targetId, { text: caption }, msg, rule);
    } else {
      logger.debug(`[MEDIA] Aucun média ni caption à envoyer vers ${targetId.split("@")[0]}`);
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

  getMediaLabel(msgType) {
    const labels = {
      "imageMessage": "📷 Image",
      "videoMessage": "🎬 Vidéo",
      "ptvMessage": "🎬 Vidéo",
      "audioMessage": "🎵 Audio",
      "documentMessage": "📄 Document",
      "stickerMessage": "🏷️ Sticker",
      "pollCreationMessage": "📊 Sondage",
      "locationMessage": "📍 Localisation",
      "contactMessage": "👤 Contact",
      "contactsArrayMessage": "👥 Contacts",
      "conversation": "💬 Texte",
      "extendedTextMessage": "💬 Texte",
    };
    return labels[msgType] || `📎 ${msgType.replace("Message", "")}`;
  }

  emitActivity(rule, msg, senderJid, targetCount) {
    if (!io) return;
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    const msgType = this.getMessageType(msgContent) || "inconnu";
    const msgPreview = this.getMessageText(msgContent);
    const displayMsg = msgPreview || this.getMediaLabel(msgType);
    const data = {
      ruleName: rule.name,
      sender: senderJid.split("@")[0],
      message: displayMsg.substring(0, 80),
      type: msgType,
      mediaLabel: this.getMediaLabel(msgType),
      targets: targetCount,
      masterGroup: rule.masterGroup,
      time: new Date().toISOString(),
    };
    logger.info(`Activité forwarding: "${rule.name}" → ${targetCount} cible(s), ${data.mediaLabel}, sender: ${senderJid.split("@")[0]}`);
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
    logger.info(`startMasterPolling appelé pour user=${userId} - mode temps réel actif`);
  }

  stopMasterPolling(userId) {
    logger.info(`stopMasterPolling appelé pour user=${userId}`);
  }
}

module.exports = new BroadcastManager();
