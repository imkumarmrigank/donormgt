const { Router } = require("express");
const controller = require("../controllers/pickup.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const { idParam, listQuery } = require("../validators/common.validators");
const {
  createPickupSchema,
  updatePickupSchema,
  recordPickupSchema,
  reschedulePickupSchema,
} = require("../validators/pickup.validators");

const router = Router();

router.use(requireAuth);
router.get("/",                validate(listQuery),          controller.list);
router.get("/raddi-records",   validate(listQuery),          controller.listRaddiRecords);
// ── Conflict-check must be declared BEFORE /:id so Express doesn't treat
//    "check-conflict" as a pickup ID parameter.
router.get("/check-conflict",  validate(listQuery),          controller.checkConflict);
router.post("/",               requireRoles(ROLES.ADMIN, ROLES.MANAGER),            validate(createPickupSchema), controller.create);
router.get("/:id",             validate(idParam),             controller.get);
router.patch("/:id",           requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE), validate(updatePickupSchema), controller.update);
// ── Partner is REQUIRED here — guard lives in recordPickupSchema + service ───
router.post("/:id/record",     requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE), validate(recordPickupSchema), controller.record);
// ── Reschedule: Admin and Manager only — updates date/timeSlot without completing ───
router.post("/:id/reschedule", requireRoles(ROLES.ADMIN, ROLES.MANAGER),            validate(reschedulePickupSchema), controller.reschedule);
router.delete("/:id",          requireRoles(ROLES.ADMIN),    validate(idParam),     controller.remove);

module.exports = router;