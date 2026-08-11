const logger = require("../utils/logger");
const Member = require("../models/Member");
const Group = require("../models/Group");

const MESSAGE_TYPE_KEYS = [
  "conversation", "extendedTextMessage",
  "imageMessage", "videoMessage", "audioMessage",
  "documentMessage", "stickerMessage", "ptvMessage",
  "contactMessage", "locationMessage", "liveLocationMessage",
  "pollMessage",
];

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
};

const getRawText = (msgContent) => {
  return msgContent?.conversation ||
         msgContent?.extendedTextMessage?.text ||
         msgContent?.imageMessage?.caption ||
         msgContent?.videoMessage?.caption ||
         msgContent?.documentMessage?.caption || "";
};

const detectMessageType = (msgContent) => {
  for (const key of MESSAGE_TYPE_KEYS) {
    if (msgContent[key]) return key;
  }
  return null;
};

class Moderation {
  async handleMessage(sock, msg, from, userId) {
    const rawContent = msg.message;
    if (!rawContent) return;

    const group = await Group.findOne({ groupId: from, userId }).lean();

    if (!group?.isRestricted || !group.botIsAdmin) return;

    const rawParticipant = msg.key.participant || msg.key.remoteJid;
    if (!rawParticipant) return;
    const senderPhone = rawParticipant.split("@")[0].split(":")[0];

    let isAdmin = false;
    const members = await Member.find({ groupId: from, userId }).lean();
    for (const member of members) {
      const memberPhone = member.jid.split("@")[0].split(":")[0];
      if (memberPhone === senderPhone && (member.isAdmin || member.isSuperAdmin)) {
        isAdmin = true;
        break;
      }
    }
    if (isAdmin) return;

    const msgContent = getRealMessage(rawContent);
    if (!msgContent) return;

    const msgType = detectMessageType(msgContent);
    const text = getRawText(msgContent);
    const isForwarded = !!msgContent?.extendedTextMessage?.contextInfo?.isForwarded ||
                        !!msgContent?.imageMessage?.contextInfo?.isForwarded ||
                        !!msgContent?.videoMessage?.contextInfo?.isForwarded ||
                        !!msgContent?.audioMessage?.contextInfo?.isForwarded ||
                        !!msgContent?.documentMessage?.contextInfo?.isForwarded;

    const isMedia = msgType && !["conversation", "extendedTextMessage"].includes(msgType);

    let isDisallowed = false;
    let reason = "";
    let warningText = "";

    if (isForwarded) {
      isDisallowed = true;
      reason = "les messages transférés ne sont pas autorisés";
      warningText = "les messages transférés ne sont pas autorisés dans ce groupe";
    } else if (isMedia) {
      isDisallowed = true;
      reason = "seul le texte original est autorisé dans ce groupe";
      warningText = "les médias (photo, vidéo, audio, document, sticker, etc.) ne sont pas autorisés dans ce groupe. Seul le texte original est permis pour les membres";
    } else if (/https?:\/\/[^\s]+|www\.[^\s]+/i.test(text)) {
      isDisallowed = true;
      reason = "les liens ne sont pas autorisés dans ce groupe";
      warningText = "les liens ne sont pas autorisés dans ce groupe";
    }

    if (isDisallowed) {
      try {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (delErr) {
          logger.warn(`Suppression impossible dans ${from}: ${delErr.message}. Le bot n'est peut-être pas admin.`);
        }

        const phoneLabel = rawParticipant.split("@")[0];
        await sock.sendMessage(from, {
          text: `@${phoneLabel} Désolé, ${warningText}.`,
          mentions: [rawParticipant],
        });

        logger.info(`Message modéré (${reason}) de ${rawParticipant} dans ${from}`);
        await logger.db({
          userId,
          type: "moderation",
          action: "message_deleted",
          details: { reason, from, participant: rawParticipant },
        });
      } catch (err) {
        logger.error(`Erreur modération: ${err.message || err}`);
      }
    }
  }
}

module.exports = new Moderation();
