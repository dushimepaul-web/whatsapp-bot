const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: "Utilisateur introuvable" });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expiré", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Token invalide" });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }
  next();
};

module.exports = { auth, adminOnly };
