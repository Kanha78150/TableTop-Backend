/**
 * Super Admin Commission Routes
 * Routes for managing hotel commission configurations
 * Super Admin access only
 */

import express from "express";
import {
  setHotelCommission,
  getHotelCommission,
  getAllCommissionStatistics,
  markCommissionPaid,
  waiveCommission,
  bulkSetCommission,
  bulkUpdateCommission,
  bulkDeleteCommission,
} from "../../controllers/superAdmin/commissionController.js";
import {
  authenticate,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// All routes require super admin authentication
router.use(authenticate);
router.use(requireSuperAdmin);

// Single hotel commission configuration
router.put("/hotels/:hotelId/commission", setHotelCommission);
router.get("/hotels/:hotelId/commission", getHotelCommission);

// Bulk commission operations for ALL hotels
router.post("/commission/bulk-set", bulkSetCommission);
router.put("/commission/bulk-update", bulkUpdateCommission);
router.delete("/commission/bulk-delete", bulkDeleteCommission);

// Commission statistics
router.get("/commission/statistics", getAllCommissionStatistics);

// Commission management
router.post("/commission/mark-paid", markCommissionPaid);
router.post("/commission/waive", waiveCommission);

export default router;
