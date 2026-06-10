const Setting = require("../models/Setting");
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
