// src/routes/staff.route.js - Staff Routes with Assignment System Integration
import express from "express";

// Import controllers
import staffOrderController from "../controllers/staff/order.controller.js";
import {
  getMyAssignedComplaints,
  getComplaintDetails,
  markComplaintAsViewed,
  getStaffComplaintDashboard,
} from "../controllers/staff/complaint.controller.js";
import staffMenuController from "../controllers/staff/menu.controller.js";

// Import middleware
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

// Confirm cash payment for an order
router.put(
  "/orders/:orderId/confirm-payment",
  staffOrderController.confirmCashPayment
);

/**
 * Staff Complaint Management Routes (READ-ONLY ACCESS)
 * Staff can VIEW complaints assigned to them but CANNOT update, respond, or modify
 * All updates are handled by managers and admins
 */

// Get staff complaint dashboard summary
router.get("/complaints/dashboard", getStaffComplaintDashboard);

// Get all complaints assigned to current staff member (READ-ONLY)
router.get("/complaints", getMyAssignedComplaints);

// Get specific complaint details (READ-ONLY)
router.get("/complaints/:complaintId", getComplaintDetails);

// Mark complaint as viewed (only write operation allowed)
router.put("/complaints/:complaintId/viewed", markComplaintAsViewed);

// Block any attempt to update complaint status (return 403)
router.put("/complaints/:complaintId/status", (req, res) => {
  return res.status(403).json({
    success: false,
    message:
      "Staff have read-only access to complaints. Only managers and admins can update complaint status.",
  });
});

// Block any attempt to add responses (return 403)
router.post("/complaints/:complaintId/response", (req, res) => {
  return res.status(403).json({
    success: false,
    message:
      "Staff have read-only access to complaints. Only managers and admins can add responses.",
  });
});

// Block any attempt to resolve complaints (return 403)
router.put("/complaints/:complaintId/resolve", (req, res) => {
  return res.status(403).json({
    success: false,
    message:
      "Staff have read-only access to complaints. Only managers and admins can resolve complaints.",
  });
});

/**
 * Staff Menu Management Routes (READ-ONLY ACCESS)
 * Staff can VIEW all food categories and items from their assigned branch/hotel
 * Staff CANNOT create, update, or delete menu items
 */

// Get all food categories
router.get("/menu/categories", staffMenuController.getFoodCategories);

// Get specific category details
router.get("/menu/categories/:categoryId", staffMenuController.getCategoryById);

// Get food items by category
router.get(
  "/menu/categories/:categoryId/items",
  staffMenuController.getItemsByCategory
);

// Get all food items
router.get("/menu/items", staffMenuController.getFoodItems);

// Get specific food item details
router.get("/menu/items/:itemId", staffMenuController.getFoodItemById);

// Search menu items
router.get("/menu/search", staffMenuController.searchMenuItems);

export default router;
