const groupManager = require("../whatsapp/groupManager");
const logger = require("../utils/logger");

exports.list = async (req, res) => {
  try {
    let { page = 1, limit = 50, search } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const result = await groupManager.getGroups({ page, limit, search });
    logger.info(`GET /groups: ${result.groups.length} groupes retournés (page ${page}/${result.pages})`);
    res.json(result);
  } catch (err) {
    logger.error(`Erreur liste groupes: ${err.message}`);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.get = async (req, res) => {
  try {
    const group = await groupManager.getGroupById(req.params.id);
    res.json({ group });
  } catch (err) {
    if (err.message === "Groupe introuvable") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.members = async (req, res) => {
  try {
    const members = await groupManager.getGroupMembers(req.params.id);
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.admins = async (req, res) => {
  try {
    const admins = await groupManager.getGroupAdmins(req.params.id);
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.stats = async (req, res) => {
  try {
    const stats = await groupManager.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.refresh = async (req, res) => {
  try {
    await groupManager.refreshGroups();
    res.json({ message: "Groupes synchronisés" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.toggleVisibility = async (req, res) => {
  try {
    const { isVisible } = req.body;
    const Group = require("../models/Group");
    const group = await Group.findOneAndUpdate(
      { groupId: req.params.id },
      { isVisible },
      { new: true }
    );
    if (!group) return res.status(404).json({ error: "Groupe introuvable" });
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.toggleRestrict = async (req, res) => {
  try {
    const { isRestricted } = req.body;
    const Group = require("../models/Group");
    const group = await Group.findOneAndUpdate(
      { groupId: req.params.id },
      { isRestricted },
      { new: true }
    );
    if (!group) return res.status(404).json({ error: "Groupe introuvable" });
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
};
