// src/controllers/manager/dashboardController.js - Manager Dashboard Controller
import { Order } from "../../models/Order.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Table } from "../../models/Table.model.js";
import { Manager } from "../../models/Manager.model.js";
import { Booking } from "../../models/Booking.model.js";
import { Complaint } from "../../models/Complaint.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import { logger } from "../../utils/logger.js";
import bcrypt from "bcrypt";
import fs from "fs";
import Joi from "joi";

/**
 * Get manager dashboard overview
 * GET /api/v1/manager/dashboard
 * @access Manager
 */
export const getDashboard = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Calculate date ranges
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get dashboard metrics in parallel
    const [
      todayStats,
      weeklyStats,
      monthlyStats,
      tableStatus,
      staffStatus,
      recentOrders,
      upcomingReservations,
      recentComplaints,
      branchPerformance,
    ] = await Promise.all([
      // Today's statistics
      getDayStats(managerBranch, startOfToday),

      // Weekly statistics
      getDateRangeStats(managerBranch, startOfWeek),

      // Monthly statistics
      getDateRangeStats(managerBranch, startOfMonth),

      // Current table status
      getTableStatusSummary(managerBranch),

      // Staff status
      getStaffStatusSummary(managerBranch),

      // Recent orders (last 10)
      Order.find({ branch: managerBranch })
        .populate("user", "name phone")
        .populate("staff", "name staffId")
        .populate("table", "tableNumber")
        .sort({ createdAt: -1 })
        .limit(10),

      // Upcoming reservations (next 24 hours)
      Booking.find({
        branch: managerBranch,
        reservationTime: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        status: { $in: ["confirmed", "seated"] },
      })
        .populate("table", "tableNumber seatingCapacity")
        .sort({ reservationTime: 1 })
        .limit(10),

      // Recent complaints (last 5)
      Complaint.find({ branch: managerBranch })
        .populate("user", "name phone")
        .populate("assignedTo", "name staffId")
        .sort({ createdAt: -1 })
        .limit(5),

      // Branch performance metrics
      getBranchPerformanceMetrics(managerBranch, startOfMonth),
    ]);

    const dashboard = {
      summary: {
        today: todayStats,
        thisWeek: weeklyStats,
        thisMonth: monthlyStats,
      },
      operationalStatus: {
        tables: tableStatus,
        staff: staffStatus,
      },
      recentActivity: {
        orders: recentOrders.map((order) => ({
          id: order._id,
          orderNumber: order.orderNumber,
          customerName: order.user?.name || "Guest",
          table: order.table?.tableNumber || "N/A",
          status: order.status,
          totalPrice: order.totalPrice,
          createdAt: order.createdAt,
          waiter: order.staff?.name || "Unassigned",
        })),
        reservations: upcomingReservations.map((reservation) => ({
          id: reservation._id,
          customerName: reservation.customerName,
          table: reservation.table?.tableNumber,
          partySize: reservation.partySize,
          reservationTime: reservation.reservationTime,
          status: reservation.status,
        })),
        complaints: recentComplaints.map((complaint) => ({
          id: complaint._id,
          title: complaint.title,
          customer: complaint.user?.name || "Anonymous",
          priority: complaint.priority,
          status: complaint.status,
          createdAt: complaint.createdAt,
          assignedTo: complaint.assignedTo?.name || "Unassigned",
        })),
      },
      performance: branchPerformance,
    };

    res
      .status(200)
      .json(
        new APIResponse(200, dashboard, "Dashboard data retrieved successfully")
      );
  } catch (error) {
    logger.error("Error getting dashboard:", error);
    next(error);
  }
};

/**
 * Get branch analytics
 * GET /api/v1/manager/analytics
 * @access Manager
 */
