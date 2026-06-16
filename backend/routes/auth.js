const router = require("express").Router();
const authController = require("../controllers/authController");
const { auth, adminOnly } = require("../middlewares/auth");
const { authLimiter } = require("../middlewares/rateLimiter");
const { validate, schemas } = require("../middlewares/validate");

// En production, l'inscription est réservée aux admins (qui créent les comptes)
// En développement, l'inscription est libre (contrôlé par le controller)
router.post("/register", authLimiter, validate(schemas.register), authController.register);
router.post("/login", authLimiter, validate(schemas.login), authController.login);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);
router.get("/stats", auth, authController.stats);
router.post("/forgot-password", authLimiter, validate(schemas.forgotPassword), authController.forgotPassword);
router.post("/reset-password/:token", authLimiter, validate(schemas.resetPassword), authController.resetPassword);

module.exports = router;
