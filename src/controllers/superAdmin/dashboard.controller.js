import { Admin } from "../../models/Admin.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { Manager } from "../../models/Manager.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Order } from "../../models/Order.model.js";
import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


/**
 * Get Dashboard Overview
 * Returns comprehensive system statistics
 * @route GET /api/v1/super-admin/dashboard
 */
export const getDashboardOverview = asyncHandler(async (req, res) => {
  // Count total admins (exclude super_admin from count)
  const totalAdmins = await Admin.countDocuments({ role: "admin" });

  // Count total hotels
  const totalHotels = await Hotel.countDocuments();

  // Count total branches
  const totalBranches = await Branch.countDocuments();

  // Count total managers
  const totalManagers = await Manager.countDocuments();

  // Count total staff
  const totalStaff = await Staff.countDocuments();

  // Count active subscriptions
  const activeSubscriptions = await AdminSubscription.countDocuments({
    status: "active",
  });

  // Count expired subscriptions
  const expiredSubscriptions = await AdminSubscription.countDocuments({
    status: "expired",
  });

  // Count pending payment subscriptions
  const pendingSubscriptions = await AdminSubscription.countDocuments({
    status: "pending_payment",
  });

  // Calculate monthly revenue (current month)
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const endOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
    23,
    59,
    59
  );

  // Get all subscriptions with successful payments this month
  const subscriptionsThisMonth = await AdminSubscription.find({
    "paymentHistory.paymentDate": {
      $gte: startOfMonth,
      $lte: endOfMonth,
    },
  }).select("paymentHistory");

  let monthlyRevenue = 0;
  subscriptionsThisMonth.forEach((subscription) => {
    subscription.paymentHistory.forEach((payment) => {
      const paymentDate = new Date(payment.paymentDate);
      if (
        payment.status === "success" &&
        paymentDate >= startOfMonth &&
        paymentDate <= endOfMonth
      ) {
        monthlyRevenue += payment.amount;
      }
    });
  });

  // Calculate total revenue (all time)
  const allSubscriptions =
    await AdminSubscription.find().select("paymentHistory");
  let totalRevenue = 0;
  allSubscriptions.forEach((subscription) => {
    subscription.paymentHistory.forEach((payment) => {
      if (payment.status === "success") {
        totalRevenue += payment.amount;
      }
    });
  });

  // Get recent admins (last 5)
  const recentAdmins = await Admin.find({ role: "admin" })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("name email status createdAt")
    .lean();

  // Get subscriptions expiring soon (within 7 days)
  const expiringSubscriptions = await AdminSubscription.find({
    status: "active",
    endDate: {
      $gte: new Date(),
      $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
    .populate("admin", "name email")
    .populate("plan", "name")
    .lean();

  // Calculate growth metrics (compare with last month)
  const lastMonthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    1
  );
  const lastMonthEnd = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    0,
    23,
    59,
    59
  );

  const adminsLastMonth = await Admin.countDocuments({
    role: "admin",
    createdAt: { $lte: lastMonthEnd },
  });

  const adminsGrowth =
    adminsLastMonth > 0
      ? ((totalAdmins - adminsLastMonth) / adminsLastMonth) * 100
      : 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        overview: {
          totalAdmins,
          totalHotels,
          totalBranches,
          totalManagers,
          totalStaff,
          activeSubscriptions,
          expiredSubscriptions,
          pendingSubscriptions,
          monthlyRevenue: monthlyRevenue.toFixed(2),
          totalRevenue: totalRevenue.toFixed(2),
          adminsGrowth: adminsGrowth.toFixed(2),
        },
        recentAdmins,
        expiringSubscriptions: expiringSubscriptions.map((sub) => ({
          admin: sub.admin,
          plan: sub.plan,
          endDate: sub.endDate,
          daysRemaining: Math.ceil(
            (new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24)
          ),
        })),
      },
      "Dashboard overview retrieved successfully"
    )
  );
  });

/**
 * Get All Admins with Details
 * Returns paginated list of admins with subscription and resource counts
 * @route GET /api/v1/super-admin/admins
 */
