import { Order } from "../../models/Order.model.js";
import { Transaction } from "../../models/Transaction.model.js";
import { User } from "../../models/User.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

// Dashboard Overview
export const getDashboardOverview = async (req, res, next) => {
  try {
    const { branchId, timeRange = "30d" } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "1d":
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    // Build query based on admin access
    let branchQuery = {};
    if (branchId) {
      // Check if admin has access to this branch
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(branchId)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
      branchQuery.branch = branchId;
    } else if (req.admin.role === "branch_admin") {
      branchQuery.branch = { $in: req.admin.assignedBranches };
    }

    const dateQuery = { createdAt: { $gte: startDate } };
    const orderQuery = { ...branchQuery, ...dateQuery };

    // Get basic stats
    const [
      totalOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      totalRevenue,
      totalCustomers,
      newCustomers,
      totalBranches,
    ] = await Promise.all([
      Order.countDocuments(orderQuery),
      Order.countDocuments({ ...orderQuery, status: "completed" }),
      Order.countDocuments({ ...orderQuery, status: "cancelled" }),
      Order.countDocuments({
        ...orderQuery,
        status: { $in: ["pending", "confirmed", "preparing"] },
      }),
      Order.aggregate([
        { $match: { ...orderQuery, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      req.admin.role === "branch_admin"
        ? req.admin.assignedBranches.length
        : Branch.countDocuments({ status: "active" }),
    ]);

    const revenue = totalRevenue[0]?.total || 0;

    // Get order trend (daily for last 7 days)
    const trendStartDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const orderTrend = await Order.aggregate([
      { $match: { ...branchQuery, createdAt: { $gte: trendStartDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, "$totalAmount", 0],
            },
          },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Get top performing items
    const topItems = await Order.aggregate([
      { $match: { ...orderQuery, status: "completed" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.foodItem",
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.totalPrice" },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "fooditems",
          localField: "_id",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $project: {
          name: "$item.name",
          quantity: 1,
          revenue: 1,
        },
      },
    ]);

    // Calculate growth rates (compare with previous period)
    const previousPeriodStart = new Date(startDate - (now - startDate));
    const previousOrderQuery = {
      ...branchQuery,
      createdAt: { $gte: previousPeriodStart, $lt: startDate },
    };

    const [previousOrders, previousRevenue] = await Promise.all([
      Order.countDocuments(previousOrderQuery),
      Order.aggregate([
        { $match: { ...previousOrderQuery, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const prevRevenue = previousRevenue[0]?.total || 0;
    const orderGrowth =
      previousOrders > 0
        ? ((totalOrders - previousOrders) / previousOrders) * 100
        : 0;
    const revenueGrowth =
      prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

    res.status(200).json(
      new APIResponse(
        200,
        {
          overview: {
            totalOrders,
            completedOrders,
            cancelledOrders,
            pendingOrders,
            totalRevenue: revenue,
            totalCustomers,
            newCustomers,
            totalBranches,
            orderGrowth: Math.round(orderGrowth * 100) / 100,
            revenueGrowth: Math.round(revenueGrowth * 100) / 100,
          },
          trends: {
            orderTrend,
          },
          topItems,
          timeRange,
        },
        "Dashboard overview retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Sales Reports
export const getSalesReport = async (req, res, next) => {
  try {
    const {
      branchId,
      startDate,
      endDate,
      groupBy = "day", // day, week, month
    } = req.query;

    if (!startDate || !endDate) {
      return next(new APIError(400, "Start date and end date are required"));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Build query based on admin access
    let branchQuery = {};
    if (branchId) {
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(branchId)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
      branchQuery.branch = branchId;
    } else if (req.admin.role === "branch_admin") {
      branchQuery.branch = { $in: req.admin.assignedBranches };
    }

    // Define grouping format
    let dateFormat, sortField;
    switch (groupBy) {
      case "day":
        dateFormat = "%Y-%m-%d";
        sortField = "_id.date";
        break;
      case "week":
        dateFormat = "%Y-%U"; // Year and week number
        sortField = "_id.week";
        break;
      case "month":
        dateFormat = "%Y-%m";
        sortField = "_id.month";
        break;
      default:
        dateFormat = "%Y-%m-%d";
        sortField = "_id.date";
    }

    const salesData = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: start, $lte: end },
          status: "completed",
        },
      },
      {
        $group: {
          _id: {
            [groupBy]: {
              $dateToString: { format: dateFormat, date: "$createdAt" },
            },
          },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          averageOrderValue: { $avg: "$totalAmount" },
        },
      },
      { $sort: { [sortField]: 1 } },
    ]);

    // Get payment method breakdown
    const paymentMethods = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: start, $lte: end },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Get branch-wise breakdown if admin has access to multiple branches
    let branchBreakdown = [];
    if (
      req.admin.role !== "branch_admin" ||
      req.admin.assignedBranches.length > 1
    ) {
      branchBreakdown = await Order.aggregate([
        {
          $match: {
            ...branchQuery,
            createdAt: { $gte: start, $lte: end },
            status: "completed",
          },
        },
        {
          $group: {
            _id: "$branch",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "_id",
            foreignField: "_id",
            as: "branch",
          },
        },
        { $unwind: "$branch" },
        {
          $project: {
            branchName: "$branch.name",
            branchId: "$branch.branchId",
            totalOrders: 1,
            totalRevenue: 1,
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]);
    }

    const totalStats = salesData.reduce(
      (acc, curr) => ({
        orders: acc.orders + curr.totalOrders,
        revenue: acc.revenue + curr.totalRevenue,
      }),
      { orders: 0, revenue: 0 }
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          salesData,
          paymentMethods,
          branchBreakdown,
          summary: {
            totalOrders: totalStats.orders,
            totalRevenue: totalStats.revenue,
            averageOrderValue:
              totalStats.orders > 0
                ? totalStats.revenue / totalStats.orders
                : 0,
            period: { startDate, endDate },
            groupBy,
          },
        },
        "Sales report generated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Profit & Loss Report
export const getProfitLossReport = async (req, res, next) => {
  try {
    const { branchId, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return next(new APIError(400, "Start date and end date are required"));
    }

    // Check financial access permission
    if (!req.admin.hasPermission("viewFinancials")) {
      return next(
        new APIError(403, "You don't have permission to view financial reports")
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    let branchQuery = {};
    if (branchId) {
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(branchId)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
      branchQuery.branch = branchId;
    } else if (req.admin.role === "branch_admin") {
      branchQuery.branch = { $in: req.admin.assignedBranches };
    }

    // Calculate revenue
    const revenueData = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: start, $lte: end },
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
    ]);

    const revenue = revenueData[0]?.totalRevenue || 0;
    const totalOrders = revenueData[0]?.totalOrders || 0;

    // Calculate costs (this would need to be implemented based on your cost structure)
    // For now, we'll use estimated percentages
    const estimatedCosts = {
      foodCosts: revenue * 0.3, // 30% of revenue
      laborCosts: revenue * 0.25, // 25% of revenue
      operatingCosts: revenue * 0.15, // 15% of revenue
      marketingCosts: revenue * 0.05, // 5% of revenue
      otherExpenses: revenue * 0.05, // 5% of revenue
    };

    const totalCosts = Object.values(estimatedCosts).reduce(
      (sum, cost) => sum + cost,
      0
    );
    const grossProfit = revenue - estimatedCosts.foodCosts;
    const netProfit = revenue - totalCosts;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    // Monthly breakdown
    const monthlyData = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: start, $lte: end },
          status: "completed",
        },
      },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      {
        $addFields: {
          estimatedCosts: { $multiply: ["$revenue", 0.8] }, // 80% of revenue as costs
          profit: { $multiply: ["$revenue", 0.2] }, // 20% profit margin
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    res.status(200).json(
      new APIResponse(
        200,
        {
          summary: {
            revenue,
            totalOrders,
            grossProfit,
            netProfit,
            profitMargin: Math.round(profitMargin * 100) / 100,
            totalCosts,
          },
          costs: estimatedCosts,
          monthlyBreakdown: monthlyData,
          period: { startDate, endDate },
        },
        "Profit & Loss report generated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Customer Analytics
export const getCustomerAnalytics = async (req, res, next) => {
  try {
    const { branchId, timeRange = "30d" } = req.query;

    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "7d":
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    let branchQuery = {};
    if (branchId) {
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(branchId)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
      branchQuery.branch = branchId;
    } else if (req.admin.role === "branch_admin") {
      branchQuery.branch = { $in: req.admin.assignedBranches };
    }

    // Customer statistics
    const [totalCustomers, newCustomers, returningCustomers, activeCustomers] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: startDate } }),
        Order.distinct("user", {
          ...branchQuery,
          createdAt: { $gte: startDate },
          status: "completed",
        }).then((users) =>
          User.countDocuments({
            _id: { $in: users },
            createdAt: { $lt: startDate },
          })
        ),
        Order.distinct("user", {
          ...branchQuery,
          createdAt: { $gte: startDate },
          status: "completed",
        }).then((users) => users.length),
      ]);

    // Customer segmentation by order frequency
    const customerSegments = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: startDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$user",
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
        },
      },
      {
        $bucket: {
          groupBy: "$orderCount",
          boundaries: [1, 2, 5, 10, Infinity],
          default: "Other",
          output: {
            count: { $sum: 1 },
            avgSpent: { $avg: "$totalSpent" },
          },
        },
      },
    ]);

    // Top customers by spending
    const topCustomers = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: startDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$user",
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          name: "$user.name",
          email: "$user.email",
          orderCount: 1,
          totalSpent: 1,
          avgOrderValue: 1,
        },
      },
    ]);

    res.status(200).json(
      new APIResponse(
        200,
        {
          overview: {
            totalCustomers,
            newCustomers,
            returningCustomers,
            activeCustomers,
            retentionRate:
              totalCustomers > 0
                ? (returningCustomers / totalCustomers) * 100
                : 0,
          },
          segments: customerSegments,
          topCustomers,
          timeRange,
        },
        "Customer analytics retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Best Selling Items Report
export const getBestSellingItems = async (req, res, next) => {
  try {
    const { branchId, startDate, endDate, limit = 20 } = req.query;

    if (!startDate || !endDate) {
      return next(new APIError(400, "Start date and end date are required"));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    let branchQuery = {};
    if (branchId) {
      if (
        req.admin.role === "branch_admin" &&
        !req.admin.canAccessBranch(branchId)
      ) {
        return next(new APIError(403, "You don't have access to this branch"));
      }
      branchQuery.branch = branchId;
    } else if (req.admin.role === "branch_admin") {
      branchQuery.branch = { $in: req.admin.assignedBranches };
    }

    const bestSellers = await Order.aggregate([
      {
        $match: {
          ...branchQuery,
          createdAt: { $gte: start, $lte: end },
          status: "completed",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.foodItem",
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.totalPrice" },
          orderCount: { $sum: 1 },
          avgPrice: { $avg: "$items.price" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "fooditems",
          localField: "_id",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $lookup: {
          from: "foodcategories",
          localField: "item.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          name: "$item.name",
          category: "$category.name",
          totalQuantity: 1,
          totalRevenue: 1,
          orderCount: 1,
          avgPrice: 1,
          profitMargin: {
            $multiply: [
              {
                $divide: [
                  {
                    $subtract: ["$avgPrice", { $multiply: ["$avgPrice", 0.3] }],
                  },
                  "$avgPrice",
                ],
              },
              100,
            ],
          },
        },
      },
    ]);

    res.status(200).json(
      new APIResponse(
        200,
        {
          bestSellers,
          period: { startDate, endDate },
          totalItems: bestSellers.length,
        },
        "Best selling items report generated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};
