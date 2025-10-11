// src/routes/manager.route.js - Branch Manager Routes
import express from "express";
import {
  authenticate,
  requireRole,
  requireManagerOrHigher,
  requireSelfOrSuperAdmin,
  requireBranchAccess,
  requirePermission,
  rbac,
  rateLimitSensitiveOps,
} from "../middleware/roleAuth.middleware.js";

// Import controllers
import {
  getDashboard,
  getBranchAnalytics,
  getManagerProfile,
  updateManagerProfile,
  changePassword,
} from "../controllers/manager/dashboardController.js";

import {
  createStaff,
  getStaff,
  getAllStaff,
  updateStaff,
  deleteStaff,
  updateStaffStatus,
  getStaffPerformance,
  updateStaffPerformance,
  addStaffTraining,
  getStaffSchedule,
  updateStaffSchedule,
} from "../controllers/manager/staffController.js";

import {
  getMenuItems,
  getMenuItem,
  updateMenuItemAvailability,
  updateBulkMenuItemAvailability,
  getFoodCategories,
  getFoodCategory,
} from "../controllers/manager/menuController.js";

import {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  getOrdersByStatus,
  getOrderAnalytics,
  getKitchenOrders,
  assignOrderToStaff,
} from "../controllers/manager/orderController.js";

import {
  getAllTables,
  createTable,
  updateTable,
  deleteTable,
  getTableStatus,
  updateTableStatus,
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
} from "../controllers/manager/tableController.js";

import {
  getAllComplaints,
  getComplaintDetails,
  updateComplaintStatus,
  assignComplaintToStaff,
  addComplaintResponse,
  getComplaintAnalytics,
} from "../controllers/manager/complaintController.js";

const router = express.Router();

// Apply authentication to all manager routes
router.use(authenticate);

// Branch Manager Dashboard and Profile Routes
router.get("/dashboard", requireRole(["branch_manager"]), getDashboard);

router.get(
  "/analytics",
  requireRole(["branch_manager"]),
  requirePermission("viewBranchAnalytics"),
  getBranchAnalytics
);

router.get("/profile", requireManagerOrHigher, getManagerProfile);

router.put("/profile", requireManagerOrHigher, updateManagerProfile);

router.put(
  "/change-password",
  requireManagerOrHigher,
  rateLimitSensitiveOps,
  changePassword
);

// Staff Management Routes (Branch Manager)
router.post(
  "/staff",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  rateLimitSensitiveOps,
  createStaff
);

router.get(
  "/staff",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getAllStaff
);

router.get(
  "/staff/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaff
);

router.put(
  "/staff/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaff
);

router.delete(
  "/staff/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  rateLimitSensitiveOps,
  deleteStaff
);

router.put(
  "/staff/:staffId/status",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffStatus
);

router.get(
  "/staff/:staffId/performance",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaffPerformance
);

router.put(
  "/staff/:staffId/performance",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffPerformance
);

router.post(
  "/staff/:staffId/training",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  addStaffTraining
);

router.get(
  "/staff/:staffId/schedule",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaffSchedule
);

router.put(
  "/staff/:staffId/schedule",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffSchedule
);

// Menu Management Routes - READ ONLY FOR MANAGERS
// Only administrators can create, update, or delete categories and items

// Food Categories - Read Only
router.get(
  "/menu/categories",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getFoodCategories
);

router.get(
  "/menu/categories/:categoryId",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getFoodCategory
);

// Food Items - Read Only + Availability Updates
router.get(
  "/menu/items",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getMenuItems
);

router.get(
  "/menu/items/:itemId",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getMenuItem
);

// Managers can only update availability of menu items
router.put(
  "/menu/items/:itemId/availability",
  requireRole(["branch_manager"]),
  requirePermission("updateMenuItems"),
  updateMenuItemAvailability
);

// Bulk availability update
router.patch(
  "/menu/items/bulk-availability",
  requireRole(["branch_manager"]),
  requirePermission("updateMenuItems"),
  updateBulkMenuItemAvailability
);

// Order Management Routes
router.get(
  "/orders",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getAllOrders
);

router.get(
  "/orders/:orderId",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getOrderDetails
);

router.put(
  "/orders/:orderId/status",
  requireRole(["branch_manager"]),
  requirePermission("updateOrderStatus"),
  updateOrderStatus
);

router.get(
  "/orders/status/:status",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getOrdersByStatus
);

router.get(
  "/orders/analytics/summary",
  requireRole(["branch_manager"]),
  requirePermission("viewBranchAnalytics"),
  getOrderAnalytics
);

router.get(
  "/kitchen/orders",
  requireManagerOrHigher,
  requirePermission("viewOrders"),
  getKitchenOrders
);

router.put(
  "/orders/:orderId/assign/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("processOrders"),
  assignOrderToStaff
);

// Table and Reservation Management Routes
router.get(
  "/tables",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  getAllTables
);

router.post(
  "/tables",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  createTable
);

router.put(
  "/tables/:tableId",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  updateTable
);

router.delete(
  "/tables/:tableId",
  requireRole(["branch_manager"]),
  requirePermission("manageTables"),
  deleteTable
);

router.get(
  "/tables/status",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  getTableStatus
);

router.put(
  "/tables/:tableId/status",
  requireManagerOrHigher,
  requirePermission("manageTables"),
  updateTableStatus
);

router.get(
  "/reservations",
  requireManagerOrHigher,
  requirePermission("manageReservations"),
  getReservations
);

router.post(
  "/reservations",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  createReservation
);

router.put(
  "/reservations/:reservationId",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  updateReservation
);

router.delete(
  "/reservations/:reservationId",
  requireRole(["branch_manager"]),
  requirePermission("manageReservations"),
  cancelReservation
);

// Complaint Management Routes
router.get(
  "/complaints",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  getAllComplaints
);

router.get(
  "/complaints/:complaintId",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  getComplaintDetails
);

router.put(
  "/complaints/:complaintId/status",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  updateComplaintStatus
);

router.put(
  "/complaints/:complaintId/assign/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  assignComplaintToStaff
);

router.post(
  "/complaints/:complaintId/response",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  addComplaintResponse
);

router.get(
  "/complaints/analytics/summary",
  requireRole(["branch_manager"]),
  requirePermission("viewFeedback"),
  getComplaintAnalytics
);

export default router;
