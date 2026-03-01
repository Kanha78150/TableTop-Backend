import express from "express";
import {
  getAllOrders,
  getOrderDetails,
  getOrderAnalytics,
  confirmCashPayment,
} from "../../controllers/admin/order.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Get all orders (supports branchId, staffId, status, date filters)
router.get("/", rbac({ permissions: ["manageUsers"] }), getAllOrders);

// Get order analytics summary (must be before :orderId)
router.get(
  "/analytics/summary",
  rbac({ permissions: ["viewAnalytics"] }),
  getOrderAnalytics
);

// Get order details by ID
router.get(
  "/:orderId",
  rbac({ permissions: ["manageUsers"] }),
  getOrderDetails
);

// Confirm cash payment for an order
router.put(
  "/:orderId/confirm-payment",
  rbac({ permissions: ["manageUsers"] }),
  confirmCashPayment
);

export default router;
