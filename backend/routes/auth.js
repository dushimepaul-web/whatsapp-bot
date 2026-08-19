const router = require("express").Router();
const authController = require("../controllers/authController");
const { auth } = require("../middlewares/auth");
const { authLimiter, registerLimiter } = require("../middlewares/rateLimiter");

router.post("/register", registerLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);
router.get("/stats", auth, authController.stats);

module.exports = router;
