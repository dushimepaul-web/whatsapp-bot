const Broadcast = require("../models/Broadcast");
const broadcastService = require("../services/broadcastService");
const logger = require("../utils/logger");

const BROADCAST_ALLOWED = [
  "type", "content", "targetGroups", "targetMembers",
  "toAllGroups", "toAllMembers",
];

exports.create = async (req, res) => {
  try {
    const data = {};
    for (const field of BROADCAST_ALLOWED) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }
    const broadcast = await Broadcast.create({ ...data, userId: req.user._id });
    res.status(201).json({ broadcast });
  } catch (err) {
    logger.error("Erreur création broadcast:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.list = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ broadcasts });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.get = async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({ _id: req.params.id, userId: req.user._id });
    if (!broadcast) return res.status(404).json({ error: "Campagne introuvable" });
    res.json({ broadcast });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.send = async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({ _id: req.params.id, userId: req.user._id });
    if (!broadcast) return res.status(404).json({ error: "Campagne introuvable" });

    broadcastService.sendBroadcast(broadcast._id, req.user._id).catch((err) => {
      logger.error("Erreur envoi broadcast:", err);
    });

    res.json({ message: "Campagne en cours d'envoi", broadcast });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.stats = async (req, res) => {
  try {
    const total = await Broadcast.countDocuments({ userId: req.user._id });
    const completed = await Broadcast.countDocuments({ userId: req.user._id, status: "completed" });
    const totalSent = await Broadcast.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, total: { $sum: "$sentCount" } } },
    ]);
    res.json({
      total,
      completed,
      totalSent: totalSent[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};
