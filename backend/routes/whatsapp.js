const router = require("express").Router();
const whatsappController = require("../controllers/whatsappController");
const { auth } = require("../middlewares/auth");

router.get("/status", auth, whatsappController.getStatus);
router.post("/connect", auth, whatsappController.connect);
router.post("/disconnect", auth, whatsappController.disconnect);
router.get("/qr", auth, whatsappController.getQr);
router.post("/pair", auth, whatsappController.pair);

module.exports = router;
