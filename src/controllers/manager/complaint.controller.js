// src/controllers/manager/complaintController.js - Manager Complaint Management Controller
import { Complaint } from "../../models/Complaint.model.js";
import { Staff } from "../../models/Staff.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import {
  emitComplaintAssigned,
  emitComplaintUpdate,
  emitComplaintResolved,
} from "../../socket/complaintEvents.js";
import { getIO } from "../../utils/socketService.js";
import Joi from "joi";
import {
  resolveComplaintCore,
  getComplaintAnalytics as _getComplaintAnalytics,
} from "../../services/complaint.service.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

/**
 * Get all complaints for the branch
 * GET /api/v1/manager/complaints
 * @access Manager
 */
export const getAllComplaints = asyncHandler(async (req, res, next) => {
  const managerId = req.user._id;

  const {
    status,
    priority,
    category,
    unassignedOnly,
    unassigned,
    search,
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  } = req.query;

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

  if (category && category !== "all") {
    filter.category = category;
  }

  // Handle unassigned filter (support both parameter names)
  const isUnassignedOnly = unassignedOnly === "true" || unassigned === "true";
  if (isUnassignedOnly) {
    filter.assignedTo = null;
  }

  // Handle search
  if (search && search.trim()) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { complaintId: { $regex: search, $options: "i" } },
    ];
  }

  // Build sort criteria
  const sort = {};
  sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

  // Calculate pagination
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const skipNum = parseInt(skip) || (pageNum - 1) * limitNum;

  // Get complaints with pagination
  const complaints = await Complaint.find(filter)
    .populate("user", "name phone email")
    .populate("assignedTo", "name email role staffId")
    .populate("resolvedBy", "name staffId")
    .populate("branch", "name")
    .sort(sort)
    .limit(limitNum)
    .skip(skipNum);

  const totalCount = await Complaint.countDocuments(filter);

  res.status(200).json(
    new APIResponse(
      200,
      {
        complaints,
        pagination: {
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          currentPage: pageNum,
          limit: limitNum,
          skip: skipNum,
          hasMore: skipNum + complaints.length < totalCount,
          hasPrevPage: pageNum > 1,
          hasNextPage: skipNum + complaints.length < totalCount,
        },
      },
      "Complaints retrieved successfully"
    )
  );
});

/**
 * Get complaint details by ID
 * GET /api/v1/manager/complaints/:complaintId
 * @access Manager
 */
export const getComplaintDetails = asyncHandler(async (req, res, next) => {
  const { complaintId } = req.params;

  // Validate complaint ID
  if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid complaint ID"));
  }

  const complaint = await Complaint.findById(complaintId)
    .populate("user", "name phone email")
    .populate("branch", "name")
    .populate("hotel", "name")
    .populate("assignedTo", "name email role staffId")
    .populate("resolvedBy", "name email role staffId");

  if (!complaint) {
    return next(new APIError(404, "Complaint not found"));
  }

  // Check if complaint belongs to manager's branch
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  const complaintBranchId = complaint.branch?._id?.toString();

  if (complaintBranchId !== managerBranchId) {
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
});

/**
 * Update complaint status
 * PUT /api/v1/manager/complaints/:complaintId/status
 * @access Manager
 */
export const updateComplaintStatus = asyncHandler(async (req, res, next) => {
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
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  if (complaint.branch?.toString() !== managerBranchId) {
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
    .populate("assignedTo", "name email role staffId")
    .populate("resolvedBy", "name staffId");

  logger.info(
    `Complaint ${complaintId} status updated to ${status} by manager ${managerId}`
  );

  // Emit socket events to notify relevant parties
  try {
    const io = getIO();

    // Notify user of status change
    emitComplaintUpdate(io, complaintId, {
      complaintId,
      userId: updatedComplaint.user,
      staffId: updatedComplaint.assignedTo?._id,
      branchId: updatedComplaint.branch,
      type: "status_updated",
      status,
      message: `Complaint status updated to ${status}`,
      complaint: updatedComplaint.toObject(),
    });

    // If resolved, emit resolved event with coin compensation
    if (status === "resolved" && updatedComplaint.coinCompensation) {
      emitComplaintResolved(io, updatedComplaint.user, {
        complaint: updatedComplaint.toObject(),
        coinCompensation: updatedComplaint.coinCompensation,
        message: `Complaint resolved with ${updatedComplaint.coinCompensation} coins compensation`,
      });
    }

    logger.info(
      `Socket events emitted for complaint ${complaintId} status update`
    );
  } catch (socketError) {
    logger.error(
      "Error emitting socket events for status update:",
      socketError
    );
    // Don't block operation if socket emission fails
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint: updatedComplaint },
        `Complaint status updated to ${status}`
      )
    );
});

