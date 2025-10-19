// src/controllers/manager/staffController.js - Manager Staff Management Controller
import { Staff } from "../../models/Staff.model.js";
import { Order } from "../../models/Order.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { staffValidationSchemas } from "../../models/Staff.model.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";
import bcrypt from "bcrypt";

/**
 * Create new staff member
 * POST /api/v1/manager/staff
 * @access Manager
 */
export const createStaff = async (req, res, next) => {
  try {
    const managerId = req.user._id;
    const managerBranch = req.user.branch;
    const managerHotel = req.user.hotel;

    // Validate request body
    const { error } = staffValidationSchemas.register.validate(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    const {
      name,
      email,
      phone,
      password,
      role,
      department,
      permissions,
      emergencyContact,
      profileImage,
    } = req.body;

    // Check if staff with email already exists
    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) {
      return next(
        new APIError(409, "Staff member with this email already exists")
      );
    }

    // Create staff data
    const staffData = {
      name,
      email,
      phone,
      password,
      role,
      department,
      hotel: managerHotel,
      branch: managerBranch,
      manager: managerId,
      createdBy: managerId,
      permissions,
      emergencyContact,
      profileImage,
    };

    // Create staff member
    const staff = new Staff(staffData);
    await staff.save();

    // Remove password from response
    const staffResponse = staff.toObject();
    delete staffResponse.password;
    delete staffResponse.refreshToken;

    logger.info(`Staff member created: ${staff._id} by manager ${managerId}`);

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { staff: staffResponse },
          "Staff member created successfully"
        )
      );
  } catch (error) {
    logger.error("Error creating staff:", error);
    next(error);
  }
};

/**
 * Get staff member by ID
 * GET /api/v1/manager/staff/:staffId
 * @access Manager
 */
export const getStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const managerBranch = req.user.branch;

    // Validate staff ID
    if (!staffId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid staff ID"));
    }

    const staff = await Staff.findById(staffId)
      .populate("hotel", "name")
      .populate("branch", "name")
      .populate("manager", "name")
      .select("-password -refreshToken");

    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check if staff belongs to manager's branch
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(403, "You can only view staff from your branch")
      );
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff },
          "Staff member details retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting staff details:", error);
    next(error);
  }
};

/**
 * Get all staff members for the branch
 * GET /api/v1/manager/staff
 * @access Manager
 */
export const getAllStaff = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const { role, status, department, limit, skip, sortBy, sortOrder } =
      req.query;

    // Validate query parameters
    const { error } = validateGetStaffQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter for manager's branch
    const filter = { branch: managerBranch };

    if (role && role !== "all") {
      filter.role = role;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (department && department !== "all") {
      filter.department = department;
    }

    // Build sort criteria
    const sort = {};
    sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

    // Get staff with pagination
    const staff = await Staff.find(filter)
      .populate("hotel", "name")
      .populate("branch", "name")
      .select("-password -refreshToken")
      .sort(sort)
      .limit(parseInt(limit) || 20)
      .skip(parseInt(skip) || 0);

    const totalCount = await Staff.countDocuments(filter);

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff,
          pagination: {
            total: totalCount,
            limit: parseInt(limit) || 20,
            skip: parseInt(skip) || 0,
            hasMore: (parseInt(skip) || 0) + staff.length < totalCount,
          },
        },
        "Staff members retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting staff list:", error);
    next(error);
  }
};

/**
 * Update staff member
 * PUT /api/v1/manager/staff/:staffId
 * @access Manager
 */
export const updateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate staff ID
    if (!staffId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid staff ID"));
    }

    // Validate request body
    const { error } = staffValidationSchemas.updateProfile.validate(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get current staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check if staff belongs to manager's branch
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(403, "You can only update staff from your branch")
      );
    }

    // Update staff
    const updatedStaff = await Staff.findByIdAndUpdate(
      staffId,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    logger.info(`Staff ${staffId} updated by manager ${managerId}`);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          "Staff member updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating staff:", error);
    next(error);
  }
};

/**
 * Delete staff member
 * DELETE /api/v1/manager/staff/:staffId
 * @access Manager
 */