export const getBranchAnalytics = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const { period = "30", metrics = "all" } = req.query;

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const filter = {
      branch: managerBranch,
      createdAt: { $gte: startDate },
    };

    // Get comprehensive analytics
    const [
      orderAnalytics,
      revenueAnalytics,
      staffAnalytics,
      customerAnalytics,
      tableAnalytics,
      complaintAnalytics,
    ] = await Promise.all([
      // Order analytics
      getOrderAnalytics(filter, startDate),

      // Revenue analytics
      getRevenueAnalytics(filter),

      // Staff performance analytics
      getStaffAnalytics(managerBranch, startDate),

      // Customer analytics
      getCustomerAnalytics(filter),

      // Table utilization analytics
      getTableAnalytics(managerBranch, startDate),

      // Complaint analytics
      getComplaintAnalytics({ ...filter, branch: managerBranch }),
    ]);

    const analytics = {
      period: `${period} days`,
      dateRange: {
        start: startDate,
        end: new Date(),
      },
      orders: orderAnalytics,
      revenue: revenueAnalytics,
      staff: staffAnalytics,
      customers: customerAnalytics,
      tables: tableAnalytics,
      complaints: complaintAnalytics,
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          analytics,
          "Branch analytics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting branch analytics:", error);
    next(error);
  }
};

/**
 * Get manager profile
 * GET /api/v1/manager/profile
 * @access Manager
 */
export const getManagerProfile = async (req, res, next) => {
  try {
    const managerId = req.user._id;

    const manager = await Manager.findById(managerId)
      .populate("branch", "name address city state phone email")
      .populate("hotel", "name address city state phone email")
      .select("-password");

    if (!manager) {
      return next(new APIError(404, "Manager profile not found"));
    }

    // Get manager statistics
    const managerStats = await getManagerStats(managerId, manager.branch._id);

    const profile = {
      personal: {
        id: manager._id,
        name: manager.name,
        email: manager.email,
        phone: manager.phone,
        staffId: manager.staffId,
        position: manager.position || "Branch Manager",
        joinedAt: manager.createdAt,
        lastLogin: manager.lastLogin,
      },
      branch: {
        id: manager.branch._id,
        name: manager.branch.name,
        address: manager.branch.address,
        city: manager.branch.city,
        state: manager.branch.state,
        phone: manager.branch.phone,
        email: manager.branch.email,
      },
      hotel: {
        id: manager.hotel._id,
        name: manager.hotel.name,
        address: manager.hotel.address,
        city: manager.hotel.city,
        state: manager.hotel.state,
        phone: manager.hotel.phone,
        email: manager.hotel.email,
      },
      statistics: managerStats,
      permissions: manager.permissions || [],
      settings: manager.settings || {},
    };

    res
      .status(200)
      .json(
        new APIResponse(200, profile, "Manager profile retrieved successfully")
      );
  } catch (error) {
    logger.error("Error getting manager profile:", error);
    next(error);
  }
};

/**
 * Update manager profile
 * PUT /api/v1/manager/profile
 * @access Manager
 */
export const updateManagerProfile = async (req, res, next) => {
  try {
    const managerId = req.user._id;

    // Validate input
    const { error } = validateProfileUpdate(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get current manager
    const manager = await Manager.findById(managerId);
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Update allowed fields
    const allowedUpdates = [
      "name",
      "phone",
      "settings",
      "preferences",
      "profileImage",
    ];
    const updates = {};

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Handle profile image upload
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.path);
        updates.profileImage = result.secure_url;
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error("Error uploading manager profile image:", uploadError);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    updates.updatedAt = new Date();

    const updatedManager = await Manager.findByIdAndUpdate(managerId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    logger.info(`Manager profile updated: ${managerId}`);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { manager: updatedManager },
          "Profile updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating manager profile:", error);
    next(error);
  }
};

/**
 * Change manager password
 * PUT /api/v1/manager/change-password
 * @access Manager
 */
