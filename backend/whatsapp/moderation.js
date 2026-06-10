const logger = require("../utils/logger");
const Member = require("../models/Member");

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

    // Modération active sur TOUS les groupes (contrôlé par moderationEnabled dans Settings)
    const rawParticipant = msg.key.participant || msg.key.remoteJid;
    if (!rawParticipant) return;
    const participant = rawParticipant.split("@")[0].split(":")[0] + "@" + (rawParticipant.split("@")[1] || "s.whatsapp.net");

    // Vérifier si l'expéditeur est admin (on compare sans device ID)
    const senderPhone = participant.split("@")[0].split(":")[0];
    let isAdmin = false;
    const member = await Member.findOne({ groupId: from, jid: { $regex: `^${senderPhone}` } });
    if (member?.isAdmin || member?.isSuperAdmin) {
      isAdmin = true;
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

    if (!msgType) {
      return;
    } else if (forbiddenMediaTypes.includes(msgType)) {
      isDisallowed = true;
      reason = "les médias (photo, vidéo, audio, document, sticker, etc.)";
    } else if (hasLink) {
      isDisallowed = true;
      reason = "les liens";
    } else if (msgType !== "conversation" && msgType !== "extendedTextMessage") {
      isDisallowed = true;
      reason = "les messages non-texte";
    }

    if (isDisallowed) {
      try {
        // Supprimer immédiatement (si bot admin), puis avertir
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (delErr) {
          logger.warn(`Suppression impossible dans ${from}: ${delErr.message}. Le bot n'est peut-être pas admin.`);
        }

        await sock.sendMessage(from, {
          text: `@${participant.split("@")[0]} Désolé, ${reason} ne sont pas autorisés dans ce groupe. Seul le texte simple est permis pour les membres.`,
          mentions: [participant],
        });

        logger.info(`Message modéré (${reason}) de ${participant} dans ${from}`);
        await logger.db({
          userId,
          type: "moderation",
          action: "message_deleted",
          details: { reason, from, participant },
        });
      } catch (err) {
        logger.error(`Erreur modération: ${err.message || err}`);
      }
    }
  }


}

module.exports = new Moderation();