export const getAllAdminsWithDetails = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status;
  const subscriptionStatus = req.query.subscriptionStatus;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  // Build filter (exclude super_admin)
  const filter = { role: "admin" };

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Get total count
  const total = await Admin.countDocuments(filter);

  // Get admins with pagination
  const admins = await Admin.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .select("-password -refreshToken -emailVerificationOtp")
    .lean();

  // Enrich each admin with additional data
  const enrichedAdmins = await Promise.all(
    admins.map(async (admin) => {
      // Get subscription details
      const subscription = await AdminSubscription.findOne({
        admin: admin._id,
        status: subscriptionStatus || {
          $in: ["active", "expired", "cancelled", "pending_payment"],
        },
      })
        .populate("plan", "name planId")
        .lean();

      // Get resource counts
      const hotelCount = await Hotel.countDocuments({ createdBy: admin._id });
      const branchCount = await Branch.countDocuments({ admin: admin._id });
      const managerCount = await Manager.countDocuments({ admin: admin._id });
      const staffCount = await Staff.countDocuments({ admin: admin._id });

      // Calculate total revenue from this admin
      let totalRevenue = 0;
      if (subscription && subscription.paymentHistory) {
        subscription.paymentHistory.forEach((payment) => {
          if (payment.status === "success") {
            totalRevenue += payment.amount;
          }
        });
      }

      return {
        ...admin,
        subscription: subscription
          ? {
              id: subscription._id,
              plan: subscription.plan,
              status: subscription.status,
              billingCycle: subscription.billingCycle,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              daysRemaining:
                subscription.status === "active"
                  ? Math.max(
                      0,
                      Math.ceil(
                        (new Date(subscription.endDate) - new Date()) /
                          (1000 * 60 * 60 * 24)
                      )
                    )
                  : 0,
            }
          : null,
        resources: {
          hotels: hotelCount,
          branches: branchCount,
          managers: managerCount,
          staff: staffCount,
        },
        totalRevenue: totalRevenue.toFixed(2),
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        admins: enrichedAdmins,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalAdmins: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Admins retrieved successfully"
    )
  );
  });

/**
 * Get Admin Complete Details
 * Returns comprehensive information about a specific admin
 * @route GET /api/v1/super-admin/admins/:adminId
 */
export const getAdminCompleteDetails = asyncHandler(async (req, res, next) => {
  const { adminId } = req.params;

  // Find admin
  const admin = await Admin.findById(adminId)
    .select("-password -refreshToken -emailVerificationOtp")
    .lean();

  if (!admin) {
    return next(new APIError(404, "Admin not found"));
  }

  if (admin.role === "super_admin") {
    return next(new APIError(403, "Cannot view super admin details"));
  }

  // Get subscription details
  const subscription = await AdminSubscription.findOne({ admin: adminId })
    .populate("plan")
    .lean();

  // Get all hotels owned by this admin
  const hotels = await Hotel.find({ createdBy: adminId }).lean();

  // Get all branches
  const branches = await Branch.find({ admin: adminId })
    .populate("hotel", "name hotelId")
    .lean();

  // Get all managers
  const managers = await Manager.find({ admin: adminId })
    .populate("branch", "name branchId")
    .lean();

  // Get all staff
  const staff = await Staff.find({ admin: adminId })
    .populate("branch", "name branchId")
    .populate("manager", "name")
    .lean();

  // Calculate total income from all orders
  const hotelIds = hotels.map((h) => h._id);
  const orders = await Order.find({
    hotel: { $in: hotelIds },
    "payment.paymentStatus": "paid",
  }).select("totalPrice createdAt");

  let totalIncome = 0;
  orders.forEach((order) => {
    totalIncome += order.totalPrice;
  });

  // Calculate monthly income
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const monthlyOrders = orders.filter(
    (order) => new Date(order.createdAt) >= startOfMonth
  );
  const monthlyIncome = monthlyOrders.reduce(
    (sum, order) => sum + order.totalPrice,
    0
  );

  // Calculate subscription revenue
  let subscriptionRevenue = 0;
  if (subscription && subscription.paymentHistory) {
    subscription.paymentHistory.forEach((payment) => {
      if (payment.status === "success") {
        subscriptionRevenue += payment.amount;
      }
    });
  }

  res.status(200).json(
    new APIResponse(
      200,
      {
        admin: {
          ...admin,
          subscription: subscription
            ? {
                id: subscription._id,
                plan: subscription.plan,
                status: subscription.status,
                billingCycle: subscription.billingCycle,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                autoRenew: subscription.autoRenew,
                usage: subscription.usage,
                paymentHistory: subscription.paymentHistory,
              }
            : null,
        },
        hotels: hotels.map((hotel) => ({
          id: hotel._id,
          name: hotel.name,
          hotelId: hotel.hotelId,
          status: hotel.status,
          branchCount: branches.filter(
            (b) => b.hotel._id.toString() === hotel._id.toString()
          ).length,
        })),
        branches: branches.map((branch) => ({
          id: branch._id,
          name: branch.name,
          branchId: branch.branchId,
          hotel: branch.hotel,
          status: branch.status,
        })),
        managers: managers.map((manager) => ({
          id: manager._id,
          name: manager.name,
          email: manager.email,
          branch: manager.branch,
          status: manager.status,
          staffCount: staff.filter(
            (s) => s.manager?._id?.toString() === manager._id.toString()
          ).length,
        })),
        staff: staff.map((s) => ({
          id: s._id,
          name: s.name,
          email: s.email,
          role: s.role,
          branch: s.branch,
          manager: s.manager,
          status: s.status,
        })),
        financials: {
          totalIncome: totalIncome.toFixed(2),
          monthlyIncome: monthlyIncome.toFixed(2),
          subscriptionRevenue: subscriptionRevenue.toFixed(2),
          totalOrders: orders.length,
          monthlyOrders: monthlyOrders.length,
        },
        summary: {
          totalHotels: hotels.length,
          totalBranches: branches.length,
          totalManagers: managers.length,
          totalStaff: staff.length,
        },
      },
      "Admin details retrieved successfully"
    )
  );
  });

