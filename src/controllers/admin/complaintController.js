// src/controllers/admin/complaintController.js - Admin Complaint Management Controller
import { Complaint } from "../../models/Complaint.model.js";
import { Staff } from "../../models/Staff.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";

/**
 * Get all complaints (hotel-wide or cross-hotel for super admin)
 * GET /api/v1/admin/complaints
 * @access Admin
 */
export const getAllComplaints = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { 
      status, 
      priority, 
      category,
      hotelId,
      branchId,
      assignedTo,
      unassigned,
      escalated,
      page = 1, 
      limit = 20, 
      sortBy = "createdAt", 
      sortOrder = "desc",
      search
    } = req.query;

    // Validate query parameters
    const { error } = validateGetComplaintsQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter based on admin role
    const filter = {};

    // Super admin can see all complaints
    // Branch admin can see only their hotel's complaints
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id);
      filter.hotel = { $in: hotelIds };
    }

    // Apply filters
    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (category && category !== "all") {
      filter.category = category;
    }

    if (hotelId) {
      filter.hotel = hotelId;
    }

    if (branchId) {
      filter.branch = branchId;
    }

    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    if (unassigned === "true") {
      filter.assignedTo = null;
    }

    if (escalated === "true") {
      filter.status = "escalated";
    }

    // Text search
    if (search) {
      filter.$text = { $search: search };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const complaints = await Complaint.find(filter)
      .populate("user", "name email phone")
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .populate("order", "orderId totalPrice")
      .populate("assignedTo", "name staffId")
      .populate("assignedBy", "name")
      .populate("resolvedBy", "name")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await Complaint.countDocuments(filter);

    // Get status breakdown
    const statusBreakdown = await Complaint.aggregate([
      { $match: adminRole === "branch_admin" ? { hotel: { $in: filter.hotel.$in } } : {} },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaints,
          statusBreakdown: statusBreakdown.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalComplaints: total,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPrevPage: pageNum > 1,
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
 * GET /api/v1/admin/complaints/:complaintId
 * @access Admin
 */
export const getComplaintDetails = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const adminId = req.admin._id;
    const adminRole = req.admin.role;

    // Validate complaint ID format
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid complaint ID"));
    }

    const complaint = await Complaint.findById(complaintId)
      .populate("user", "name email phone")
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location phone")
      .populate("order", "orderId items totalPrice createdAt status")
      .populate("assignedTo", "name staffId email phone")
      .populate("assignedBy", "name")
      .populate("resolvedBy", "name")
      .populate("refundRequest");

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check access for branch admin
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel._id.toString())) {
        return next(new APIError(403, "You can only view complaints from your hotels"));
      }
    }

    res.status(200).json(
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
 * PUT /api/v1/admin/complaints/:complaintId/status
 * @access Admin
 */
export const updateComplaintStatus = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { status, internalNotes } = req.body;
    const adminId = req.admin._id;
    const adminName = req.admin.name;

    // Validate input
    const { error } = validateStatusUpdate({ status, internalNotes });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get complaint
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check access for branch admin
    if (req.admin.role === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel.toString())) {
        return next(new APIError(403, "You can only update complaints from your hotels"));
      }
    }

    // Validate status transition
    const validTransitions = {
      pending: ["in_progress", "cancelled"],
      in_progress: ["resolved", "escalated", "cancelled"],
      escalated: ["in_progress", "resolved"],
      reopened: ["in_progress", "resolved"],
      resolved: ["reopened"],
      cancelled: []
    };

    if (!validTransitions[complaint.status]?.includes(status)) {
      return next(
        new APIError(
          400,
          `Cannot transition from ${complaint.status} to ${status}`
        )
      );
    }

    // Update status
    complaint.status = status;
    if (internalNotes) {
      complaint.internalNotes = internalNotes;
    }

    // Add to status history
    complaint.statusHistory.push({
      status,
      updatedBy: adminId,
      updatedByModel: "Admin",
      timestamp: new Date(),
      notes: internalNotes || `Status updated to ${status} by admin`,
    });

    // Update tracking
    complaint.updatedBy = {
      userType: "admin",
      userId: adminId,
      timestamp: new Date(),
    };

    await complaint.save();

    // TODO: Send notifications
    // await notificationService.notifyUserComplaintUpdated(complaint, { name: adminName }, "status_changed");
    // if (complaint.assignedTo) {
    //   await notificationService.notifyStaffComplaintUpdated(complaint, { name: adminName }, "status_changed");
    // }

    logger.info(`Admin ${adminName} updated complaint ${complaint.complaintId} status to ${status}`);

    res.status(200).json(
      new APIResponse(
        200,
        { complaint },
        "Complaint status updated successfully"
      )
    );
  } catch (error) {
    logger.error("Error updating complaint status:", error);
    next(error);
  }
};

