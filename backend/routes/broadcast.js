const router = require("express").Router();
const broadcastController = require("../controllers/broadcastController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, broadcastController.list);
router.post("/", auth, broadcastController.create);
router.get("/stats", auth, broadcastController.stats);
router.get("/:id", auth, broadcastController.get);
router.post("/:id/send", auth, broadcastController.send);

module.exports = router;
