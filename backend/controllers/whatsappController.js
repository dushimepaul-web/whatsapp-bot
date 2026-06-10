const whatsappService = require("../services/whatsappService");
const WhatsappSession = require("../models/WhatsappSession");
const logger = require("../utils/logger");

exports.getStatus = async (req, res) => {
  try {
    const status = await whatsappService.getStatus();
    const session = await whatsappService.getSession();
    res.json({ ...status, session });
  } catch (err) {
    logger.error({ err: err.message || err, stack: err.stack }, "Erreur statut");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.connect = async (req, res) => {
  try {
    const userId = req.user._id;

    if (whatsappService.getSocket()) {
      await whatsappService.disconnect();
    }

    let session = await whatsappService.getSession();
    if (!session) {
      session = await WhatsappSession.create({ userId });
    }

    session.status = "connecting";
    session.qrCode = null;
    await session.save();

    whatsappService.connect(userId, true).catch((err) => {
      logger.error({ err: err.message || err }, "Erreur connexion WhatsApp");
    });

    res.json({ message: "Connexion initiée", session });
  } catch (err) {
    logger.error({ err: err.message || err, stack: err.stack }, "Erreur connect");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.disconnect = async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ message: "WhatsApp déconnecté" });
  } catch (err) {
    logger.error("Erreur disconnect:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.getQr = async (req, res) => {
  try {
    const session = await whatsappService.getSession();
    res.json({ qr: session?.qrCode || null });
  } catch (err) {
    logger.error("Erreur getQr:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.pair = async (req, res) => {
  try {
    const userId = req.user._id;
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Numéro requis" });

    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length < 7) return res.status(400).json({ error: "Numéro invalide" });

    if (whatsappService.getSocket()) {
      await whatsappService.disconnect();
    }

    let session = await whatsappService.getSession();
    if (!session) {
      session = await WhatsappSession.create({ userId });
    }

    session.status = "connecting";
    session.qrCode = null;
    session.pairingCode = null;
    await session.save();

    whatsappService.connect(userId, true, cleaned).catch((err) => {
      logger.error({ err: err.message || err }, "Erreur appariement WhatsApp");
    });

    res.json({ message: "Code d'appariement demandé", session });
  } catch (err) {
    logger.error({ err: err.message || err, stack: err.stack }, "Erreur pair");
    res.status(500).json({ error: "Erreur serveur" });
  }
};
