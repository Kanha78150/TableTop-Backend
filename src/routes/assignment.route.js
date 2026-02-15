// src/routes/assignment.route.js - Waiter Assignment System Routes
import express from "express";

// Import controllers
import assignmentController from "../controllers/assignment.controller.js";

// Import middleware
import { authenticate } from "../middleware/roleAuth.middleware.js";
import { requireRole } from "../middleware/roleAuth.middleware.js";

const router = express.Router();

// All assignment routes require authentication
router.use(authenticate);

/**
 * Manual Assignment Routes (Manager/Admin only)
 */

// Manual order assignment
router.post(
  "/manual-assign",
  requireRole(["branch_manager", "admin"]),
  assignmentController.manualAssignOrder
);

// Reset round-robin tracking
router.post(
  "/system/reset-round-robin",
  requireRole(["branch_manager", "admin"]),
  assignmentController.resetRoundRobin
);

/**
 * Statistics and Monitoring Routes
 */

// Get assignment statistics (Manager/Admin only)
router.get(
  "/stats",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getAssignmentStats
);

// Get system health status
router.get(
  "/system/health",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getSystemHealth
);

// Get performance metrics
router.get(
  "/system/metrics",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getPerformanceMetrics
);

// Force manual monitoring cycle (Admin only)
router.post(
  "/system/force-monitoring",
  requireRole(["super_admin"]),
  assignmentController.forceMonitoring
);

/**
 * Queue Management Routes
 */

// Get queue details (Manager/Admin only)
router.get(
  "/queue",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getQueueDetails
);

// Update queue priority
router.put(
  "/queue/:orderId/priority",
  requireRole(["branch_manager", "admin"]),
  assignmentController.updateQueuePriority
);

/**
 * Waiter Management Routes
 */

// Get available waiters (Manager/Admin only)
router.get(
  "/waiters/available",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getAvailableWaiters
);

// Update waiter availability (Manager/Admin or Self)
router.put(
  "/waiters/:waiterId/availability",
  assignmentController.updateWaiterAvailability
);

// Get waiter performance report
router.get(
  "/waiters/:waiterId/performance",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getWaiterPerformance
);

/**
 * Hierarchy Validation Routes (Manager/Admin only)
 */

// Validate organizational hierarchy for hotel only
router.get(
  "/validate-hierarchy/:hotelId",
  requireRole(["branch_manager", "admin"]),
  assignmentController.validateHierarchy
);

// Validate organizational hierarchy for hotel and branch
router.get(
  "/validate-hierarchy/:hotelId/:branchId",
  requireRole(["branch_manager", "admin"]),
  assignmentController.validateHierarchy
);

// Get detailed staff hierarchy structure for hotel only
router.get(
  "/staff-hierarchy/:hotelId",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getStaffHierarchy
);

// Get detailed staff hierarchy structure for hotel and branch
router.get(
  "/staff-hierarchy/:hotelId/:branchId",
  requireRole(["branch_manager", "admin"]),
  assignmentController.getStaffHierarchy
);

// Test assignment scenarios
router.post(
  "/test-assignment",
  requireRole(["branch_manager", "admin"]),
  assignmentController.testAssignment
);

export default router;
