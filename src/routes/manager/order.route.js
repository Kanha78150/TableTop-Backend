// src/routes/manager/order.route.js - Manager Order Management Routes
import express from "express";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
} from "../../middleware/roleAuth.middleware.js";
import {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  getOrdersByStatus,
  getOrderAnalytics,
  assignOrderToStaff,
  confirmCashPayment,
} from "../../controllers/manager/order.controller.js";

const router = express.Router();

router.get(
  "/",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getAllOrders
);

// Specific routes before parameterized /:orderId
router.get(
  "/analytics/summary",
  requireRole(["branch_manager"]),
  requirePermission("viewBranchAnalytics"),
  getOrderAnalytics
);

router.get(
  "/status/:status",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getOrdersByStatus
);

router.get(
  "/:orderId",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getOrderDetails
);

router.put(
  "/:orderId/status",
  requireRole(["branch_manager"]),
  requirePermission("updateOrderStatus"),
  updateOrderStatus
);

router.put(
  "/:orderId/assign/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("processOrders"),
  assignOrderToStaff
);

router.put(
  "/:orderId/confirm-payment",
  requireRole(["branch_manager"]),
  requirePermission("updateOrderStatus"),
  confirmCashPayment
);

export default router;
