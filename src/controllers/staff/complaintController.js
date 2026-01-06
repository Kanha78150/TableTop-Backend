// src/controllers/staff/complaintController.js - Staff Complaint Management Controller (READ-ONLY)

import { Complaint, validateGetComplaintsQuery } from "../../models/Complaint.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * Get all complaints assigned to the logged-in staff member (READ-ONLY)
 * GET /api/v1/staff/complaints
 * @access Staff
 */
export const getMyAssignedComplaints = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const { status, priority, category, page, limit, sortBy, sortOrder, search } = req.query;

    // Validate query parameters
    const { error } = validateGetComplaintsQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter - only complaints assigned to this staff member
    const filter = {
      assignedTo: staffId,
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (category && category !== "all") {
      filter.category = category;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { complaintId: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build sort criteria
    const sort = {};
    sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

    // Get complaints with pagination
    const complaints = await Complaint.find(filter)
      .populate("user", "name phone email")
      .populate("order", "orderId totalPrice createdAt")
      .populate("branch", "name location")
      .populate("assignedBy", "name")
      .populate("resolvedBy", "name")
      .sort(sort)
      .limit(limitNum)
      .skip(skip);

    const totalCount = await Complaint.countDocuments(filter);

    // Count unviewed complaints (where staffViewedAt is null or less than last update)
    const unviewedCount = await Complaint.countDocuments({
      assignedTo: staffId,
      $or: [
        { staffViewedAt: { $exists: false } },
        { staffViewedAt: null },
        { $expr: { $gt: ["$updatedAt", "$staffViewedAt"] } },
      ],
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaints,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            total: totalCount,
            hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
            hasPrevPage: pageNum > 1,
          },
          unviewedCount,
        },
        "Assigned complaints retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting staff assigned complaints:", error);
    next(error);
  }
};

/**
 * Get complaint details by ID (READ-ONLY)
 * GET /api/v1/staff/complaints/:complaintId
 * @access Staff
 */
export const getComplaintDetails = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const { complaintId } = req.params;

    // Validate complaint ID
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid complaint ID"));
    }

    const complaint = await Complaint.findById(complaintId)
      .populate("user", "name phone email")
      .populate("order", "orderId items totalPrice createdAt status")
      .populate("branch", "name location phone email")
      .populate("hotel", "name")
      .populate("assignedTo", "name staffId role")
      .populate("assignedBy", "name role")
      .populate("resolvedBy", "name role")
      .populate({
        path: "responses.respondedBy.userId",
        select: "name role",
      });

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check if complaint is assigned to this staff member
    if (!complaint.assignedTo || complaint.assignedTo._id.toString() !== staffId.toString()) {
      return next(
        new APIError(
          403,
          "You can only view complaints assigned to you. Please contact your manager."
        )
      );
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaint,
          readOnly: true,
          message:
            "This is a read-only view. You cannot update this complaint. All changes are made by managers/admins.",
        },
        "Complaint details retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting complaint details for staff:", error);
    next(error);
  }
};

/**
 * Mark complaint as viewed by staff
 * PUT /api/v1/staff/complaints/:complaintId/viewed
 * @access Staff
 */
export const markComplaintAsViewed = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const { complaintId } = req.params;

    // Validate complaint ID
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid complaint ID"));
    }

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check if complaint is assigned to this staff member
    if (!complaint.assignedTo || complaint.assignedTo.toString() !== staffId.toString()) {
      return next(new APIError(403, "You can only mark complaints assigned to you as viewed"));
    }

    // Update viewed timestamp
    complaint.staffViewedAt = new Date();
    complaint.staffNotified = true;
    await complaint.save();

    logger.info(`Staff ${staffId} viewed complaint ${complaintId}`);

    res.status(200).json(
      new APIResponse(200, { viewedAt: complaint.staffViewedAt }, "Complaint marked as viewed")
    );
  } catch (error) {
    logger.error("Error marking complaint as viewed:", error);
    next(error);
  }
};

/**
 * Get staff complaint dashboard summary
 * GET /api/v1/staff/complaints/dashboard
 * @access Staff
 */
export const getStaffComplaintDashboard = async (req, res, next) => {
  try {
    const staffId = req.user._id;

    // Get counts by status for assigned complaints
    const statusCounts = await Complaint.aggregate([
      { $match: { assignedTo: staffId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Get unviewed count
    const unviewedCount = await Complaint.countDocuments({
      assignedTo: staffId,
      $or: [
        { staffViewedAt: { $exists: false } },
        { staffViewedAt: null },
        { $expr: { $gt: ["$updatedAt", "$staffViewedAt"] } },
      ],
    });

    // Get priority distribution
    const priorityCounts = await Complaint.aggregate([
      { $match: { assignedTo: staffId } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    // Get recent assignments (last 5)
    const recentAssignments = await Complaint.find({ assignedTo: staffId })
      .sort({ assignedAt: -1 })
      .limit(5)
      .select("complaintId title status priority assignedAt staffViewedAt")
      .populate("user", "name")
      .populate("branch", "name");

    // Calculate engagement rate
    const totalAssigned = await Complaint.countDocuments({ assignedTo: staffId });
    const totalViewed = await Complaint.countDocuments({
      assignedTo: staffId,
      staffViewedAt: { $exists: true, $ne: null },
    });
    const engagementRate = totalAssigned > 0 ? ((totalViewed / totalAssigned) * 100).toFixed(2) : 0;

    const dashboard = {
      statusCounts: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      priorityCounts: priorityCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      unviewedCount,
      totalAssigned,
      totalViewed,
      engagementRate: parseFloat(engagementRate),
      recentAssignments,
      message:
        "You have read-only access. All complaint updates are handled by managers and admins.",
    };

    res.status(200).json(
      new APIResponse(200, { dashboard }, "Staff dashboard data retrieved successfully")
    );
  } catch (error) {
    logger.error("Error getting staff complaint dashboard:", error);
    next(error);
  }
};
