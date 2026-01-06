// src/controllers/manager/complaintController.js - Manager Complaint Management Controller
import { Complaint } from "../../models/Complaint.model.js";
import { Staff } from "../../models/Staff.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";

/**
 * Get all complaints for the branch
 * GET /api/v1/manager/complaints
 * @access Manager
 */
export const getAllComplaints = async (req, res, next) => {
  try {
    const managerId = req.user._id;
    const { status, priority, limit, skip, sortBy, sortOrder } = req.query;

    // Validate query parameters
    const { error } = validateGetComplaintsQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter for manager's branch
    const filter = {
      branch: req.user.branch, // Manager can only see complaints from their branch
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    // Build sort criteria
    const sort = {};
    sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

    // Get complaints with pagination
    const complaints = await Complaint.find(filter)
      .populate("user", "name phone email")
      .populate("assignedTo", "name staffId")
      .populate("resolvedBy", "name staffId")
      .sort(sort)
      .limit(parseInt(limit) || 20)
      .skip(parseInt(skip) || 0);

    const totalCount = await Complaint.countDocuments(filter);

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaints,
          pagination: {
            total: totalCount,
            limit: parseInt(limit) || 20,
            skip: parseInt(skip) || 0,
            hasMore: (parseInt(skip) || 0) + complaints.length < totalCount,
          },
        },
        "Complaints retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting complaints:", error);
    next(error);
  }
};

/**
 * Get complaint details by ID
 * GET /api/v1/manager/complaints/:complaintId
 * @access Manager
 */
export const getComplaintDetails = async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    // Validate complaint ID
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid complaint ID"));
    }

    const complaint = await Complaint.findById(complaintId)
      .populate("user", "name phone email")
      .populate("order", "items totalPrice createdAt")
      .populate("assignedTo", "name staffId role")
      .populate("resolvedBy", "name staffId role")
      .populate("responses.respondedBy", "name staffId role");

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check if complaint belongs to manager's branch
    if (complaint.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only view complaints from your branch")
      );
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { complaint },
          "Complaint details retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting complaint details:", error);
    next(error);
  }
};

/**
 * Update complaint status
 * PUT /api/v1/manager/complaints/:complaintId/status
 * @access Manager
 */
export const updateComplaintStatus = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { status, resolution, internalNotes } = req.body;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateStatusUpdate({
      complaintId,
      status,
      resolution,
      internalNotes,
    });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get complaint
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check branch access
    if (complaint.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only update complaints from your branch")
      );
    }

    // Validate status transition
    const validTransitions = {
      pending: ["in_progress", "resolved", "cancelled"],
      in_progress: ["resolved", "escalated", "cancelled"],
      escalated: ["resolved", "cancelled"],
      resolved: ["reopened"],
      cancelled: ["reopened"],
    };

    if (!validTransitions[complaint.status]?.includes(status)) {
      return next(
        new APIError(
          400,
          `Cannot change status from ${complaint.status} to ${status}`
        )
      );
    }

    // Prepare update data
    const updateData = {
      status,
      updatedAt: new Date(),
      $push: {
        statusHistory: {
          status,
          updatedBy: managerId,
          timestamp: new Date(),
          notes: internalNotes,
        },
      },
    };

    // Set resolution data if resolving
    if (status === "resolved") {
      updateData.resolution = resolution;
      updateData.resolvedBy = managerId;
      updateData.resolvedAt = new Date();

      // Calculate and set coin compensation based on priority
      const coinCompensationMap = {
        low: 50,
        medium: 100,
        high: 200,
        urgent: 500,
      };
      const coinAmount = coinCompensationMap[complaint.priority] || 100;
      updateData.coinCompensation = coinAmount;

      // Award coins to user
      try {
        await CoinTransaction.createTransaction({
          userId: complaint.user,
          type: "earned",
          amount: coinAmount,
          description: `Compensation for complaint #${complaint.complaintId}`,
          metadata: {
            complaintId: complaint._id,
            priority: complaint.priority,
            adminReason: "Complaint resolution compensation",
          },
        });
        logger.info(
          `Awarded ${coinAmount} coins to user ${complaint.user} for complaint ${complaint.complaintId}`
        );
      } catch (coinError) {
        logger.error("Error awarding coins for complaint resolution:", coinError);
        // Don't block resolution if coin award fails
      }
    }

    // Add internal notes if provided
    if (internalNotes) {
      updateData.internalNotes = internalNotes;
    }

    const updatedComplaint = await Complaint.findByIdAndUpdate(
      complaintId,
      updateData,
      { new: true }
    )
      .populate("assignedTo", "name staffId")
      .populate("resolvedBy", "name staffId");

    logger.info(
      `Complaint ${complaintId} status updated to ${status} by manager ${managerId}`
    );

    // TODO: Notify assigned staff of status change (Phase 7)
    // if (updatedComplaint.assignedTo) {
    //   await notificationService.notifyStaffComplaintUpdated(updatedComplaint, req.user, "status_changed");
    // }

    // TODO: Notify user of status change (Phase 7)
    // await notificationService.notifyUserComplaintUpdated(updatedComplaint, status);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { complaint: updatedComplaint },
          `Complaint status updated to ${status}`
        )
      );
  } catch (error) {
    logger.error("Error updating complaint status:", error);
    next(error);
  }
};