/**
 * Assign complaint to staff
 * PUT /api/v1/admin/complaints/:complaintId/assign/:staffId
 * @access Admin
 */
export const assignComplaintToStaff = async (req, res, next) => {
  try {
    const { complaintId, staffId } = req.params;
    const { notes } = req.body;
    const adminId = req.admin._id;
    const adminName = req.admin.name;

    // Validate IDs
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/) || !staffId.match(/^[0-9a-fA-F]{24}$/)) {
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

    // Check access for branch admin
    if (req.admin.role === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel.toString())) {
        return next(new APIError(403, "You can only assign complaints from your hotels"));
      }
    }

    // Verify staff belongs to the same branch
    if (complaint.branch.toString() !== staff.branch.toString()) {
      return next(
        new APIError(400, "Staff member must be from the same branch as the complaint")
      );
    }

    // Check if already assigned
    if (complaint.assignedTo?.toString() === staffId) {
      return next(new APIError(400, "Complaint is already assigned to this staff member"));
    }

    // Assign complaint
    complaint.assignedTo = staffId;
    complaint.assignedBy = adminId;
    complaint.assignedAt = new Date();
    complaint.staffNotified = true;
    complaint.staffViewedAt = null; // Reset viewed status

    // Add to status history if moving from pending
    if (complaint.status === "pending") {
      complaint.statusHistory.push({
        status: "pending",
        updatedBy: adminId,
        updatedByModel: "Admin",
        timestamp: new Date(),
        notes: notes || `Assigned to staff ${staff.name}`,
      });
    }

    complaint.updatedBy = {
      userType: "admin",
      userId: adminId,
      timestamp: new Date(),
    };

    await complaint.save();

    // TODO: Send notification to staff
    // await notificationService.notifyStaffComplaintAssigned(complaint, staff, { name: adminName });

    logger.info(`Admin ${adminName} assigned complaint ${complaint.complaintId} to staff ${staff.name}`);

    res.status(200).json(
      new APIResponse(
        200,
        { complaint },
        "Complaint assigned successfully"
      )
    );
  } catch (error) {
    logger.error("Error assigning complaint:", error);
    next(error);
  }
};

/**
 * Reassign complaint to different staff
 * PUT /api/v1/admin/complaints/:complaintId/reassign/:staffId
 * @access Admin
 */
export const reassignComplaint = async (req, res, next) => {
  try {
    const { complaintId, staffId } = req.params;
    const { reason } = req.body;
    const adminId = req.admin._id;
    const adminName = req.admin.name;

    // Validate IDs
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/) || !staffId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid complaint or staff ID"));
    }

    // Get complaint and staff
    const [complaint, newStaff] = await Promise.all([
      Complaint.findById(complaintId).populate("assignedTo", "name"),
      Staff.findById(staffId),
    ]);

    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    if (!newStaff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check access for branch admin
    if (req.admin.role === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel.toString())) {
        return next(new APIError(403, "You can only reassign complaints from your hotels"));
      }
    }

    if (!complaint.assignedTo) {
      return next(new APIError(400, "Complaint is not assigned to anyone"));
    }

    if (complaint.assignedTo._id.toString() === staffId) {
      return next(new APIError(400, "Complaint is already assigned to this staff member"));
    }

    // Verify new staff belongs to the same branch
    if (complaint.branch.toString() !== newStaff.branch.toString()) {
      return next(
        new APIError(400, "New staff member must be from the same branch")
      );
    }

    const oldStaff = complaint.assignedTo;

    // Reassign
    complaint.assignedTo = staffId;
    complaint.assignedBy = adminId;
    complaint.assignedAt = new Date();
    complaint.staffNotified = false;
    complaint.staffViewedAt = null; // Reset viewed status

    // Add to status history
    complaint.statusHistory.push({
      status: complaint.status,
      updatedBy: adminId,
      updatedByModel: "Admin",
      timestamp: new Date(),
      notes: reason || `Reassigned from ${oldStaff.name} to ${newStaff.name}`,
    });

    complaint.updatedBy = {
      userType: "admin",
      userId: adminId,
      timestamp: new Date(),
    };

    await complaint.save();

    // TODO: Send notifications
    // await notificationService.notifyStaffComplaintReassigned(complaint, oldStaff, "removed", { name: adminName });
    // await notificationService.notifyStaffComplaintReassigned(complaint, newStaff, "assigned", { name: adminName });

    logger.info(
      `Admin ${adminName} reassigned complaint ${complaint.complaintId} from ${oldStaff.name} to ${newStaff.name}`
    );

    res.status(200).json(
      new APIResponse(
        200,
        { complaint },
        "Complaint reassigned successfully"
      )
    );
  } catch (error) {
    logger.error("Error reassigning complaint:", error);
    next(error);
  }
};