export const deleteStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate staff ID
    if (!staffId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid staff ID"));
    }

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check if staff belongs to manager's branch
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(403, "You can only delete staff from your branch")
      );
    }

    // Check if staff has active orders
    const activeOrders = await Order.countDocuments({
      staff: staffId,
      status: { $in: ["pending", "preparing", "ready"] },
    });

    if (activeOrders > 0) {
      return next(
        new APIError(
          400,
          `Cannot delete staff member with ${activeOrders} active orders`
        )
      );
    }

    // Soft delete by updating status
    await Staff.findByIdAndUpdate(staffId, {
      status: "inactive",
      isAvailable: false,
      deletedAt: new Date(),
      deletedBy: managerId,
    });

    logger.info(`Staff ${staffId} deleted by manager ${managerId}`);

    res
      .status(200)
      .json(new APIResponse(200, null, "Staff member deleted successfully"));
  } catch (error) {
    logger.error("Error deleting staff:", error);
    next(error);
  }
};

/**
 * Update staff status
 * PUT /api/v1/manager/staff/:staffId/status
 * @access Manager
 */
export const updateStaffStatus = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { status } = req.body;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate input
    const { error } = staffValidationSchemas.updateStatus.validate({ status });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(403, "You can only update staff from your branch")
      );
    }

    // Update status
    const updatedStaff = await Staff.findByIdAndUpdate(
      staffId,
      {
        status,
        isAvailable: status === "active",
        updatedAt: new Date(),
      },
      { new: true }
    ).select("-password -refreshToken");

    logger.info(
      `Staff ${staffId} status updated to ${status} by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          `Staff status updated to ${status}`
        )
      );
  } catch (error) {
    logger.error("Error updating staff status:", error);
    next(error);
  }
};

/**
 * Get staff performance metrics
 * GET /api/v1/manager/staff/:staffId/performance
 * @access Manager
 */
export const getStaffPerformance = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { days = 30 } = req.query;
    const managerBranch = req.user.branch;

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(
          403,
          "You can only view performance of staff from your branch"
        )
      );
    }

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get performance data based on role
    let performanceData = {};

    if (staff.role === "waiter") {
      // Get orders handled by this waiter
      const orders = await Order.find({
        staff: staffId,
        createdAt: { $gte: startDate },
      }).select("status totalPrice actualServiceTime customerRating createdAt");

      const totalOrders = orders.length;
      const completedOrders = orders.filter(
        (o) => o.status === "completed"
      ).length;
      const totalRevenue = orders.reduce(
        (sum, order) => sum + order.totalPrice,
        0
      );

      const serviceTimes = orders
        .filter((o) => o.actualServiceTime)
        .map((o) => o.actualServiceTime);
      const avgServiceTime =
        serviceTimes.length > 0
          ? serviceTimes.reduce((sum, time) => sum + time, 0) /
            serviceTimes.length
          : 0;

      const ratings = orders
        .filter((o) => o.customerRating)
        .map((o) => o.customerRating);
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          : 0;

      performanceData = {
        totalOrders,
        completedOrders,
        completionRate:
          totalOrders > 0
            ? ((completedOrders / totalOrders) * 100).toFixed(2)
            : 0,
        totalRevenue,
        avgOrderValue:
          totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0,
        avgServiceTime: Math.round(avgServiceTime),
        avgCustomerRating: parseFloat(avgRating.toFixed(2)),
        currentActiveOrders: staff.activeOrdersCount || 0,
      };
    } else {
      // For other roles, show basic performance metrics
      performanceData = {
        performanceRating: staff.performanceRating,
        assignmentStats: staff.assignmentStats,
        trainingCompleted: staff.trainingCompleted || [],
        lastLogin: staff.lastLogin,
      };
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          staff: {
            id: staff._id,
            name: staff.name,
            role: staff.role,
            department: staff.department,
          },
          period: `${days} days`,
          performance: performanceData,
        },
        "Staff performance retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting staff performance:", error);
    next(error);
  }
};

/**
 * Update staff performance rating
 * PUT /api/v1/manager/staff/:staffId/performance
 * @access Manager
 */
export const updateStaffPerformance = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { performanceRating } = req.body;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate input
    const { error } = staffValidationSchemas.updatePerformance.validate({
      performanceRating,
    });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(
          403,
          "You can only update performance of staff from your branch"
        )
      );
    }

    // Update performance rating
    const updatedStaff = await Staff.findByIdAndUpdate(
      staffId,
      {
        performanceRating,
        updatedAt: new Date(),
      },
      { new: true }
    ).select("-password -refreshToken");

    logger.info(
      `Staff ${staffId} performance rating updated to ${performanceRating} by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          "Performance rating updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating staff performance:", error);
    next(error);
  }
};