/**
 * Assign complaint to staff member
 * PUT /api/v1/manager/complaints/:complaintId/assign/:staffId
 * @access Manager
 */
export const assignComplaintToStaff = asyncHandler(async (req, res, next) => {
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
  // req.user.branch is populated, complaint.branch and staff.branch are ObjectIds
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  if (complaint.branch?.toString() !== managerBranchId) {
    return next(
      new APIError(403, "You can only assign complaints from your branch")
    );
  }

  if (staff.branch?.toString() !== managerBranchId) {
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

  // Emit socket events to notify staff, user, and admin
  try {
    const io = getIO();
    const socketData = {
      complaintId: updatedComplaint._id,
      complaint: updatedComplaint.toObject(),
      type: "complaint_assigned",
      assignedBy: "manager",
      assignedTo: staff.name,
    };

    // Notify assigned staff
    io.to(`staff_${staffId}`).emit("complaint:assigned", {
      ...socketData,
      staffId: staffId,
      message: `You have been assigned complaint #${updatedComplaint.complaintId} by manager`,
    });

    // Notify user (customer)
    io.to(`user_${updatedComplaint.user}`).emit("complaint:assigned", {
      ...socketData,
      userId: updatedComplaint.user,
      message: `Your complaint has been assigned to ${staff.name}`,
    });

    // Notify admins in the hotel (not branch, to avoid duplicate for staff)
    io.to(`hotel_${updatedComplaint.hotel}`).emit("complaint:assigned", {
      ...socketData,
      hotelId: updatedComplaint.hotel,
      message: `Manager assigned complaint #${updatedComplaint.complaintId} to ${staff.name}`,
    });

    logger.info(
      `Socket event emitted for complaint assignment to staff ${staffId}`
    );
  } catch (socketError) {
    logger.error(
      "Error emitting socket event for complaint assignment:",
      socketError
    );
    // Don't block operation if socket emission fails
  }
  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint: updatedComplaint },
        `Complaint assigned to ${staff.name}`
      )
    );
});

/**
 * Reassign complaint to different staff member
 * PUT /api/v1/manager/complaints/:complaintId/reassign/:staffId
 * @access Manager
 */
export const reassignComplaint = asyncHandler(async (req, res, next) => {
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
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  if (complaint.branch?.toString() !== managerBranchId) {
    return next(
      new APIError(403, "You can only reassign complaints from your branch")
    );
  }

  if (newStaff.branch?.toString() !== managerBranchId) {
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

  // Emit socket events to notify both old and new staff
  try {
    const io = getIO();

    // Notify old staff (if any) that complaint was reassigned
    if (oldStaffId) {
      emitComplaintUpdate(io, complaintId, {
        complaintId,
        userId: complaint.user,
        staffId: oldStaffId,
        branchId: complaint.branch,
        type: "reassigned_from",
        message: "Complaint has been reassigned to another staff member",
        complaint: complaint.toObject(),
      });
    }

    // Notify new staff about the assignment
    emitComplaintAssigned(io, staffId, {
      complaint: complaint.toObject(),
      readOnly: true,
      message: `You have been assigned complaint #${complaint.complaintId}`,
      assignedBy: { _id: managerId, name: req.user.name },
      isReassignment: true,
    });

    logger.info(`Socket events emitted for complaint reassignment`);
  } catch (socketError) {
    logger.error("Error emitting socket events for reassignment:", socketError);
    // Don't block operation if socket emission fails
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint },
        `Complaint reassigned to ${newStaff.name} successfully`
      )
    );
});

