const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const whatsappService = require("../services/whatsappService");
const logHub = require("../utils/logHub");
const logger = require("../utils/logger");

let io = null;

const setupSocket = (server) => {
  io = new Server(server, {
    path: "/api/socket.io",
    cors: {
      origin: config.cors.origin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["polling", "websocket"],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const origin = socket.handshake.headers?.origin || "inconnu";
      if (!token) {
        logger.warn(`Socket auth échouée: token manquant (origin=${origin}, id=${socket.id})`);
        return next(new Error("Token manquant"));
      }
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findById(decoded.id);
      if (!user) {
        logger.warn(`Socket auth échouée: utilisateur introuvable (id=${decoded.id})`);
        return next(new Error("Utilisateur introuvable"));
      }
      socket.user = user;
      logger.info(`Socket auth réussie: ${user.email} (origin=${origin})`);
      next();
    } catch (err) {
      const origin = socket.handshake.headers?.origin || "inconnu";
      logger.warn(`Socket auth échouée: token invalide (origin=${origin}, erreur=${err.message})`);
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connecté: ${socket.user.email}`);
    socket.join(`user:${socket.user._id}`);

    const userId = socket.user._id;

    whatsappService.setQrCallback(userId, (qr) => {
      emitToUser(userId, "whatsapp:qr", { qr });
    });

    whatsappService.setStatusCallback(userId, (status) => {
      emitToUser(userId, "whatsapp:status", { status });
    });

    whatsappService.setPairingCodeCallback(userId, (code) => {
      emitToUser(userId, "whatsapp:pairingCode", { code });
    });

    socket.on("disconnect", (reason) => {
      logger.info(`Socket déconnecté: ${socket.user.email} (raison: ${reason})`);
    });
  });

  io.engine.on("connection_error", (err) => {
    logger.warn(`Socket.IO connection_error: ${err.message} (code=${err.code}, req=${err.req?.url})`);
  });

  logHub.on("log", (data) => {
    if (io) {
      io.emit("log:new", data);
    }
  });

  return io;
};

const getIO = () => io;

const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = { setupSocket, getIO, emitToUser, emitToAll };
