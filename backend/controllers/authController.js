const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Setting = require("../models/Setting");
const config = require("../config");
const logger = require("../utils/logger");
const notifier = require("../utils/notifier");

const REFRESH_COOKIE = "refreshToken";

const cookieOpts = () => ({
  httpOnly: true,
  secure: config.env === "production",
  sameSite: "none",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const generateTokens = (user) => {
  const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  });
  const refreshToken = jwt.sign({ id: user._id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpire,
  });
  return { token, refreshToken };
};

const setRefreshCookie = (res, refreshToken) => {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
};

exports.register = async (req, res) => {
  try {
    // En production, seul un admin peut créer des comptes
    if (config.env === "production" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Inscription réservée aux administrateurs en production" });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Email déjà utilisé" });
    }
    const user = await User.create({ name, email, password });
    await Setting.create({ userId: user._id });
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();
    setRefreshCookie(res, tokens.refreshToken);

    // Notifier les admins ayant activé notifyOnNewUser
    const adminSettings = await Setting.find({ notifyOnNewUser: true }).populate("userId", "email role");
    for (const s of adminSettings) {
      if (s.userId?.role === "admin") {
        notifier.notifyNewUser(s.userId._id, email, name).catch(() => {});
      }
    }

    res.status(201).json({ user, token: tokens.token, refreshToken: tokens.refreshToken });
  } catch (err) {
    logger.error("Erreur register:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ user, token: tokens.token, refreshToken: tokens.refreshToken });
  } catch (err) {
    logger.error("Erreur login:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.headers["x-refresh-token"] || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token requis" });
    }
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Refresh token invalide" });
    }
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ token: tokens.token });
  } catch (err) {
    clearRefreshCookie(res);
    logger.warn("Erreur refresh token:", err);
    res.status(401).json({ error: "Refresh token invalide ou expiré" });
  }
};

exports.logout = async (req, res) => {
  try {
    req.user.refreshToken = null;
    await req.user.save();
    clearRefreshCookie(res);
    res.json({ message: "Déconnecté" });
  } catch (err) {
    logger.error("Erreur logout:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

exports.stats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: "admin" });
    res.json({ totalUsers, totalAdmins });
  } catch (err) {
    logger.error("Erreur stats:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// Génère un token de réinitialisation de mot de passe
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Aucun compte avec cet email" });

    const resetToken = jwt.sign({ id: user._id, purpose: "reset" }, config.jwt.secret, { expiresIn: "1h" });
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    logger.info(`Token de réinitialisation généré pour ${email}`);

    // TODO: En production, envoyer un email avec le lien:
    //   `${req.protocol}://${req.get("host")}/reset-password/${resetToken}`
    // En développement, on loggue le token dans la console pour debug
    if (config.env !== "production") {
      logger.info(`[DEV] Reset token pour ${email}: ${resetToken}`);
    }

    res.json({ message: "Si l'email existe, un lien de réinitialisation a été envoyé" });
  } catch (err) {
    logger.error("Erreur forgotPassword:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.purpose !== "reset") {
      return res.status(400).json({ error: "Token invalide" });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.resetPasswordToken !== token || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ error: "Token expiré ou invalide" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = null;
    await user.save();

    logger.info(`Mot de passe réinitialisé pour user=${decoded.id}`);
    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    logger.error("Erreur resetPassword:", err);
    res.status(400).json({ error: "Token invalide ou expiré" });
  }
};