/**
 * Add response to complaint
 * POST /api/v1/admin/complaints/:complaintId/response
 * @access Admin
 */
export const addComplaintResponse = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { message, isInternal = false } = req.body;
    const adminId = req.admin._id;
    const adminName = req.admin.name;

    // Validate input
    const { error } = validateComplaintResponse({ message, isInternal });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get complaint
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      return next(new APIError(404, "Complaint not found"));
    }

    // Check access for branch admin
    if (req.admin.role === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel.toString())) {
        return next(new APIError(403, "You can only respond to complaints from your hotels"));
      }
    }

    // Add response
    const response = {
      message,
      addedBy: {
        userType: "admin",
        userId: adminId,
        name: adminName,
      },
      timestamp: new Date(),
      isInternal,
    };

    complaint.responses.push(response);
    complaint.updatedBy = {
      userType: "admin",
      userId: adminId,
      timestamp: new Date(),
    };

    await complaint.save();

    // TODO: Send notifications (only if public response)
    // if (!isInternal) {
    //   await notificationService.notifyUserComplaintResponse(complaint, response);
    // }
    // if (complaint.assignedTo) {
    //   await notificationService.notifyStaffComplaintUpdated(complaint, { name: adminName }, "response_added");
    // }

    logger.info(
      `Admin ${adminName} added ${isInternal ? "internal" : "public"} response to complaint ${complaint.complaintId}`
    );

    res.status(200).json(
      new APIResponse(
        200,
        { complaint },
        "Response added successfully"
      )
    );
  } catch (error) {
    logger.error("Error adding complaint response:", error);
    next(error);
  }
};

/**
 * Resolve complaint
 * PUT /api/v1/admin/complaints/:complaintId/resolve
 * @access Admin
 */
export const resolveComplaint = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { resolution, internalNotes } = req.body;
    const adminId = req.admin._id;
    const adminName = req.admin.name;

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

    // Check access for branch admin
    if (req.admin.role === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id.toString());
      
      if (!hotelIds.includes(complaint.hotel.toString())) {
        return next(new APIError(403, "You can only resolve complaints from your hotels"));
      }
    }

    // Check if complaint can be resolved
    if (!["pending", "in_progress", "escalated", "reopened"].includes(complaint.status)) {
      return next(
        new APIError(400, `Cannot resolve complaint with status: ${complaint.status}`)
      );
    }

    // Update complaint
    complaint.status = "resolved";
    complaint.resolution = resolution;
    if (internalNotes) {
      complaint.internalNotes = internalNotes;
    }
    complaint.resolvedBy = adminId;
    complaint.resolvedByModel = "Admin";
    complaint.resolvedAt = new Date();
    complaint.canReopen = true;

    // Add to status history
    complaint.statusHistory.push({
      status: "resolved",
      updatedBy: adminId,
      updatedByModel: "Admin",
      timestamp: new Date(),
      notes: `Resolved by admin: ${resolution.substring(0, 100)}`,
    });

    complaint.updatedBy = {
      userType: "admin",
      userId: adminId,
      timestamp: new Date(),
    };

    // Determine coin compensation based on priority
    const coinAmounts = {
      low: 50,
      medium: 100,
      high: 200,
      urgent: 500,
    };

    const coinsToAward = coinAmounts[complaint.priority] || 100;
    complaint.coinCompensation = coinsToAward;

    await complaint.save();

    // Award coins to user
    let coinTransaction = null;
    try {
      coinTransaction = await CoinTransaction.createTransaction({
        user: complaint.user._id,
        hotel: complaint.hotel,
        branch: complaint.branch,
        amount: coinsToAward,
        type: "credit",
        source: "complaint_resolution",
        description: `Complaint resolved: ${complaint.title}`,
        metadata: {
          complaintId: complaint._id,
          complaintNumber: complaint.complaintId,
          priority: complaint.priority,
          resolvedBy: "Admin",
          adminId: adminId,
        },
        adminReason: "Complaint resolution compensation",
      });

      logger.info(
        `Awarded ${coinsToAward} coins to user ${complaint.user._id} for complaint ${complaint.complaintId} resolution`
      );
    } catch (coinError) {
      logger.error("Error awarding coins for complaint resolution:", coinError);
      // Don't fail the resolution if coin award fails
    }

    // TODO: Send notifications
    // await notificationService.notifyUserComplaintResolved(complaint, { name: adminName }, coinsToAward);
    // if (complaint.assignedTo) {
    //   await notificationService.notifyStaffComplaintUpdated(complaint, { name: adminName }, "resolved");
    // }

    logger.info(
      `Admin ${adminName} resolved complaint ${complaint.complaintId} and awarded ${coinsToAward} coins`
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaint,
          coinTransaction,
          message: `Complaint resolved successfully. Customer rewarded with ${coinsToAward} coins.`,
        },
        "Complaint resolved successfully"
      )
    );
  } catch (error) {
    logger.error("Error resolving complaint:", error);
    next(error);
  }
};

