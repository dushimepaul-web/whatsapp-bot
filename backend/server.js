const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const config = require("./config");
const connectDB = require("./config/database");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { setupSocket } = require("./sockets");
const logger = require("./utils/logger");
const WhatsappSession = require("./models/WhatsappSession");
const ForwardingRule = require("./models/ForwardingRule");
const whatsappService = require("./services/whatsappService");
const broadcastManager = require("./whatsapp/broadcastManager");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(apiLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), mongo: mongoose.connection.readyState === 1 });
});
app.use("/api/auth", require("./routes/auth"));
app.use("/api/whatsapp", require("./routes/whatsapp"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/forwarding", require("./routes/forwarding"));
app.use("/api/broadcast", require("./routes/broadcast"));
app.use("/api/members", require("./routes/members"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/logs", require("./routes/logs"));
app.use("/api/webhook", require("./routes/webhook"));

const frontendBuild = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Endpoint introuvable" });
    res.sendFile(path.join(frontendBuild, "index.html"));
  });
}

app.use((err, req, res, next) => {
  logger.error("Erreur non gérée:", err.message || err);
  res.status(500).json({ error: "Erreur interne" });
});

const restoreSessions = async () => {
  try {
    const activeSessions = await whatsappService.getAllActiveSessions();
    const disconnectedSessions = await WhatsappSession.find({
      status: "disconnected",
      phone: { $ne: null, $ne: "" },
    });
    const allToRestore = [...activeSessions, ...disconnectedSessions];
    if (allToRestore.length === 0) {
      logger.info("Aucune session WhatsApp à restaurer");
      return;
    }
    logger.info(`Restauration de ${allToRestore.length} session(s) WhatsApp...`);
    for (const session of allToRestore) {
      logger.info(`Reconnexion session user=${session.userId} (${session.phone || "inconnu"})...`);
      session.status = "connecting";
      await session.save();
      whatsappService.connect(session.userId, false).catch(e =>
        logger.error(`Échec reconnexion auto WhatsApp user=${session.userId}:`, e.message || e)
      );
    }
  } catch (err) {
    logger.error("Erreur restauration sessions:", err);
  }
};

const start = async () => {
  await connectDB();
  setupSocket(server);
  server.listen(config.port, () => {
    logger.info(`Serveur démarré sur http://localhost:${config.port}`);
    logger.info(`Environnement: ${config.env}`);
  });

  setTimeout(restoreSessions, 2000);

  // Nettoyage règle en double
  setTimeout(async () => {
    try {
      const deleted = await ForwardingRule.deleteOne({ name: "Master vers NUFOTEC", isActive: false });
      if (deleted.deletedCount > 0) logger.info("Ancienne règle inactive supprimée");
    } catch (e) { logger.error("Erreur nettoyage règle:", e); }
  }, 3000);

  // Sync auto des groupes toutes les 30 minutes
  setInterval(async () => {
    const count = await whatsappService.syncAllGroups();
    if (count > 0) logger.info(`Sync auto terminée pour ${count} session(s)`);
  }, 30 * 60 * 1000);

  setInterval(() => {
    broadcastManager.cleanMediaCache();
    logger.info("Nettoyage automatique du cache média effectué");
  }, 24 * 60 * 60 * 1000);
};

start().catch(e => {
  logger.error("Échec démarrage serveur:", e);
  process.exit(1);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  logger.info("Arrêt gracieux...");
  try {
    await new Promise((resolve) => server.close(resolve));
    await whatsappService.disconnectAll();
    await mongoose.disconnect();
  } catch (err) {
    logger.error("Erreur lors de l'arrêt:", err);
  }
  logger.info("Serveur arrêté");
  process.exit(0);
}
