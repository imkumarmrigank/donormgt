const { Router } = require("express");
const controller = require("../controllers/masterData.controller");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { ROLES } = require("../config/roles");

const router = Router();

router.use(requireAuth);

// Combined endpoint — all authenticated users can read
router.get("/", controller.get);

// RST Items CRUD
router.get("/rst-items", controller.listRstItems);
router.post("/rst-items", requireRoles(ROLES.ADMIN, ROLES.MANAGER), controller.createRstItem);
router.patch("/rst-items/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), controller.updateRstItem);
router.delete("/rst-items/:id", requireRoles(ROLES.ADMIN), controller.deleteRstItem);

// SKS Items CRUD
router.get("/sks-items", controller.listSksItems);
router.post("/sks-items", requireRoles(ROLES.ADMIN, ROLES.MANAGER), controller.createSksItem);
router.patch("/sks-items/:id", requireRoles(ROLES.ADMIN, ROLES.MANAGER), controller.updateSksItem);
router.delete("/sks-items/:id", requireRoles(ROLES.ADMIN), controller.deleteSksItem);

module.exports = router;
