const { Router } = require("express");
const controller = require("../controllers/payment.controller");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const {
  recordPaymentSchema,
  clearBalanceSchema,
  paymentListSchema,
  partnerSummarySchema
} = require("../validators/payment.validators");

const router = Router();

router.use(requireAuth);

// Payment list (top-level ledger)
router.get(
  "/",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  validate(paymentListSchema),
  controller.list
);

// ── Partner-level summary — must appear before :partnerId routes ──────────────
// Returns backend-grouped partner rows; replaces all client-side grouping.
router.get(
  "/partners/summary",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  validate(partnerSummarySchema),
  controller.partnerSummary
);

// Per-pickup payment history
router.get(
  "/pickups/:pickupId",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  controller.getPickupPayments
);

// Record / allocate a payment
router.post(
  "/partners/:partnerId/record",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  validate(recordPaymentSchema),
  controller.record
);

// Clear entire partner balance (or write-off)
router.post(
  "/partners/:partnerId/clear-balance",
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  validate(clearBalanceSchema),
  controller.clearBalance
);

module.exports = router;
