const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const connectDB = require("./config/database");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { setupSocket } = require("./sockets");
const logger = require("./utils/logger");
const whatsappService = require("./services/whatsappService");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.cors.origin, credentials: true }));
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

const start = async () => {
  await connectDB();
  setupSocket(server);
  server.listen(config.port, () => {
    logger.info(`Serveur démarré sur http://localhost:${config.port}`);
    logger.info(`Environnement: ${config.env}`);
  });
};

start().catch(e => {
  logger.error("Échec démarrage serveur:", e);
  process.exit(1);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  logger.info("Arrêt gracieux...");
  server.close();
  await whatsappService.disconnect();
  await mongoose.disconnect();
  logger.info("Serveur arrêté");
  process.exit(0);
}
