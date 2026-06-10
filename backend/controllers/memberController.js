const Member = require("../models/Member");
const Group = require("../models/Group");
const whatsappService = require("../services/whatsappService");
const logger = require("../utils/logger");
const { escapeRegex } = require("../utils/helpers");

exports.list = async (req, res) => {
  try {
    let { groupId, search, page = 1, limit = 50 } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const query = {};
    if (groupId) query.groupId = groupId;
    if (search) {
      const safe = escapeRegex(search);
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { pushName: { $regex: safe, $options: "i" } },
        { jid: { $regex: safe, $options: "i" } },
      ];
    }
    const total = await Member.countDocuments(query);
    const members = await Member.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ members, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("Erreur liste membres:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { jids, text } = req.body;
    if (!jids?.length || !text) {
      return res.status(400).json({ error: "Destinataires et texte requis" });
    }
    const sock = whatsappService.getSocket();
    if (!sock) return res.status(400).json({ error: "WhatsApp non connecté" });

    const results = [];
    for (const jid of jids) {
      try {
        // Anti-ban: Simulation d'écriture
        await sock.sendPresenceUpdate("composing", jid);
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));

        await sock.sendMessage(jid, { text });
        results.push({ jid, success: true });

        // Anti-ban: Délai variable après envoi (1.5 à 3.5 secondes)
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000));
      } catch (err) {
        results.push({ jid, success: false, error: err.message });
      }
    }

    await logger.db({
      userId: req.user._id,
      type: "message",
      action: "member_message_sent",
      details: { count: jids.length, success: results.filter((r) => r.success).length },
    });

    res.json({ results });
  } catch (err) {
    logger.error("Erreur envoi message membre:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};
