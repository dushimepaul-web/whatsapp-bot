const rateLimit = require("express-rate-limit");
const config = require("../config");

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: 120,
  message: { error: "Trop de requêtes, réessayez plus tard" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Trop de tentatives de connexion" },
});

const connectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Trop de tentatives de connexion WhatsApp" },
});

const broadcastLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: "Trop de diffusions, veuillez attendre" },
});

const groupSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: { error: "Trop de synchronisations, veuillez attendre 5 minutes" },
});

const forwardingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Trop d'opérations de forwarding" },
});

module.exports = { apiLimiter, authLimiter, connectLimiter, broadcastLimiter, groupSyncLimiter, forwardingLimiter };