/**
 * Get All Hotels with Admins
 * Returns paginated list of hotels with admin and branch information
 * @route GET /api/v1/super-admin/hotels
 */
export const getAllHotelsWithAdmins = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  // Build filter
  const filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { hotelId: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Get total count
  const total = await Hotel.countDocuments(filter);

  // Get hotels with pagination
  const hotels = await Hotel.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "name email status")
    .lean();

  // Enrich each hotel with additional data
  const enrichedHotels = await Promise.all(
    hotels.map(async (hotel) => {
      // Get branch count
      const branchCount = await Branch.countDocuments({ hotel: hotel._id });

      // Get order statistics
      const orderStats = await Order.aggregate([
        {
          $match: {
            hotel: hotel._id,
            "payment.paymentStatus": "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            totalOrders: { $sum: 1 },
          },
        },
      ]);

      const stats = orderStats[0] || { totalRevenue: 0, totalOrders: 0 };

      return {
        ...hotel,
        branchCount,
        revenue: {
          total: stats.totalRevenue.toFixed(2),
          orders: stats.totalOrders,
        },
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotels: enrichedHotels,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalHotels: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Hotels retrieved successfully"
    )
  );
  });

/**
 * Get All Branches with Details
 * Returns paginated list of branches with hotel and admin information
 * @route GET /api/v1/super-admin/branches
 */