/**
 * Add training record for staff
 * POST /api/v1/manager/staff/:staffId/training
 * @access Manager
 */
export const addStaffTraining = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { module, score } = req.body;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate input
    const { error } = staffValidationSchemas.addTraining.validate({
      module,
      score,
    });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(
          403,
          "You can only add training for staff from your branch"
        )
      );
    }

    // Add training record
    const trainingRecord = {
      module,
      score,
      completedAt: new Date(),
    };

    const updatedStaff = await Staff.findByIdAndUpdate(
      staffId,
      {
        $push: { trainingCompleted: trainingRecord },
        updatedAt: new Date(),
      },
      { new: true }
    ).select("-password -refreshToken");

    logger.info(
      `Training record added for staff ${staffId} by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          "Training record added successfully"
        )
      );
  } catch (error) {
    logger.error("Error adding staff training:", error);
    next(error);
  }
};

/**
 * Get staff schedule
 * GET /api/v1/manager/staff/:staffId/schedule
 * @access Manager
 */
export const getStaffSchedule = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const managerBranch = req.user.branch;

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(
          403,
          "You can only view schedule of staff from your branch"
        )
      );
    }

    const scheduleData = {
      staff: {
        id: staff._id,
        name: staff.name,
        role: staff.role,
      },
      currentShift: staff.currentShift,
      schedule: staff.shiftSchedule || {},
      status: staff.status,
      isAvailable: staff.isAvailable,
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          scheduleData,
          "Staff schedule retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting staff schedule:", error);
    next(error);
  }
};

/**
 * Update staff schedule
 * PUT /api/v1/manager/staff/:staffId/schedule
 * @access Manager
 */
export const updateStaffSchedule = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { shiftSchedule, currentShift } = req.body;
    const managerId = req.user._id;
    const managerBranch = req.user.branch;

    // Validate input
    const { error } = validateScheduleUpdate({ shiftSchedule, currentShift });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get staff
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return next(new APIError(404, "Staff member not found"));
    }

    // Check branch access
    if (staff.branch?.toString() !== managerBranch?.toString()) {
      return next(
        new APIError(
          403,
          "You can only update schedule of staff from your branch"
        )
      );
    }

    // Update schedule
    const updateData = { updatedAt: new Date() };
    if (shiftSchedule) updateData.shiftSchedule = shiftSchedule;
    if (currentShift) updateData.currentShift = currentShift;

    const updatedStaff = await Staff.findByIdAndUpdate(staffId, updateData, {
      new: true,
    }).select("-password -refreshToken");

    logger.info(`Staff ${staffId} schedule updated by manager ${managerId}`);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { staff: updatedStaff },
          "Staff schedule updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating staff schedule:", error);
    next(error);
  }
};

// Validation schemas
const validateGetStaffQuery = (data) => {
  const schema = Joi.object({
    role: Joi.string()
      .valid(
        "all",
        "waiter",
        "kitchen_staff",
        "cleaning_staff",
        "cashier",
        "receptionist",
        "security"
      )
      .optional(),
    status: Joi.string()
      .valid("all", "active", "inactive", "on_break", "on_leave", "suspended")
      .optional(),
    department: Joi.string()
      .valid(
        "all",
        "service",
        "kitchen",
        "housekeeping",
        "front_desk",
        "security"
      )
      .optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("name", "createdAt", "updatedAt", "role", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateScheduleUpdate = (data) => {
  const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

  const schema = Joi.object({
    shiftSchedule: Joi.object({
      monday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      tuesday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      wednesday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      thursday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      friday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      saturday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
      sunday: Joi.object({
        start: Joi.string().pattern(timePattern).optional(),
        end: Joi.string().pattern(timePattern).optional(),
        shift: Joi.string()
          .valid("morning", "afternoon", "evening", "night")
          .optional(),
      }).optional(),
    }).optional(),
    currentShift: Joi.string()
      .valid("morning", "afternoon", "evening", "night")
      .optional(),
  });
  return schema.validate(data);
};

export default {
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
};
