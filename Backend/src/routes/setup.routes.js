const { Router } = require("express");
const controller = require("../controllers/setup.controller");
const { validate } = require("../middleware/validate");
const { z } = require("../validators/common.validators");

const setupFirstAdminSchema = z.object({
  body: z.object({
    setupSecret: z.string().min(1, "setupSecret is required"),
    email: z.string().email(),
    password: z.string().min(6).optional(),
    name: z.string().optional()
  })
});

const router = Router();

// Public endpoints — no auth required (secret-protected instead)
router.get("/status", controller.status);
router.post("/first-admin", validate(setupFirstAdminSchema), controller.firstAdmin);

module.exports = router;
