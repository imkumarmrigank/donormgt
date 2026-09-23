const { Router } = require("express");
const controller = require("../controllers/upload.controller");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const {
  signedUploadUrlSchema,
  signedReadUrlSchema
} = require("../validators/upload.validators");

const router = Router();

router.use(requireAuth);
router.post("/signed-url", validate(signedUploadUrlSchema), controller.createUploadUrl);
router.post("/read-url", validate(signedReadUrlSchema), controller.createReadUrl);
router.post("/", upload.single("file"), controller.uploadFile);

module.exports = router;
