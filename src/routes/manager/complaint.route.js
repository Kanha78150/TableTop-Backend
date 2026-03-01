// src/routes/manager/complaint.route.js - Manager Complaint Management Routes
import express from "express";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
} from "../../middleware/roleAuth.middleware.js";
import {
  getAllComplaints,
  getComplaintDetails,
  updateComplaintStatus,
  assignComplaintToStaff,
  reassignComplaint,
  addComplaintResponse,
  resolveComplaint,
  getComplaintAnalytics,
} from "../../controllers/manager/complaint.controller.js";

const router = express.Router();

router.get(
  "/",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  getAllComplaints
);

// Specific route before parameterized /:complaintId
router.get(
  "/analytics/summary",
  requireRole(["branch_manager"]),
  requirePermission("viewFeedback"),
  getComplaintAnalytics
);

router.get(
  "/:complaintId",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  getComplaintDetails
);

router.put(
  "/:complaintId/status",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  updateComplaintStatus
);

router.put(
  "/:complaintId/assign/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  assignComplaintToStaff
);

router.put(
  "/:complaintId/reassign/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  reassignComplaint
);

router.post(
  "/:complaintId/response",
  requireManagerOrHigher,
  requirePermission("handleComplaints"),
  addComplaintResponse
);

router.put(
  "/:complaintId/resolve",
  requireRole(["branch_manager"]),
  requirePermission("handleComplaints"),
  resolveComplaint
);

export default router;
