const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const webhookController = require("../controllers/webhookController");
const { validate, schemas } = require("../middlewares/validate");

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Trop de requêtes webhook" },
});

router.post("/send", webhookLimiter, validate(schemas.webhookSend), webhookController.send);
router.get("/status", webhookLimiter, webhookController.status);

module.exports = router;