/**
 * Assign complaint to staff member
 * PUT /api/v1/manager/complaints/:complaintId/assign/:staffId
 * @access Manager
 */
export const assignComplaintToStaff = async (req, res, next) => {
  try {
    const { complaintId, staffId } = req.params;
    const { notes } = req.body || {};
    const managerId = req.user._id;

    // Validate IDs
    if (
      !complaintId.match(/^[0-9a-fA-F]{24}$/) ||
      !staffId.match(/^[0-9a-fA-F]{24}$/)
    ) {
      return next(new APIError(400, "Invalid complaint or staff ID"));
    }

    // Get complaint and staff
    const [complaint, staff] = await Promise.all([
      Complaint.findById(complaintId),
      Staff.findById(staffId),
    ]);

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (complaint.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only assign complaints from your branch")
      );
    }

    if (staff.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only assign to staff from your branch")
      );
    }

    // Check if staff has permission to handle complaints
    if (!staff.permissions?.handleComplaints) {
      return next(
        new APIError(
          400,
          "Staff member doesn't have permission to handle complaints"
        )
      );
    }

    // Update complaint
    const updateData = {
      assignedTo: staffId,
      status: complaint.status === "pending" ? "in_progress" : complaint.status,
      updatedAt: new Date(),
      $push: {
        statusHistory: {
          status:
            complaint.status === "pending" ? "in_progress" : complaint.status,
          updatedBy: managerId,
          timestamp: new Date(),
          notes: `Assigned to ${staff.name}${notes ? ` - ${notes}` : ""}`,
        },
      },
    };

    const updatedComplaint = await Complaint.findByIdAndUpdate(
      complaintId,
      updateData,
      { new: true }
    ).populate("assignedTo", "name staffId role");

    logger.info(
      `Complaint ${complaintId} assigned to staff ${staffId} by manager ${managerId}`
    );

    // TODO: Notify assigned staff (Phase 7 - notificationService)
    // await notificationService.notifyStaffComplaintAssigned(updatedComplaint, staffId);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { complaint: updatedComplaint },
          `Complaint assigned to ${staff.name}`
        )
      );
  } catch (error) {
    logger.error("Error assigning complaint:", error);
    next(error);
  }
};

/**
 * Reassign complaint to different staff member
 * PUT /api/v1/manager/complaints/:complaintId/reassign/:staffId
 * @access Manager
 */
export const reassignComplaint = async (req, res, next) => {
  try {
    const { complaintId, staffId } = req.params;
    const { notes } = req.body;
    const managerId = req.user._id;

    // Validate IDs
    if (
      !complaintId.match(/^[0-9a-fA-F]{24}$/) ||
      !staffId.match(/^[0-9a-fA-F]{24}$/)
    ) {
      return next(new APIError(400, "Invalid complaint or staff ID"));
    }

    // Get complaint and new staff
    const [complaint, newStaff] = await Promise.all([
      Complaint.findById(complaintId),
      Staff.findById(staffId),
    ]);

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    if (!newStaff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (complaint.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only reassign complaints from your branch")
      );
    }

    if (newStaff.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only assign to staff from your branch")
      );
    }

    // Check if staff has permission
    if (!newStaff.permissions?.handleComplaints) {
      return next(
        new APIError(
          400,
          "Staff member doesn't have permission to handle complaints"
        )
      );
    }

    const oldStaffId = complaint.assignedTo;

    // Update assignment
    complaint.assignedTo = staffId;
    complaint.assignedBy = managerId;
    complaint.assignedAt = new Date();
    complaint.staffViewedAt = null; // Reset viewed status
    complaint.staffNotified = false;
    
    complaint.statusHistory.push({
      status: complaint.status,
      updatedBy: managerId,
      updatedByModel: "Manager",
      timestamp: new Date(),
      notes: `Reassigned to ${newStaff.name}${notes ? ` - ${notes}` : ""}`,
    });

    complaint.updatedBy = {
      userType: "manager",
      userId: managerId,
      timestamp: new Date(),
    };

    await complaint.save();

    logger.info(
      `Complaint ${complaintId} reassigned from ${oldStaffId} to ${staffId} by manager ${managerId}`
    );

    // TODO: Notify old staff (Phase 7)
    // if (oldStaffId) {
    //   await notificationService.notifyStaffComplaintReassigned(complaint, oldStaffId, "removed");
    // }
    
    // TODO: Notify new staff (Phase 7)
    // await notificationService.notifyStaffComplaintAssigned(complaint, staffId);

    res.status(200).json(
      new APIResponse(
        200,
        { complaint },
        `Complaint reassigned to ${newStaff.name} successfully`
      )
    );
  } catch (error) {
    logger.error("Error reassigning complaint:", error);
    next(error);
  }
};