/**
 * Add response to complaint
 * POST /api/v1/manager/complaints/:complaintId/response
 * @access Manager
 */
export const addComplaintResponse = asyncHandler(async (req, res, next) => {
  const { complaintId } = req.params;
  const { message, isPublic } = req.body;
  const managerId = req.user._id;

  // Validate input
  const { error } = validateComplaintResponse({
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
  // req.user.branch is populated, complaint.branch is ObjectId
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  if (complaint.branch?.toString() !== managerBranchId) {
    return next(
      new APIError(403, "You can only respond to complaints from your branch")
    );
  }

  // Add response
  const response = {
    message,
    respondedBy: {
      userType: "manager",
      userId: managerId,
    },
    respondedAt: new Date(),
    isPublic: isPublic !== undefined ? isPublic : false,
  };

  const updatedComplaint = await Complaint.findByIdAndUpdate(
    complaintId,
    {
      $push: { responses: response },
      updatedAt: new Date(),
    },
    { new: true }
  )
    .populate("user", "name phone email")
    .populate("branch", "name")
    .populate("hotel", "name")
    .populate("assignedTo", "name email role staffId")
    .populate("resolvedBy", "name email role staffId");

  // Emit socket event to notify admin, staff, and user
  try {
    const io = getIO();
    const socketData = {
      complaintId: updatedComplaint._id,
      complaint: updatedComplaint.toObject(),
      message:
        isPublic !== false
          ? "Manager added a response to your complaint"
          : "Manager added an internal response",
      respondedBy: "manager",
      type: "response_added",
    };

    // Always notify admins and staff (even for internal responses)
    // Notify admins in the hotel
    io.to(`hotel_${updatedComplaint.hotel._id}`).emit("complaint:response", {
      ...socketData,
      hotelId: updatedComplaint.hotel._id,
    });

    // Notify assigned staff
    if (updatedComplaint.assignedTo) {
      io.to(`staff_${updatedComplaint.assignedTo._id}`).emit(
        "complaint:response",
        {
          ...socketData,
          staffId: updatedComplaint.assignedTo._id,
        }
      );
    }

    // Only notify user for public responses
    if (isPublic !== false) {
      io.to(`user_${updatedComplaint.user._id}`).emit("complaint:response", {
        ...socketData,
        userId: updatedComplaint.user._id,
      });
    }

    logger.info(
      `Socket event 'complaint:response' emitted for complaint ${updatedComplaint.complaintId}`
    );
  } catch (socketError) {
    logger.error(
      "Error emitting socket event for manager response:",
      socketError
    );
    // Don't block the operation if socket emission fails
  }

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
});

/**
 * Resolve complaint with coin compensation
 * PUT /api/v1/manager/complaints/:complaintId/resolve
 * @access Manager
 */
export const resolveComplaint = asyncHandler(async (req, res, next) => {
  const { complaintId } = req.params;
  const { resolution, internalNotes } = req.body;
  const managerId = req.user._id;
  const managerName = req.user.name;

  // Validate manager authentication
  if (!managerId) {
    return next(new APIError(401, "Manager authentication required"));
  }

  // Validate input
  if (!resolution || resolution.trim().length < 10) {
    return next(
      new APIError(400, "Resolution must be at least 10 characters long")
    );
  }

  // Get complaint
  const complaint = await Complaint.findById(complaintId).populate("user");
  if (!complaint) {
    return next(new APIError(404, "Complaint not found"));
  }

  // Check branch access
  const managerBranchId =
    req.user.branch?._id?.toString() || req.user.branch?.toString();
  if (complaint.branch?.toString() !== managerBranchId) {
    return next(
      new APIError(403, "You can only resolve complaints from your branch")
    );
  }

  // Check if complaint can be resolved
  if (
    !["pending", "in_progress", "escalated", "reopened"].includes(
      complaint.status
    )
  ) {
    return next(
      new APIError(
        400,
        `Cannot resolve complaint with status: ${complaint.status}`
      )
    );
  }

  // Delegate to shared service for resolve + coin logic
  // Manager-specific: adds resolution as response + cleans malformed responses
  const {
    complaint: resolvedComplaint,
    coinTransaction,
    coinsAwarded,
  } = await resolveComplaintCore({
    complaint,
    resolution,
    resolverId: managerId,
    resolverModel: "Manager",
    internalNotes,
    addResolutionResponse: true,
    cleanMalformedResponses: true,
  });

  // Emit socket events to notify admin, staff, and user about resolution
  try {
    const io = getIO();
    const socketData = {
      complaintId: resolvedComplaint._id,
      complaint: resolvedComplaint.toObject(),
      coinCompensation: coinsAwarded,
      type: "resolved",
      resolvedBy: "manager",
    };

    // Notify user
    io.to(`user_${resolvedComplaint.user._id}`).emit("complaint:resolved", {
      ...socketData,
      userId: resolvedComplaint.user._id,
      message: `Your complaint has been resolved by manager. You received ${coinsAwarded} coins as compensation.`,
    });

    // Notify assigned staff
    if (resolvedComplaint.assignedTo) {
      io.to(`staff_${resolvedComplaint.assignedTo._id}`).emit(
        "complaint:resolved",
        {
          ...socketData,
          staffId: resolvedComplaint.assignedTo._id,
          message: `Manager resolved complaint #${resolvedComplaint.complaintId}`,
        }
      );
    }

    // Notify admins in the hotel
    io.to(`hotel_${resolvedComplaint.hotel}`).emit("complaint:resolved", {
      ...socketData,
      hotelId: resolvedComplaint.hotel,
      message: `Manager resolved complaint #${resolvedComplaint.complaintId}`,
    });

    logger.info(
      `Socket events emitted for manager resolution of complaint ${resolvedComplaint.complaintId}`
    );
  } catch (socketError) {
    logger.error(
      "Error emitting socket events for manager resolution:",
      socketError
    );
    // Don't block operation if socket emission fails
  }

  logger.info(
    `Complaint ${resolvedComplaint.complaintId} resolved by manager ${managerName} with ${coinsAwarded} coins compensation`
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint: resolvedComplaint, coinTransaction },
        `Complaint resolved successfully. Customer rewarded with ${coinsAwarded} coins.`
      )
    );
});