/**
 * Get escalated complaints
 * GET /api/v1/admin/complaints/escalated
 * @access Admin
 */
export const getEscalatedComplaints = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { page = 1, limit = 20 } = req.query;

    // Build filter
    const filter = { status: "escalated" };

    // Branch admin can only see their hotels' complaints
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id);
      filter.hotel = { $in: hotelIds };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const complaints = await Complaint.find(filter)
      .populate("user", "name email phone")
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .populate("assignedTo", "name staffId")
      .sort({ escalatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Complaint.countDocuments(filter);

    res.status(200).json(
      new APIResponse(
        200,
        {
          complaints,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalEscalated: total,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPrevPage: pageNum > 1,
          },
        },
        "Escalated complaints retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting escalated complaints:", error);
    next(error);
  }
};

/**
 * Get complaint analytics
 * GET /api/v1/admin/complaints/analytics
 * @access Admin
 */
export const getComplaintAnalytics = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { startDate, endDate, hotelId, branchId } = req.query;

    // Build base filter
    let baseFilter = {};

    // Branch admin can only see their hotels' complaints
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map(h => h._id);
      baseFilter.hotel = { $in: hotelIds };
    }

    if (hotelId) {
      baseFilter.hotel = hotelId;
    }

    if (branchId) {
      baseFilter.branch = branchId;
    }

    // Date range filter
    if (startDate || endDate) {
      baseFilter.createdAt = {};
      if (startDate) {
        baseFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        baseFilter.createdAt.$lte = new Date(endDate);
      }
    }

    // Get aggregated statistics
    const [
      totalComplaints,
      statusBreakdown,
      priorityBreakdown,
      categoryBreakdown,
      averageResolutionTime,
      recentComplaints,
    ] = await Promise.all([
      Complaint.countDocuments(baseFilter),
      
      Complaint.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      
      Complaint.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      
      Complaint.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      
      Complaint.aggregate([
        {
          $match: {
            ...baseFilter,
            status: "resolved",
            resolvedAt: { $exists: true },
          },
        },
        {
          $project: {
            resolutionTime: {
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
            avgResolutionTime: { $avg: "$resolutionTime" },
          },
        },
      ]),
      
      Complaint.find(baseFilter)
        .populate("user", "name")
        .populate("branch", "name")
        .sort({ createdAt: -1 })
        .limit(10)
        .select("complaintId title status priority category createdAt"),
    ]);

    const analytics = {
      totalComplaints,
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      priorityBreakdown: priorityBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      categoryBreakdown: categoryBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      averageResolutionTime: averageResolutionTime[0]
        ? {
            hours: Math.round(averageResolutionTime[0].avgResolutionTime * 10) / 10,
            days: Math.round((averageResolutionTime[0].avgResolutionTime / 24) * 10) / 10,
          }
        : null,
      recentComplaints,
    };

    res.status(200).json(
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
      .valid("all", "pending", "in_progress", "resolved", "escalated", "cancelled", "reopened")
      .optional(),
    priority: Joi.string().valid("all", "low", "medium", "high", "urgent").optional(),
    category: Joi.string()
      .valid("all", "food_quality", "service", "cleanliness", "billing", "staff_behavior", "delivery", "hygiene", "other")
      .optional(),
    hotelId: Joi.string().optional(),
    branchId: Joi.string().optional(),
    assignedTo: Joi.string().optional(),
    unassigned: Joi.string().valid("true", "false").optional(),
    escalated: Joi.string().valid("true", "false").optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sortBy: Joi.string().valid("createdAt", "updatedAt", "priority", "status").optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    search: Joi.string().optional(),
  });
  return schema.validate(data);
};

const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid("pending", "in_progress", "resolved", "escalated", "cancelled", "reopened")
      .required(),
    internalNotes: Joi.string().max(1000).optional(),
  });
  return schema.validate(data);
};

const validateComplaintResponse = (data) => {
  const schema = Joi.object({
    message: Joi.string().min(5).max(1000).required(),
    isInternal: Joi.boolean().optional(),
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
  getEscalatedComplaints,
  getComplaintAnalytics,
};
