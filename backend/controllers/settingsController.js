const Setting = require("../models/Setting");
const whatsappService = require("../services/whatsappService");
const config = require("../config");
const logger = require("../utils/logger");

exports.get = async (req, res) => {
  try {
    let settings = await Setting.findOne({ userId: req.user._id });
    if (!settings) {
      settings = await Setting.create({ userId: req.user._id });
    }
    res.json({ settings });
  } catch (err) {
    logger.error("Erreur get settings:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.update = async (req, res) => {
  try {
    const allowedFields = [
      "prefix", "rateLimitMessagesPerMinute", "rateLimitDelayBetween",
      "rateLimitDailyLimit", "moderationEnabled", "autoRejectCalls", "welcomeMessage",
      "forwardingKeyword", "masterGroupKeyword",
      "autoReplies", "telegramToken", "telegramChatId",
      "notifyOnDisconnect", "notifyOnError", "notifyOnNewUser",
      "webhookUrl", "webhookApiKey",
    ];
    const update = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }
    const settings = await Setting.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update },
      { new: true, upsert: true }
    );
    res.json({ settings });
  } catch (err) {
    logger.error("Erreur update settings:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.consoleAccess = async (req, res) => {
  try {
    const userId = req.user._id;
    const session = await whatsappService._getSessionDoc(userId);
    const userPhone = session?.phone || null;

    let allowed = false;
    if (userPhone && config.consoleAllowedPhones.length > 0) {
      allowed = config.consoleAllowedPhones.includes(userPhone);
    }

    res.json({ allowed, phone: userPhone });
  } catch (err) {
    logger.error("Erreur consoleAccess:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};
