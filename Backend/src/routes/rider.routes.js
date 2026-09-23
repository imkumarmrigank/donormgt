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

const idOnly = z.object({ params: z.object({ id: z.string().min(1) }) });
const startSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ position: position.optional() }).default({})
});

router.post("/pickups/:id/accept", validate(idOnly), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.acceptPickup(req.user, req.params.id), "Pickup accepted");
}));

router.post("/pickups/:id/start", validate(startSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.startTrip(req.user, req.params.id, req.body), "Trip started");
}));

const pingSchema = z.object({
  body: z.object({
    position: position.extend({
      heading: z.coerce.number().nullable().optional(),
      speed: z.coerce.number().nullable().optional()
    })
  })
});

router.post("/location", validate(pingSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.recordRiderPing(req.user, req.body), "Location received");
}));

router.post("/pickups/:id/visits", validate(recordVisitSchema), asyncHandler(async (req, res) => {
  sendSuccess(res, await visitService.recordVisit(req.user, req.params.id, req.body), "Visit recorded", 201);
}));

module.exports = router;
