const router = require("express").Router();
const memberController = require("../controllers/memberController");
const { auth } = require("../middlewares/auth");
const { broadcastLimiter } = require("../middlewares/rateLimiter");
const { validate, schemas } = require("../middlewares/validate");

router.get("/", auth, memberController.list);
router.post("/send-message", auth, broadcastLimiter, validate(schemas.message), memberController.sendMessage);

module.exports = router;
