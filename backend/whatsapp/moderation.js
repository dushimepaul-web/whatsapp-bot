const logger = require("../utils/logger");
const Member = require("../models/Member");
const Group = require("../models/Group");

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
};

const getMessageType = (message) => {
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
  return null;
};

class Moderation {
  async handleMessage(sock, msg, from, userId) {
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    if (!msgContent) return;

    // Vérifier si le groupe est restreint
    const group = await Group.findOne({ groupId: from });
    if (!group || !group.isRestricted) return;

    const rawParticipant = msg.key.participant || msg.key.remoteJid;
    if (!rawParticipant) return;
    const participant = rawParticipant.split("@")[0].split(":")[0] + "@" + (rawParticipant.split("@")[1] || "s.whatsapp.net");

    // Vérifier si l'expéditeur est admin
    let isAdmin = false;
    const member = await Member.findOne({ groupId: from, jid: participant });
    if (member?.isAdmin || member?.isSuperAdmin) {
      isAdmin = true;
    } else {
      const altJid = participant.includes("@lid") ? participant.replace(/@lid/, "@s.whatsapp.net") : participant.replace(/@s\.whatsapp\.net/, "@lid");
      const altMember = await Member.findOne({ groupId: from, jid: altJid });
      if (altMember?.isAdmin || altMember?.isSuperAdmin) {
        isAdmin = true;
      }
    }
    if (isAdmin) return;

    const msgType = getMessageType(msgContent);
    
    // Récupérer le texte pour vérifier les liens
    const text = msgContent?.conversation || 
                 msgContent?.extendedTextMessage?.text || 
                 msgContent?.imageMessage?.caption || 
                 msgContent?.videoMessage?.caption || 
                 msgContent?.documentMessage?.caption || "";
                 
    const hasLink = /https?:\/\/[^\s]+|www\.[^\s]+/i.test(text);

    let isDisallowed = false;
    let reason = "";

    // Types interdits
    const forbiddenMediaTypes = [
      "imageMessage", "videoMessage", "audioMessage",
      "documentMessage", "stickerMessage", "ptvMessage",
      "pollCreationMessage", "locationMessage",
      "contactMessage", "contactsArrayMessage"
    ];

    if (forbiddenMediaTypes.includes(msgType)) {
      isDisallowed = true;
      reason = "les médias (photo, vidéo, audio, document, sticker, etc.)";
    } else if (hasLink) {
      isDisallowed = true;
      reason = "les liens";
    } else if (msgType && msgType !== "conversation" && msgType !== "extendedTextMessage") {
      // Si c'est un autre type inconnu mais présent
      isDisallowed = true;
      reason = "les messages non-texte";
    }

    if (isDisallowed) {
      try {
        const warningText = `@${participant.split("@")[0]} Désolé, ${reason} ne sont pas autorisés dans ce groupe. Seul le texte simple est permis pour les membres.`;
        
        await sock.sendMessage(from, {
          text: warningText,
          mentions: [participant],
        });

        const botIsAdmin = await this.isGroupAdmin(sock, from, sock.user?.id);
        if (botIsAdmin) {
          await sock.sendMessage(from, { delete: msg.key });
        } else {
          logger.warn("Le bot n'est pas admin dans ce groupe, suppression impossible");
        }

        logger.info(`Message modéré (${reason}) de ${participant} dans ${from}`);
        await logger.db({
          userId,
          type: "moderation",
          action: "message_deleted",
          details: { reason, from, participant, deleted: botIsAdmin },
        });
      } catch (err) {
        logger.error(`Erreur modération: ${err.message || err}`);
      }
    }
  }

  async isGroupAdmin(sock, groupId, participantJid) {
    try {
      if (!participantJid) return false;
      const cleanJid = participantJid.split("@")[0].split(":")[0] + "@" + (participantJid.split("@")[1] || "s.whatsapp.net");
      let member = await Member.findOne({ groupId, jid: cleanJid });
      if (member?.isAdmin || member?.isSuperAdmin) return true;
      
      const altJid = cleanJid.includes("@lid") ? cleanJid.replace(/@lid/, "@s.whatsapp.net") : cleanJid.replace(/@s\.whatsapp\.net/, "@lid");
      member = await Member.findOne({ groupId, jid: altJid });
      return member?.isAdmin || member?.isSuperAdmin || false;
    } catch (e) {
      logger.warn("Erreur isGroupAdmin:", e);
      return false;
    }
  }
}

module.exports = new Moderation();