export const getAllBranchesWithDetails = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  // Build filter
  const filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { branchId: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Get total count
  const total = await Branch.countDocuments(filter);

  // Get branches with pagination
  const branches = await Branch.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate("hotel", "name hotelId")
    .populate("admin", "name email")
    .lean();

  // Enrich each branch with additional data
  const enrichedBranches = await Promise.all(
    branches.map(async (branch) => {
      // Get staff count
      const staffCount = await Staff.countDocuments({ branch: branch._id });

      // Get manager count
      const managerCount = await Manager.countDocuments({
        branch: branch._id,
      });

      return {
        ...branch,
        staffCount,
        managerCount,
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        branches: enrichedBranches,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalBranches: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Branches retrieved successfully"
    )
  );
  });

/**
 * Get All Managers with Details
 * Returns paginated list of managers with related information
 * @route GET /api/v1/super-admin/managers
 */
export const getAllManagersWithDetails = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  // Build filter
  const filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Get total count
  const total = await Manager.countDocuments(filter);

  // Get managers with pagination
  const managers = await Manager.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate("branch", "name branchId")
    .populate("admin", "name email")
    .select("-password -refreshToken")
    .lean();

  // Enrich each manager with additional data
  const enrichedManagers = await Promise.all(
    managers.map(async (manager) => {
      // Get staff count under this manager
      const staffCount = await Staff.countDocuments({
        manager: manager._id,
      });

      // Get hotel information through branch
      let hotel = null;
      if (manager.branch) {
        const branch = await Branch.findById(manager.branch._id)
          .populate("hotel", "name hotelId")
          .lean();
        hotel = branch?.hotel || null;
      }

      return {
        ...manager,
        hotel,
        staffCount,
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        managers: enrichedManagers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalManagers: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Managers retrieved successfully"
    )
  );
  });

/**
 * Get All Staff with Details
 * Returns paginated list of staff with related information
 * @route GET /api/v1/super-admin/staff
 */
export const getAllStaffWithDetails = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status;
  const role = req.query.role;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  // Build filter
  const filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Role filter
  if (role) {
    filter.role = role;
  }

  // Get total count
  const total = await Staff.countDocuments(filter);

  // Get staff with pagination
  const staff = await Staff.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate("branch", "name branchId")
    .populate("manager", "name email")
    .populate("admin", "name email")
    .select("-password -refreshToken")
    .lean();

  // Enrich each staff with hotel information
  const enrichedStaff = await Promise.all(
    staff.map(async (s) => {
      // Get hotel information through branch
      let hotel = null;
      if (s.branch) {
        const branch = await Branch.findById(s.branch._id)
          .populate("hotel", "name hotelId")
          .lean();
        hotel = branch?.hotel || null;
      }

      return {
        ...s,
        hotel,
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        staff: enrichedStaff,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalStaff: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Staff retrieved successfully"
    )
  );
  });

/**
 * Get Hotel Income Report
 * Returns income report for a specific hotel by period
 * @route GET /api/v1/super-admin/hotels/:hotelId/income
 */
export const getHotelIncomeReport = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;
  const period = req.query.period || "monthly"; // daily, monthly, yearly
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;

  // Find hotel
  const hotel = await Hotel.findById(hotelId)
    .populate("createdBy", "name email")
    .lean();

  if (!hotel) {
    return next(new APIError(404, "Hotel not found"));
  }

  let dateFilter = {};
  let groupBy = {};

  if (period === "daily") {
    // Daily report for specific month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    dateFilter = { $gte: startDate, $lte: endDate };
    groupBy = {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
      day: { $dayOfMonth: "$createdAt" },
    };
  } else if (period === "monthly") {
    // Monthly report for specific year
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    dateFilter = { $gte: startDate, $lte: endDate };
    groupBy = {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
    };
  } else if (period === "yearly") {
    // Yearly report (last 5 years)
    const startDate = new Date(year - 4, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    dateFilter = { $gte: startDate, $lte: endDate };
    groupBy = {
      year: { $year: "$createdAt" },
    };
  }

  // Aggregate income data
  const incomeData = await Order.aggregate([
    {
      $match: {
        hotel: hotel._id,
        "payment.paymentStatus": "paid",
        createdAt: dateFilter,
      },
    },
    {
      $group: {
        _id: groupBy,
        totalRevenue: { $sum: "$totalPrice" },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: "$totalPrice" },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
    },
  ]);

  // Calculate overall statistics
  const overallStats = await Order.aggregate([
    {
      $match: {
        hotel: hotel._id,
        "payment.paymentStatus": "paid",
        createdAt: dateFilter,
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalPrice" },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: "$totalPrice" },
        maxOrderValue: { $max: "$totalPrice" },
        minOrderValue: { $min: "$totalPrice" },
      },
    },
  ]);

  const stats = overallStats[0] || {
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    maxOrderValue: 0,
    minOrderValue: 0,
  };

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotel: {
          id: hotel._id,
          name: hotel.name,
          hotelId: hotel.hotelId,
          admin: hotel.createdBy,
        },
        period,
        year,
        month: period === "daily" ? month : undefined,
        incomeData,
        statistics: {
          totalRevenue: stats.totalRevenue.toFixed(2),
          totalOrders: stats.totalOrders,
          averageOrderValue: stats.averageOrderValue.toFixed(2),
          maxOrderValue: stats.maxOrderValue.toFixed(2),
          minOrderValue: stats.minOrderValue.toFixed(2),
        },
      },
      "Hotel income report retrieved successfully"
    )
  );
  });

/**
 * Get Branch-wise Income
 * Returns income breakdown by branches for a specific hotel
 * @route GET /api/v1/super-admin/hotels/:hotelId/branch-income
 */
