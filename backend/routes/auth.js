const router = require("express").Router();
const authController = require("../controllers/authController");
const { auth } = require("../middlewares/auth");
const { authLimiter } = require("../middlewares/rateLimiter");

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.me);

module.exports = router;
