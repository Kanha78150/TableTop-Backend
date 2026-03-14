// src/routes/manager.route.js - Branch Manager Routes (index)
import express from "express";
import {
  authenticate,
  requireManagerOrHigher,
  requirePermission,
} from "../middleware/roleAuth.middleware.js";

// Sub-route modules
import dashboardRoutes from "./manager/dashboard.route.js";
import staffRoutes from "./manager/staff.route.js";
import menuRoutes from "./manager/menu.route.js";
import orderRoutes from "./manager/order.route.js";
import tableRoutes from "./manager/table.route.js";
import reservationRoutes from "./manager/reservation.route.js";
import complaintRoutes from "./manager/complaint.route.js";

// Controller import for kitchen route (single route, kept in index)
import { getKitchenOrders } from "../controllers/manager/order.controller.js";

const router = express.Router();

// Apply authentication to all manager routes
router.use(authenticate);

// Mount sub-routes
router.use("/", dashboardRoutes);
router.use("/staff", staffRoutes);
router.use("/menu", menuRoutes);
router.use("/orders", orderRoutes);
router.use("/tables", tableRoutes);
router.use("/reservations", reservationRoutes);
router.use("/complaints", complaintRoutes);

// Kitchen route (single specialised route, kept in index)
router.get(
  "/kitchen/orders",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getKitchenOrders
);

export default router;
