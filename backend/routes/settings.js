const router = require("express").Router();
const settingsController = require("../controllers/settingsController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, settingsController.get);
router.put("/", auth, settingsController.update);
router.get("/console-access", auth, settingsController.consoleAccess);

module.exports = router;
