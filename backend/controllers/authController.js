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
  sameSite: config.env === "production" ? "strict" : "lax",
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
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
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

    res.status(201).json({ user, token: tokens.token });
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
    res.json({ user, token: tokens.token });
  } catch (err) {
    logger.error("Erreur login:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
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
