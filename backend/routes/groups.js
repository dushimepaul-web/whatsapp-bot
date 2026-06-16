const router = require("express").Router();
const groupController = require("../controllers/groupController");
const { auth } = require("../middlewares/auth");
const { groupSyncLimiter } = require("../middlewares/rateLimiter");

router.get("/", auth, groupController.list);
router.get("/stats", auth, groupController.stats);
router.post("/refresh", auth, groupSyncLimiter, groupController.refresh);
router.get("/:id", auth, groupController.get);
router.get("/:id/members", auth, groupController.members);
router.get("/:id/admins", auth, groupController.admins);
router.patch("/:id/visibility", auth, groupController.toggleVisibility);
router.patch("/:id/restrict", auth, groupController.toggleRestrict);

module.exports = router;
