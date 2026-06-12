const router = require("express").Router();
const forwardingController = require("../controllers/forwardingController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, forwardingController.list);
router.post("/", auth, forwardingController.create);
router.get("/:id", auth, forwardingController.get);
router.put("/:id", auth, forwardingController.update);
router.delete("/:id", auth, forwardingController.remove);
router.patch("/:id/toggle", auth, forwardingController.toggle);
router.post("/stop", auth, forwardingController.stopForwarding);

module.exports = router;
