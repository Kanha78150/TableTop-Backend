// src/routes/staff.route.js - Staff Routes with Assignment System Integration
import express from "express";
import staffOrderController from "../controllers/staff/orderController.js";
import { authenticate } from "../middleware/roleAuth.middleware.js";
import { requireRole } from "../middleware/roleAuth.middleware.js";

const router = express.Router();

// All staff routes require authentication
router.use(authenticate);

// Ensure only staff members can access these routes
router.use(requireRole(["staff"]));

/**
 * Staff Order Management Routes
 */

// Get orders assigned to current staff member
router.get("/orders/my-orders", staffOrderController.getMyOrders);

// Get active orders count for current staff
router.get("/orders/active-count", staffOrderController.getActiveOrdersCount);

// Get all tables with their status
router.get("/tables/status", staffOrderController.getAllTablesStatus);

// Get specific order details (MUST BE AFTER all specific routes)
router.get("/orders/:orderId", staffOrderController.getOrderDetails);

// Update order status
router.put("/orders/:orderId/status", staffOrderController.updateOrderStatus);

export default router;
