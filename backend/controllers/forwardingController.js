const ForwardingRule = require("../models/ForwardingRule");
const logger = require("../utils/logger");

const ALLOWED_FIELDS = [
  "name", "sourceGroupId", "targetGroupIds", "targetGroupPattern",
  "forwardToAllGroups", "forwardToMembers", "onlyAdmins",
  "masterGroup", "includeMedia", "isActive",
];

exports.create = async (req, res) => {
  try {
    const data = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }
    const rule = await ForwardingRule.create({ ...data, userId: req.user._id });
    res.status(201).json({ rule });
  } catch (err) {
    logger.error("Erreur création règle:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.list = async (req, res) => {
  try {
    const rules = await ForwardingRule.find({ userId: req.user._id });
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.get = async (req, res) => {
  try {
    const rule = await ForwardingRule.findOne({ _id: req.params.id, userId: req.user._id });
    if (!rule) return res.status(404).json({ error: "Règle introuvable" });
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.update = async (req, res) => {
  try {
    const data = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }
    const rule = await ForwardingRule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: data },
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: "Règle introuvable" });
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.remove = async (req, res) => {
  try {
    const rule = await ForwardingRule.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!rule) return res.status(404).json({ error: "Règle introuvable" });
    res.json({ message: "Règle supprimée" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.toggle = async (req, res) => {
  try {
    const rule = await ForwardingRule.findOne({ _id: req.params.id, userId: req.user._id });
    if (!rule) return res.status(404).json({ error: "Règle introuvable" });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};
