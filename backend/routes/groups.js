const router = require("express").Router();
const groupController = require("../controllers/groupController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, groupController.list);
router.get("/stats", auth, groupController.stats);
router.get("/:id", auth, groupController.get);
router.get("/:id/members", auth, groupController.members);
router.get("/:id/admins", auth, groupController.admins);
router.post("/refresh", auth, groupController.refresh);
router.patch("/:id/visibility", auth, groupController.toggleVisibility);
router.patch("/:id/restrict", auth, groupController.toggleRestrict);

module.exports = router;