export const getBranchwiseIncome = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;
  const startDate = req.query.startDate
    ? new Date(req.query.startDate)
    : new Date(new Date().getFullYear(), 0, 1);
  const endDate = req.query.endDate
    ? new Date(req.query.endDate)
    : new Date();

  // Find hotel
  const hotel = await Hotel.findById(hotelId).lean();

  if (!hotel) {
    return next(new APIError(404, "Hotel not found"));
  }

  // Get all branches for this hotel
  const branches = await Branch.find({ hotel: hotelId }).lean();

  // Get income data for each branch
  const branchIncomeData = await Promise.all(
    branches.map(async (branch) => {
      const orderStats = await Order.aggregate([
        {
          $match: {
            hotel: hotel._id,
            branch: branch._id,
            "payment.paymentStatus": "paid",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: "$totalPrice" },
          },
        },
      ]);

      const stats = orderStats[0] || {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
      };

      return {
        branch: {
          id: branch._id,
          name: branch.name,
          branchId: branch.branchId,
          location: branch.location,
        },
        revenue: {
          total: stats.totalRevenue.toFixed(2),
          orders: stats.totalOrders,
          averageOrderValue: stats.averageOrderValue.toFixed(2),
        },
      };
    })
  );

  // Calculate total
  const totalRevenue = branchIncomeData.reduce(
    (sum, data) => sum + parseFloat(data.revenue.total),
    0
  );
  const totalOrders = branchIncomeData.reduce(
    (sum, data) => sum + data.revenue.orders,
    0
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotel: {
          id: hotel._id,
          name: hotel.name,
          hotelId: hotel.hotelId,
        },
        dateRange: {
          startDate,
          endDate,
        },
        branches: branchIncomeData,
        summary: {
          totalRevenue: totalRevenue.toFixed(2),
          totalOrders,
          totalBranches: branches.length,
        },
      },
      "Branch-wise income retrieved successfully"
    )
  );
  });

/**
 * Get Revenue Analytics
 * Returns comprehensive revenue analytics and trends
 * @route GET /api/v1/super-admin/analytics
 */
export const getRevenueAnalytics = asyncHandler(async (req, res) => {
  // Calculate total revenue from orders
  const orderRevenue = await Order.aggregate([
    {
      $match: {
        "payment.paymentStatus": "paid",
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalPrice" },
        totalOrders: { $sum: 1 },
      },
    },
  ]);

  const orderStats = orderRevenue[0] || { totalRevenue: 0, totalOrders: 0 };

  // Calculate subscription revenue
  const subscriptions =
    await AdminSubscription.find().select("paymentHistory");
  let subscriptionRevenue = 0;
  subscriptions.forEach((sub) => {
    sub.paymentHistory.forEach((payment) => {
      if (payment.status === "success") {
        subscriptionRevenue += payment.amount;
      }
    });
  });

  // Get revenue trends (last 12 months)
  const last12Months = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          "payment.paymentStatus": "paid",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalPrice" },
          orders: { $sum: 1 },
        },
      },
    ]);

    const stats = monthlyRevenue[0] || { revenue: 0, orders: 0 };

    last12Months.push({
      month: date.toLocaleString("default", { month: "short" }),
      year: date.getFullYear(),
      revenue: stats.revenue.toFixed(2),
      orders: stats.orders,
    });
  }

  // Get top performing hotels
  const topHotels = await Order.aggregate([
    {
      $match: {
        "payment.paymentStatus": "paid",
      },
    },
    {
      $group: {
        _id: "$hotel",
        totalRevenue: { $sum: "$totalPrice" },
        totalOrders: { $sum: 1 },
      },
    },
    {
      $sort: { totalRevenue: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  // Populate hotel details
  const topHotelsWithDetails = await Promise.all(
    topHotels.map(async (item) => {
      const hotel = await Hotel.findById(item._id)
        .select("name hotelId")
        .populate("createdBy", "name")
        .lean();
      return {
        hotel,
        revenue: item.totalRevenue.toFixed(2),
        orders: item.totalOrders,
      };
    })
  );

  // Calculate growth rate (compare last month with previous month)
  const currentMonth = new Date();
  const lastMonthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 1,
    1
  );
  const lastMonthEnd = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    0,
    23,
    59,
    59
  );
  const prevMonthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 2,
    1
  );
  const prevMonthEnd = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 1,
    0,
    23,
    59,
    59
  );

  const lastMonthRevenue = await Order.aggregate([
    {
      $match: {
        "payment.paymentStatus": "paid",
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
      },
    },
  ]);

  const prevMonthRevenue = await Order.aggregate([
    {
      $match: {
        "payment.paymentStatus": "paid",
        createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
      },
    },
  ]);

  const lastRev = lastMonthRevenue[0]?.revenue || 0;
  const prevRev = prevMonthRevenue[0]?.revenue || 0;
  const growthRate = prevRev > 0 ? ((lastRev - prevRev) / prevRev) * 100 : 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        overview: {
          totalOrderRevenue: orderStats.totalRevenue.toFixed(2),
          totalSubscriptionRevenue: subscriptionRevenue.toFixed(2),
          totalRevenue: (
            orderStats.totalRevenue + subscriptionRevenue
          ).toFixed(2),
          totalOrders: orderStats.totalOrders,
          growthRate: growthRate.toFixed(2),
        },
        trends: {
          last12Months,
        },
        topPerformingHotels: topHotelsWithDetails,
      },
      "Revenue analytics retrieved successfully"
    )
  );
  });

