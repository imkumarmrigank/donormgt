const { Router } = require("express");
const controller = require("../controllers/location.controller");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { ROLES } = require("../config/roles");
const {
  locationQuerySchema,
  upsertLocationSchema
} = require("../validators/location.validators");

const router = Router();

router.use(requireAuth);

// All authenticated users can read locations
router.get("/tree", controller.tree);
router.get("/cities", controller.listCities);
router.get("/sectors", validate(locationQuerySchema), controller.listSectors);
router.get("/societies", validate(locationQuerySchema), controller.listSocieties);

// Admin and Manager can create/update locations
router.post("/", requireRoles(ROLES.ADMIN, ROLES.MANAGER), validate(upsertLocationSchema), controller.upsert);

// Only Admin can delete locations
router.delete("/cities/:id", requireRoles(ROLES.ADMIN), controller.deleteCity);
router.delete("/sectors/:id", requireRoles(ROLES.ADMIN), controller.deleteSector);
router.delete("/societies/:id", requireRoles(ROLES.ADMIN), controller.deleteSociety);

module.exports = router;