export const changePassword = async (req, res, next) => {
  try {
    const managerId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    const { error } = validatePasswordChange({ currentPassword, newPassword });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get manager with password
    const manager = await Manager.findById(managerId).select("+password");
    if (!manager) {
      return next(new APIError(404, "Manager not found"));
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      manager.password
    );
    if (!isCurrentPasswordValid) {
      return next(new APIError(401, "Current password is incorrect"));
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    manager.password = hashedNewPassword;
    manager.passwordChangedAt = new Date();
    await manager.save();

    logger.info(`Password changed for manager: ${managerId}`);

    res
      .status(200)
      .json(new APIResponse(200, {}, "Password changed successfully"));
  } catch (error) {
    logger.error("Error changing password:", error);
    next(error);
  }
};

// Helper functions
const getDayStats = async (branchId, startDate) => {
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  const [orders, revenue, customers] = await Promise.all([
    Order.countDocuments({
      branch: branchId,
      createdAt: { $gte: startDate, $lt: endDate },
    }),
    Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startDate, $lt: endDate },
          status: { $in: ["completed", "served"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
    Order.distinct("user", {
      branch: branchId,
      createdAt: { $gte: startDate, $lt: endDate },
    }),
  ]);

  return {
    orders,
    revenue: revenue.length > 0 ? revenue[0].total : 0,
    customers: customers.length,
  };
};

const getDateRangeStats = async (branchId, startDate) => {
  const [orders, revenue, customers] = await Promise.all([
    Order.countDocuments({
      branch: branchId,
      createdAt: { $gte: startDate },
    }),
    Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startDate },
          status: { $in: ["completed", "served"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
    Order.distinct("user", {
      branch: branchId,
      createdAt: { $gte: startDate },
    }),
  ]);

  return {
    orders,
    revenue: revenue.length > 0 ? revenue[0].total : 0,
    customers: customers.length,
  };
};

const getTableStatusSummary = async (branchId) => {
  const tables = await Table.aggregate([
    { $match: { branch: branchId, isActive: true } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const statusMap = tables.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const total = Object.values(statusMap).reduce((sum, count) => sum + count, 0);
  const occupied = statusMap.occupied || 0;

  return {
    total,
    available: statusMap.available || 0,
    occupied,
    reserved: statusMap.reserved || 0,
    needsCleaning: statusMap.needs_cleaning || 0,
    outOfOrder: statusMap.out_of_order || 0,
    occupancyRate: total > 0 ? ((occupied / total) * 100).toFixed(1) : 0,
  };
};

const getStaffStatusSummary = async (branchId) => {
  const staff = await Staff.aggregate([
    { $match: { branch: branchId, isActive: true } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const statusMap = staff.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  return {
    total: Object.values(statusMap).reduce((sum, count) => sum + count, 0),
    online: statusMap.online || 0,
    offline: statusMap.offline || 0,
    onBreak: statusMap.on_break || 0,
  };
};

const getBranchPerformanceMetrics = async (branchId, startDate) => {
  const [avgOrderValue, avgServiceTime, customerSatisfaction, staffEfficiency] =
    await Promise.all([
      Order.aggregate([
        {
          $match: {
            branch: branchId,
            createdAt: { $gte: startDate },
            status: { $in: ["completed", "served"] },
          },
        },
        { $group: { _id: null, avg: { $avg: "$totalPrice" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            branch: branchId,
            createdAt: { $gte: startDate },
            completedAt: { $exists: true },
          },
        },
        {
          $addFields: {
            serviceTime: { $subtract: ["$completedAt", "$createdAt"] },
          },
        },
        { $group: { _id: null, avg: { $avg: "$serviceTime" } } },
      ]),
      // Mock customer satisfaction (you might have a rating system)
      Promise.resolve([{ avg: 4.2 }]),
      // Staff efficiency based on orders per hour
      Staff.countDocuments({ branch: branchId, isActive: true }),
    ]);

  return {
    averageOrderValue: avgOrderValue.length > 0 ? avgOrderValue[0].avg : 0,
    averageServiceTime:
      avgServiceTime.length > 0
        ? Math.round(avgServiceTime[0].avg / (1000 * 60))
        : 0, // minutes
    customerSatisfaction: customerSatisfaction[0].avg,
    activeStaff: staffEfficiency,
  };
};

const getOrderAnalytics = async (filter, startDate) => {
  const [statusBreakdown, hourlyDistribution] = await Promise.all([
    Order.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    statusBreakdown: statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    hourlyDistribution: hourlyDistribution.map((item) => ({
      hour: item._id,
      orders: item.count,
    })),
  };
};

const getRevenueAnalytics = async (filter) => {
  const revenueData = await Order.aggregate([
    {
      $match: {
        ...filter,
        status: { $in: ["completed", "served"] },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        revenue: { $sum: "$totalPrice" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  return {
    dailyRevenue: revenueData.map((item) => ({
      date: new Date(item._id.year, item._id.month - 1, item._id.day),
      revenue: item.revenue,
      orders: item.orders,
    })),
    totalRevenue: revenueData.reduce((sum, item) => sum + item.revenue, 0),
  };
};

const getStaffAnalytics = async (branchId, startDate) => {
  const staffPerformance = await Order.aggregate([
    {
      $match: {
        branch: branchId,
        createdAt: { $gte: startDate },
        staff: { $exists: true },
      },
    },
    {
      $group: {
        _id: "$staff",
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: "$totalPrice" },
      },
    },
    { $sort: { orderCount: -1 } },
    {
      $lookup: {
        from: "staff",
        localField: "_id",
        foreignField: "_id",
        as: "staffDetails",
      },
    },
  ]);

  return {
    topPerformers: staffPerformance.slice(0, 5).map((staff) => ({
      id: staff._id,
      name: staff.staffDetails[0]?.name || "Unknown",
      orderCount: staff.orderCount,
      revenue: staff.totalRevenue,
    })),
  };
};

const getCustomerAnalytics = async (filter) => {
  const [newCustomers, returningCustomers] = await Promise.all([
    Order.distinct("user", filter),
    Order.aggregate([
      { $match: filter },
      { $group: { _id: "$user", orderCount: { $sum: 1 } } },
      { $match: { orderCount: { $gt: 1 } } },
    ]),
  ]);

  return {
    newCustomers: newCustomers.length,
    returningCustomers: returningCustomers.length,
    totalCustomers: newCustomers.length,
  };
};

const getTableAnalytics = async (branchId, startDate) => {
  const tableUtilization = await Order.aggregate([
    {
      $match: {
        branch: branchId,
        createdAt: { $gte: startDate },
        table: { $exists: true },
      },
    },
    {
      $group: {
        _id: "$table",
        orderCount: { $sum: 1 },
        revenue: { $sum: "$totalPrice" },
      },
    },
    { $sort: { orderCount: -1 } },
    {
      $lookup: {
        from: "tables",
        localField: "_id",
        foreignField: "_id",
        as: "tableDetails",
      },
    },
  ]);

  return {
    mostUsedTables: tableUtilization.slice(0, 5).map((table) => ({
      id: table._id,
      tableNumber: table.tableDetails[0]?.tableNumber || "Unknown",
      orderCount: table.orderCount,
      revenue: table.revenue,
    })),
  };
};

const getComplaintAnalytics = async (filter) => {
  const complaints = await Complaint.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  return {
    statusBreakdown: complaints.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    total: complaints.reduce((sum, item) => sum + item.count, 0),
  };
};

const getManagerStats = async (managerId, branchId) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);

  const [ordersManaged, staffSupervised, revenueGenerated] = await Promise.all([
    Order.countDocuments({
      branch: branchId,
      createdAt: { $gte: startOfMonth },
    }),
    Staff.countDocuments({
      branch: branchId,
      isActive: true,
    }),
    Order.aggregate([
      {
        $match: {
          branch: branchId,
          createdAt: { $gte: startOfMonth },
          status: { $in: ["completed", "served"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
  ]);

  return {
    thisMonth: {
      ordersManaged,
      staffSupervised,
      revenueGenerated:
        revenueGenerated.length > 0 ? revenueGenerated[0].total : 0,
    },
  };
};

// Validation schemas
const validateProfileUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .optional(),
    settings: Joi.object().optional(),
    preferences: Joi.object().optional(),
  });
  return schema.validate(data);
};

const validatePasswordChange = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      }),
  });
  return schema.validate(data);
};

export default {
  getDashboard,
  getBranchAnalytics,
  getManagerProfile,
  updateManagerProfile,
  changePassword,
};