/**
 * Get System Statistics
 * Returns comprehensive system-wide statistics
 * @route GET /api/v1/super-admin/statistics
 */
export const getSystemStatistics = asyncHandler(async (req, res) => {
  // Get counts
  const totalAdmins = await Admin.countDocuments({ role: "admin" });
  const activeAdmins = await Admin.countDocuments({
    role: "admin",
    status: "active",
  });
  const totalHotels = await Hotel.countDocuments();
  const activeHotels = await Hotel.countDocuments({ status: "active" });
  const totalBranches = await Branch.countDocuments();
  const totalManagers = await Manager.countDocuments();
  const totalStaff = await Staff.countDocuments();
  const totalOrders = await Order.countDocuments();
  const paidOrders = await Order.countDocuments({
    "payment.paymentStatus": "paid",
  });

  // Subscription statistics
  const activeSubscriptions = await AdminSubscription.countDocuments({
    status: "active",
  });
  const expiredSubscriptions = await AdminSubscription.countDocuments({
    status: "expired",
  });
  const cancelledSubscriptions = await AdminSubscription.countDocuments({
    status: "cancelled",
  });

  // Calculate growth metrics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const newAdmins = await Admin.countDocuments({
    role: "admin",
    createdAt: { $gte: thirtyDaysAgo },
  });
  const newHotels = await Hotel.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
  });
  const newOrders = await Order.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
  });

  // Platform health metrics
  const adminActivationRate =
    totalAdmins > 0 ? (activeAdmins / totalAdmins) * 100 : 0;
  const hotelActivationRate =
    totalHotels > 0 ? (activeHotels / totalHotels) * 100 : 0;
  const orderSuccessRate =
    totalOrders > 0 ? (paidOrders / totalOrders) * 100 : 0;
  const subscriptionRetentionRate =
    activeSubscriptions + expiredSubscriptions + cancelledSubscriptions > 0
      ? (activeSubscriptions /
          (activeSubscriptions +
            expiredSubscriptions +
            cancelledSubscriptions)) *
        100
      : 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        counts: {
          admins: {
            total: totalAdmins,
            active: activeAdmins,
            inactive: totalAdmins - activeAdmins,
          },
          hotels: {
            total: totalHotels,
            active: activeHotels,
            inactive: totalHotels - activeHotels,
          },
          branches: totalBranches,
          managers: totalManagers,
          staff: totalStaff,
          orders: {
            total: totalOrders,
            paid: paidOrders,
            pending: totalOrders - paidOrders,
          },
          subscriptions: {
            active: activeSubscriptions,
            expired: expiredSubscriptions,
            cancelled: cancelledSubscriptions,
            total:
              activeSubscriptions +
              expiredSubscriptions +
              cancelledSubscriptions,
          },
        },
        growth: {
          last30Days: {
            newAdmins,
            newHotels,
            newOrders,
          },
        },
        healthMetrics: {
          adminActivationRate: adminActivationRate.toFixed(2),
          hotelActivationRate: hotelActivationRate.toFixed(2),
          orderSuccessRate: orderSuccessRate.toFixed(2),
          subscriptionRetentionRate: subscriptionRetentionRate.toFixed(2),
        },
      },
      "System statistics retrieved successfully"
    )
  );
  });
