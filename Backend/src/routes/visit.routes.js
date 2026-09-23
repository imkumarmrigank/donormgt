const { Router } = require("express");
const visitService = require("../services/visit.service");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { ROLES } = require("../config/roles");
const { z, optionalString, dateString } = require("../validators/common.validators");

const listSchema = z.object({
  query: z.object({
    dateFrom: dateString,
    dateTo: dateString,
    riderId: optionalString,
    pickupId: optionalString,
    flagged: optionalString,
    limit: z.coerce.number().int().min(1).max(1000).optional()
  }).default({})
});

const outcomeBody = z.object({
  label: z.string().min(1).max(80),
  requiresPhoto: z.boolean().optional(),
  pickupStatus: z.enum(visitService.OUTCOME_PICKUP_STATUSES).nullable().optional(),
  active: z.boolean().optional(),
  order: z.number().optional()
});

const router = Router();
router.use(requireAuth);

router.get("/", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(listSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.listVisits(req.query), "Rider visits");
}));

router.get("/live", requireRoles(ROLES.ADMIN, ROLES.MANAGER), asyncHandler(async (_req, res) => {
  sendSuccess(res, await visitService.listLiveRiders(), "Live riders");
}));

router.get("/outcomes", requireRoles(ROLES.ADMIN, ROLES.MANAGER), asyncHandler(async (_req, res) => {
  sendSuccess(res, await visitService.listOutcomes({ includeInactive: true }), "Visit outcomes");
}));

router.post("/outcomes", requireRoles(ROLES.ADMIN), validate(z.object({ body: outcomeBody })), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.createOutcome(req.body, req.user), "Outcome added", 201);
}));

router.patch("/outcomes/:id", requireRoles(ROLES.ADMIN),
  validate(z.object({ params: z.object({ id: z.string().min(1) }), body: outcomeBody.partial() })),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await visitService.updateOutcome(req.params.id, req.body, req.user), "Outcome updated");
  }));

module.exports = router;
