const router = require("express").Router();
const whatsappController = require("../controllers/whatsappController");
const { auth } = require("../middlewares/auth");
const { connectLimiter } = require("../middlewares/rateLimiter");

router.get("/status", auth, whatsappController.getStatus);
router.post("/connect", auth, connectLimiter, whatsappController.connect);
router.post("/disconnect", auth, whatsappController.disconnect);
router.get("/qr", auth, whatsappController.getQr);
router.post("/pair", auth, connectLimiter, whatsappController.pair);

module.exports = router;
