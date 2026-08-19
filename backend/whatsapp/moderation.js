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

const WARNING_COOLDOWN_MS = 60 * 1000;
const POLICY_CACHE_TTL_MS = 60 * 1000;

class Moderation {
  constructor() {
    this._warningCooldowns = new Map();
    this._policyCache = new Map();
  }

  clearCache(groupId, userId) {
    if (groupId) {
      this._policyCache.delete(`${userId}:${groupId}`);
    } else {
      this._policyCache.clear();
    }
  }

  _shouldWarn(groupId, participant) {
    const key = `${groupId}:${participant}`;
    const now = Date.now();
    const last = this._warningCooldowns.get(key) || 0;
    if (now - last < WARNING_COOLDOWN_MS) return false;
    this._warningCooldowns.set(key, now);
    if (this._warningCooldowns.size > 1000) {
      for (const [k, t] of this._warningCooldowns) {
        if (now - t > WARNING_COOLDOWN_MS * 10) this._warningCooldowns.delete(k);
      }
    }
    return true;
  }

  async handleMessage(sock, msg, from, userId) {
    const rawContent = msg.message;
    if (!rawContent) return;

    const cacheKey = `${userId}:${from}`;
    let policy = this._policyCache.get(cacheKey);
    if (!policy || Date.now() - policy.ts >= POLICY_CACHE_TTL_MS) {
      const [group, members] = await Promise.all([
        Group.findOne({ groupId: from, userId }).lean(),
        Member.find({ groupId: from, userId }).select("jid isAdmin isSuperAdmin").lean(),
      ]);
      const adminJids = new Set();
      for (const m of members) {
        if (m.isAdmin || m.isSuperAdmin) adminJids.add(m.jid.split(":")[0]);
      }
      policy = {
        isRestricted: !!group?.isRestricted,
        botIsAdmin: !!group?.botIsAdmin,
        adminJids,
        ts: Date.now(),
      };
      this._policyCache.set(cacheKey, policy);
    }

    if (!policy.isRestricted || !policy.botIsAdmin) return;

    const rawParticipant = msg.key.participant || msg.key.remoteJid;
    if (!rawParticipant) return;
    if (policy.adminJids.has(rawParticipant.split(":")[0])) return;

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
        await sock.sendMessage(from, { delete: msg.key });

        const warningSent = this._shouldWarn(from, rawParticipant);
        if (warningSent) {
          const phoneLabel = rawParticipant.split("@")[0];
          await sock.sendMessage(from, {
            text: `@${phoneLabel} Désolé, ${warningText}.`,
            mentions: [rawParticipant],
          });
        }

        logger.info(
          `Message modéré (${reason}) de ${rawParticipant} dans ${from}${warningSent ? "" : " (avertissement ignoré - cooldown)"}`
        );
        logger
          .db({
            userId,
            type: "moderation",
            action: "message_deleted",
            details: { reason, from, participant: rawParticipant, warned: warningSent },
          })
          .catch(() => {});
      } catch (err) {
        logger.error(`Erreur modération: ${err.message || err}`);
      }
    }
  }
}

module.exports = new Moderation();
