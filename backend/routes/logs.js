const router = require("express").Router();
const logController = require("../controllers/logController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, logController.list);
router.get("/stats", auth, logController.stats);
router.delete("/", auth, logController.deleteAll);

module.exports = router;