/**
 * Get complaint analytics for the branch
 * GET /api/v1/manager/complaints/analytics/summary
 * @access Manager
 */
export const getComplaintAnalytics = asyncHandler(async (req, res) => {
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

  // Delegate to shared analytics service
  const analytics = await _getComplaintAnalytics(filter);

  // Add period metadata (manager-specific)
  analytics.period = `${period} days`;

  // Rename keys for backward-compat with manager's response shape
  if (analytics.statusBreakdown) {
    analytics.statusDistribution = analytics.statusBreakdown;
    delete analytics.statusBreakdown;
  }
  if (analytics.priorityBreakdown) {
    analytics.priorityDistribution = analytics.priorityBreakdown;
    delete analytics.priorityBreakdown;
  }
  if (analytics.categoryBreakdown) {
    analytics.categoryDistribution = analytics.categoryBreakdown;
    delete analytics.categoryBreakdown;
  }
  if (analytics.averageResolutionTime) {
    analytics.resolutionMetrics = {
      averageResolutionTime: analytics.averageResolutionTime.hours,
      ...(analytics.averageResolutionTime.fastestHours !== undefined && {
        fastestResolution: analytics.averageResolutionTime.fastestHours,
        slowestResolution: analytics.averageResolutionTime.slowestHours,
      }),
    };
    delete analytics.averageResolutionTime;
  } else {
    analytics.resolutionMetrics = null;
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        analytics,
        "Complaint analytics retrieved successfully"
      )
    );
});

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
    category: Joi.string()
      .valid(
        "all",
        "service",
        "food_quality",
        "cleanliness",
        "staff_behavior",
        "billing",
        "delivery",
        "hygiene",
        "other"
      )
      .optional(),
    unassigned: Joi.boolean().optional(),
    unassignedOnly: Joi.boolean().optional(),
    search: Joi.string().optional(),
    page: Joi.number().integer().min(1).optional(),
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
  resolveComplaint,
  getComplaintAnalytics,
};
