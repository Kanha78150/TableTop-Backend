import express from "express";
import { authenticateAdmin } from "../middleware/roleAuth.middleware.js";

// Sub-route modules
import hotelRoutes from "./admin/hotel.route.js";
import branchRoutes from "./admin/branch.route.js";
import userRoutes from "./admin/user.route.js";
import managerRoutes from "./admin/manager.route.js";
import staffRoutes from "./admin/staff.route.js";
import menuRoutes from "./admin/menu.route.js";
import tableRoutes from "./admin/table.route.js";
import offerRoutes from "./admin/offer.route.js";
import analyticsRoutes from "./admin/analytics.route.js";
import coinRoutes from "./admin/coin.route.js";
import complaintRoutes from "./admin/complaint.route.js";
import orderRoutes from "./admin/order.route.js";
import scheduledJobsRoutes from "./admin/scheduledJobs.route.js";
import accountingRoutes from "./admin/accounting.route.js";
import reviewRoutes from "./admin/review.route.js";

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Mount sub-routes
router.use("/hotels", hotelRoutes);
router.use("/branches", branchRoutes);
router.use("/users", userRoutes);
router.use("/managers", managerRoutes);
router.use("/staff", staffRoutes);
router.use("/menu", menuRoutes);
router.use("/tables", tableRoutes);
router.use("/offers", offerRoutes);
router.use("/coins", coinRoutes);
router.use("/complaints", complaintRoutes);
router.use("/orders", orderRoutes);
router.use("/scheduled-jobs", scheduledJobsRoutes);
router.use("/accounting", accountingRoutes);
router.use("/reviews", reviewRoutes);

// Analytics routes use mixed prefixes (/dashboard, /reports/*, /analytics/*)
// so mount at root level to preserve original paths
router.use("/", analyticsRoutes);

export default router;
