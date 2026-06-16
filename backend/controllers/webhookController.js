const Setting = require("../models/Setting");
const Group = require("../models/Group");
const Member = require("../models/Member");
const whatsappService = require("../services/whatsappService");
const logger = require("../utils/logger");

exports.send = async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    const { to, text, type, groupId } = req.body;

    if (!apiKey) return res.status(401).json({ error: "API key requise (header: x-api-key)" });
    if (!to && !groupId) return res.status(400).json({ error: "Destinataire requis (to ou groupId)" });
    if (!text) return res.status(400).json({ error: "Texte requis" });

    const setting = await Setting.findOne({ webhookApiKey: apiKey });
    if (!setting) return res.status(403).json({ error: "API key invalide" });

    const userId = setting.userId;
    const sock = whatsappService.getSocket(userId);
    if (!sock) return res.status(400).json({ error: "WhatsApp non connecté" });

    let targetJid = to;

    if (groupId && !to) {
      targetJid = groupId;
    }

    if (!targetJid.includes("@")) {
      if (targetJid.endsWith("@g.us") || targetJid.endsWith("@s.whatsapp.net")) {
      } else if (groupId) {
        targetJid = groupId;
      } else {
        targetJid = `${targetJid}@s.whatsapp.net`;
      }
    }

    let result;
    if (type === "image") {
      // Vérification SSRF pour les URLs d'image
      const isValidUrl = (str) => {
        try {
          const u = new URL(str);
          if (u.protocol !== "http:" && u.protocol !== "https:") return false;
          const host = u.hostname.toLowerCase();
          if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
          if (host.endsWith(".local") || host.endsWith(".internal")) return false;
          const parts = host.split(".").map(Number);
          if (parts.length === 4 && parts.every(p => !isNaN(p))) {
            if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return false;
            if (parts[0] === 169 && parts[1] === 254) return false;
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
            if (parts[0] === 192 && parts[1] === 168) return false;
          }
          return true;
        } catch { return false; }
      };
      if (!isValidUrl(text)) {
        return res.status(400).json({ error: "URL d'image invalide ou non autorisée" });
      }
      result = await sock.sendMessage(targetJid, {
        image: { url: text },
        caption: req.body.caption || "",
      });
    } else {
      result = await sock.sendMessage(targetJid, { text });
    }

    logger.info(`Webhook: message envoyé à ${targetJid}`);

    res.json({
      success: true,
      messageId: result?.key?.id || null,
      to: targetJid,
    });
  } catch (err) {
    logger.error("Erreur webhook send:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
};

exports.status = async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "API key requise" });

    const setting = await Setting.findOne({ webhookApiKey: apiKey });
    if (!setting) return res.status(403).json({ error: "API key invalide" });

    const userId = setting.userId;
    const status = await whatsappService.getStatus(userId);

    res.json({
      connected: status.connected,
      phone: status.phone,
      groups: await Group.countDocuments({ userId }),
      members: await Member.countDocuments({ userId }),
    });
  } catch (err) {
    logger.error("Erreur webhook status:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
};
