const { Router } = require("express");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const donorRoutes = require("./donor.routes");
const pickupPartnerRoutes = require("./pickupPartner.routes");
const pickupRoutes = require("./pickup.routes");
const paymentRoutes = require("./payment.routes");
const sksRoutes = require("./sks.routes");
const dashboardRoutes = require("./dashboard.routes");
const uploadRoutes = require("./upload.routes");
const locationRoutes = require("./location.routes");
const masterDataRoutes = require("./masterData.routes");
const setupRoutes = require("./setup.routes");

const router = Router();

// One-time admin setup (unauthenticated, secret-protected)
router.use("/setup", setupRoutes);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/donors", donorRoutes);
router.use("/pickup-partners", pickupPartnerRoutes);
router.use("/pickupPartners", pickupPartnerRoutes);
router.use("/PickupPartners", pickupPartnerRoutes);
router.use("/pickups", pickupRoutes);
router.use("/payments", paymentRoutes);
router.use("/sks", sksRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/uploads", uploadRoutes);
router.use("/locations", locationRoutes);
router.use("/master-data", masterDataRoutes);

module.exports = router;