/**
 * Add response to complaint
 * POST /api/v1/manager/complaints/:complaintId/response
 * @access Manager
 */
export const addComplaintResponse = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { message, isPublic } = req.body;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateComplaintResponse({
      complaintId,
      message,
      isPublic,
    });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get complaint
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check branch access
    if (complaint.branch?.toString() !== req.user.branch?.toString()) {
      return next(
        new APIError(403, "You can only respond to complaints from your branch")
      );
    }

    // Add response
    const response = {
      message,
      respondedBy: managerId,
      respondedAt: new Date(),
      isPublic: isPublic || false,
    };

    const updatedComplaint = await Complaint.findByIdAndUpdate(
      complaintId,
      {
        $push: { responses: response },
        updatedAt: new Date(),
      },
      { new: true }
    ).populate("responses.respondedBy", "name staffId role");

    logger.info(
      `Response added to complaint ${complaintId} by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { complaint: updatedComplaint },
          "Response added successfully"
        )
      );
  } catch (error) {
    logger.error("Error adding complaint response:", error);
    next(error);
  }
};

/**
 * Get complaint analytics for the branch
 * GET /api/v1/manager/complaints/analytics/summary
 * @access Manager
 */
export const getComplaintAnalytics = async (req, res, next) => {
  try {
    const branchId = req.user.branch;
    const { period = "30" } = req.query; // days

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Build filter
    const filter = {
      branch: branchId,
      createdAt: { $gte: startDate },
    };

    // Get complaint statistics
    const [
      totalComplaints,
      statusBreakdown,
      priorityBreakdown,
      categoryBreakdown,
      resolutionTimeStats,
      recentComplaints,
    ] = await Promise.all([
      // Total complaints
      Complaint.countDocuments(filter),

      // Status breakdown
      Complaint.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Priority breakdown
      Complaint.aggregate([
        { $match: filter },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),

      // Category breakdown
      Complaint.aggregate([
        { $match: filter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),

      // Resolution time stats
      Complaint.aggregate([
        {
          $match: {
            ...filter,
            status: "resolved",
            resolvedAt: { $exists: true },
          },
        },
        {
          $project: {
            resolutionTimeHours: {
              $divide: [
                { $subtract: ["$resolvedAt", "$createdAt"] },
                1000 * 60 * 60, // Convert to hours
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionTime: { $avg: "$resolutionTimeHours" },
            minResolutionTime: { $min: "$resolutionTimeHours" },
            maxResolutionTime: { $max: "$resolutionTimeHours" },
          },
        },
      ]),

      // Recent complaints
      Complaint.find(filter)
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title status priority category createdAt user"),
    ]);

    // Format data
    const analytics = {
      period: `${period} days`,
      totalComplaints,
      statusDistribution: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      priorityDistribution: priorityBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      categoryDistribution: categoryBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      resolutionMetrics:
        resolutionTimeStats.length > 0
          ? {
              averageResolutionTime:
                Math.round(resolutionTimeStats[0].avgResolutionTime * 100) /
                100,
              fastestResolution:
                Math.round(resolutionTimeStats[0].minResolutionTime * 100) /
                100,
              slowestResolution:
                Math.round(resolutionTimeStats[0].maxResolutionTime * 100) /
                100,
            }
          : null,
      recentComplaints,
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          analytics,
          "Complaint analytics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting complaint analytics:", error);
    next(error);
  }
};

// Validation schemas
const validateGetComplaintsQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(
        "all",
        "pending",
        "in_progress",
        "resolved",
        "escalated",
        "cancelled",
        "reopened"
      )
      .optional(),
    priority: Joi.string()
      .valid("all", "low", "medium", "high", "urgent")
      .optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "priority", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    complaintId: Joi.string().length(24).hex().required(),
    status: Joi.string()
      .valid(
        "pending",
        "in_progress",
        "resolved",
        "escalated",
        "cancelled",
        "reopened"
      )
      .required(),
    resolution: Joi.string().min(10).max(1000).when("status", {
      is: "resolved",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    internalNotes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

const validateComplaintResponse = (data) => {
  const schema = Joi.object({
    complaintId: Joi.string().length(24).hex().required(),
    message: Joi.string().min(5).max(1000).required(),
    isPublic: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

export default {
  getAllComplaints,
  getComplaintDetails,
  updateComplaintStatus,
  assignComplaintToStaff,
  reassignComplaint,
  addComplaintResponse,
  getComplaintAnalytics,
};
