// src/routes/user/complaint.route.js - User Complaint Routes
// Note: authenticateUser is applied at the mount level in user.route.js
import express from "express";
import { upload } from "../../middleware/multer.middleware.js";
import {
  submitComplaint,
  getMyComplaints,
  getComplaintDetails,
  addFollowUpMessage,
  rateResolution,
  reopenComplaint,
  getMyComplaintsDashboard,
} from "../../controllers/user/complaint.controller.js";

const router = express.Router();

// Submit a new complaint
router.post("/", upload.array("attachments", 5), submitComplaint);

// Get user's complaint dashboard summary
router.get("/dashboard", getMyComplaintsDashboard);

// Get all complaints for logged-in user
router.get("/", getMyComplaints);

// Get specific complaint details
router.get("/:complaintId", getComplaintDetails);

// Add follow-up message to complaint
router.post(
  "/:complaintId/followup",
  upload.array("attachments", 3),
  addFollowUpMessage
);

// Rate complaint resolution
router.put("/:complaintId/rate", rateResolution);

// Reopen a resolved complaint
router.put("/:complaintId/reopen", reopenComplaint);

export default router;
