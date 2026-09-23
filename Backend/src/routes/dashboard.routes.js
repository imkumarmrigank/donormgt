const { Router } = require("express");
const controller = require("../controllers/dashboard.controller");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");
const { validate } = require("../middleware/validate");
const { z } = require("../validators/common.validators");

const dashboardStatsSchema = z.object({
  query: z.object({
    dateFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    dateTo:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    city:      z.string().optional().or(z.literal("")),
    sector:    z.string().optional().or(z.literal("")),
    partnerId: z.string().optional().or(z.literal("")),
    limit:     z.coerce.number().int().min(1).max(2000).optional(),
  }).passthrough().default({})
});

const router = Router();

router.use(requireAuth);
router.get("/stats", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(dashboardStatsSchema), controller.stats);
router.get("/scheduler", requireRoles(ROLES.ADMIN, ROLES.MANAGER), controller.scheduler);

module.exports = router;