const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const whatsappService = require("../services/whatsappService");
const broadcastManager = require("../whatsapp/broadcastManager");
const logger = require("../utils/logger");

let io = null;

const setupSocket = (server) => {
  io = new Server(server, {
    cors: { origin: config.cors.origin, methods: ["GET", "POST"] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Token manquant"));
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error("Utilisateur introuvable"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connecté: ${socket.user.email}`);

    socket.join(`user:${socket.user._id}`);

    socket.on("disconnect", () => {
      logger.info(`Socket déconnecté: ${socket.user.email}`);
    });
  });

  whatsappService.setQrCallback((qr) => {
    if (io && whatsappService.userId) {
      emitToUser(whatsappService.userId, "whatsapp:qr", { qr });
    }
  });

  whatsappService.setStatusCallback((status) => {
    if (io && whatsappService.userId) {
      emitToUser(whatsappService.userId, "whatsapp:status", { status });
    }
  });

  whatsappService.setPairingCodeCallback((code) => {
    if (io && whatsappService.userId) {
      emitToUser(whatsappService.userId, "whatsapp:pairingCode", { code });
    }
  });

  broadcastManager.setIO(io, emitToUser);

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
