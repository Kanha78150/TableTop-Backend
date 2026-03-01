import express from "express";
import {
  getAllComplaints,
  getComplaintDetails,
  updateComplaintStatus,
  assignComplaintToStaff,
  reassignComplaint,
  addComplaintResponse,
  resolveComplaint,
  getEscalatedComplaints,
  getComplaintAnalytics,
} from "../../controllers/admin/complaint.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  requireFeature,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

// Get all complaints (hotel-wide for branch admin, cross-hotel for super admin)
router.get(
  "/",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getAllComplaints
);

// Get escalated complaints
router.get(
  "/escalated",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getEscalatedComplaints
);

// Get complaint analytics
router.get(
  "/analytics",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getComplaintAnalytics
);

// Get specific complaint details
router.get(
  "/:complaintId",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getComplaintDetails
);

// Update complaint status
router.put(
  "/:complaintId/status",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  updateComplaintStatus
);

// Assign complaint to staff
router.put(
  "/:complaintId/assign/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  assignComplaintToStaff
);

// Reassign complaint to different staff
router.put(
  "/:complaintId/reassign/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  reassignComplaint
);

// Add response to complaint
router.post(
  "/:complaintId/response",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  addComplaintResponse
);

// Resolve complaint
router.put(
  "/:complaintId/resolve",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  resolveComplaint
);

export default router;
