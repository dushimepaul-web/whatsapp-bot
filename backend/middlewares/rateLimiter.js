const rateLimit = require("express-rate-limit");
const config = require("../config");

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: "Trop de requêtes, réessayez plus tard" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de tentatives de connexion" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Trop de comptes créés, réessayez plus tard" },
});

module.exports = { apiLimiter, authLimiter, registerLimiter };
