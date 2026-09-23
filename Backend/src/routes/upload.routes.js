const { Router } = require("express");
const controller = require("../controllers/upload.controller");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { signedReadUrlSchema } = require("../validators/upload.validators");

const router = Router();

// Opened directly by the browser (links, <img>), so it carries its own signed token.
router.get("/view/:token", controller.viewFile);

router.use(requireAuth);
router.post("/read-url", validate(signedReadUrlSchema), controller.createReadUrl);
router.post("/", upload.single("file"), controller.uploadFile);

module.exports = router;
