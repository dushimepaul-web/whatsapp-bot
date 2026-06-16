const router = require("express").Router();
const broadcastController = require("../controllers/broadcastController");
const { auth } = require("../middlewares/auth");
const { broadcastLimiter } = require("../middlewares/rateLimiter");
const { validate, schemas } = require("../middlewares/validate");

router.get("/", auth, broadcastController.list);
router.post("/", auth, validate(schemas.broadcast), broadcastController.create);
router.get("/stats", auth, broadcastController.stats);
router.get("/:id", auth, broadcastController.get);
router.post("/:id/send", auth, broadcastLimiter, broadcastController.send);

module.exports = router;
