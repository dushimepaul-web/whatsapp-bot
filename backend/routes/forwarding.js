const router = require("express").Router();
const forwardingController = require("../controllers/forwardingController");
const { auth } = require("../middlewares/auth");
const { forwardingLimiter } = require("../middlewares/rateLimiter");
const { validate, schemas } = require("../middlewares/validate");

router.get("/", auth, forwardingController.list);
router.post("/", auth, forwardingLimiter, validate(schemas.forwardingRule), forwardingController.create);
router.get("/:id", auth, forwardingController.get);
router.put("/:id", auth, forwardingLimiter, validate(schemas.forwardingRule), forwardingController.update);
router.delete("/:id", auth, forwardingController.remove);
router.patch("/:id/toggle", auth, forwardingLimiter, forwardingController.toggle);
router.post("/stop", auth, forwardingLimiter, forwardingController.stopForwarding);

module.exports = router;
