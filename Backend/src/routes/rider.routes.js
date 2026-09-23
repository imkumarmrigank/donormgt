const { Router } = require("express");
const visitService = require("../services/visit.service");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { ROLES } = require("../config/roles");
const { z, optionalString } = require("../validators/common.validators");

const position = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  accuracy: z.coerce.number().optional(),
  capturedAt: optionalString
});

const recordVisitSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    outcomeId: z.string().min(1, "Choose what happened at the pickup"),
    position,
    photos: z.array(z.object({ storagePath: z.string(), url: z.string() })).max(6).default([]),
    notes: z.string().max(1000).optional(),
    farReason: z.string().max(500).optional()
  })
});

const router = Router();
router.use(requireAuth, requireRoles(ROLES.RIDER));

router.get("/pickups", asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.listRiderPickups(req.user), "Assigned pickups");
}));

router.get("/outcomes", asyncHandler(async (_req, res) => {
  sendSuccess(res, await visitService.listOutcomes(), "Visit outcomes");
}));

router.post("/pickups/:id/visits", validate(recordVisitSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.recordVisit(req.user, req.params.id, req.body), "Visit recorded", 201);
}));

module.exports = router;
