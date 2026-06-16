const logger = require("../utils/logger");
const Member = require("../models/Member");
const Group = require("../models/Group");
const Setting = require("../models/Setting");

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

class Moderation {
  async handleMessage(sock, msg, from, userId) {
    const rawContent = msg.message;
    if (!rawContent) return;

    if (msg.messageStubType !== undefined && msg.messageStubType !== null) return;

    const group = await Group.findOne({ groupId: from, userId }).lean();
    if (!group?.isRestricted) return;

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
    if (!msgContent || msgContent.protocolMessage || msgContent.senderKeyDistributionMessage) return;
    const isText = msgContent?.conversation || msgContent?.extendedTextMessage;
    const isMedia = !!(msgContent?.imageMessage || msgContent?.videoMessage ||
                    msgContent?.audioMessage || msgContent?.documentMessage ||
                    msgContent?.stickerMessage || msgContent?.ptvMessage);
    const text = getRawText(msgContent);
    const hasLink = /https?:\/\/[^\s]+|www\.[^\s]+/i.test(text);

    let isDisallowed = false;
    let reason = "";

    if (isMedia) {
      isDisallowed = true;
      reason = "media";
    } else if (isText && hasLink) {
      isDisallowed = true;
      reason = "link";
    }

    if (isDisallowed) {
      try {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (delErr) {
          logger.warn(`Suppression impossible dans ${from}: ${delErr.message}. Le bot n'est peut-être pas admin.`);
        }

        const warning = reason === "media"
          ? `@${senderPhone} Désolé, les médias (photo, vidéo, audio, document, sticker, etc.) ne sont pas autorisés dans ce groupe. Seul le texte simple est permis pour les membres.`
          : `@${senderPhone} Désolé, les liens ne sont pas autorisés dans ce groupe.`;
        await sock.sendMessage(from, { text: warning, mentions: [rawParticipant] });

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
