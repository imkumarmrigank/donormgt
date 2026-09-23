const { Router } = require("express");
const controller = require("../controllers/sks.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const { idParam, listQuery } = require("../validators/common.validators");
const {
  createSksInflowSchema,
  createSksOutflowSchema,
  updateSksInflowSchema,
  updateSksOutflowSchema,
  recordSksOutflowPaymentSchema
} = require("../validators/sks.validators");

const router = Router();

router.use(requireAuth);
router.get("/stock", validate(listQuery), controller.getStock);
router.get("/inflows", validate(listQuery), controller.listInflows);
router.post("/inflows", requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE), validate(createSksInflowSchema), controller.createInflow);
router.patch("/inflows/:id", requireRoles(ROLES.ADMIN), validate(idParam), validate(updateSksInflowSchema), controller.updateInflow);
router.delete("/inflows/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(idParam), controller.deleteInflow);
router.get("/outflows", validate(listQuery), controller.listOutflows);
router.post("/outflows", requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE), validate(createSksOutflowSchema), controller.createOutflow);
router.patch("/outflows/:id", requireRoles(ROLES.ADMIN), validate(idParam), validate(updateSksOutflowSchema), controller.updateOutflow);
router.patch(
  "/outflows/:id/payment",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE),
  validate(idParam),
  validate(recordSksOutflowPaymentSchema),
  controller.recordOutflowPayment
);
router.delete("/outflows/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(idParam), controller.deleteOutflow);

module.exports = router;
