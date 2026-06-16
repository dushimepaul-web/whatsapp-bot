const router = require("express").Router();
const settingsController = require("../controllers/settingsController");
const { auth } = require("../middlewares/auth");
const { validate, schemas } = require("../middlewares/validate");
const rateLimit = require("express-rate-limit");

const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Trop de modifications de paramètres" },
});

router.get("/", auth, settingsController.get);
router.put("/", auth, settingsLimiter, validate(schemas.settings), settingsController.update);
router.get("/console-access", auth, settingsController.consoleAccess);

module.exports = router;
