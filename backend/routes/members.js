const router = require("express").Router();
const memberController = require("../controllers/memberController");
const { auth } = require("../middlewares/auth");

router.get("/", auth, memberController.list);
router.post("/send-message", auth, memberController.sendMessage);

module.exports = router;
