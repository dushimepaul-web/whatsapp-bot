const Log = require("../models/Log");
const logger = require("../utils/logger");

exports.list = async (req, res) => {
  try {
    let { type, page = 1, limit = 50 } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const query = { userId: req.user._id };
    if (type) query.type = type;

    const total = await Log.countDocuments(query);
    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("Erreur liste logs:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.stats = async (req, res) => {
  try {
    const stats = await Log.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.deleteAll = async (req, res) => {
  try {
    await Log.deleteMany({ userId: req.user._id });
    res.json({ message: "Logs supprimés" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};
