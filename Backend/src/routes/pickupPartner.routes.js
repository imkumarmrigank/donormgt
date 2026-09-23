const { Router } = require("express");
const controller = require("../controllers/pickupPartner.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES, PERMISSIONS } = require("../config/roles");
const { partnerUpload } = require("../middleware/upload");
const { idParam, listQuery } = require("../validators/common.validators");
const {
  createPickupPartnerSchema,
  updatePickupPartnerSchema
} = require("../validators/pickupPartner.validators");

const router = Router();

router.use(requireAuth);
router.get("/", validate(listQuery), controller.list);
router.post(
  "/",
  requireRoles(...PERMISSIONS.WRITE_PARTNERS),
  partnerUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadhaarDoc", maxCount: 1 },
    { name: "aadhaarDocument", maxCount: 1 }
  ]),
  validate(createPickupPartnerSchema),
  controller.create
);
router.get("/:id", validate(idParam), controller.get);
router.patch(
  "/:id",
  requireRoles(...PERMISSIONS.WRITE_PARTNERS),
  partnerUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "aadhaarDoc", maxCount: 1 },
    { name: "aadhaarDocument", maxCount: 1 }
  ]),
  validate(updatePickupPartnerSchema),
  controller.update
);
router.delete("/:id", requireRoles(ROLES.ADMIN), validate(idParam), controller.remove);

module.exports = router;
