// src/controllers/admin/dashboard.controller.js - Admin Dashboard Controller
import { Order } from "../../models/Order.model.js";
import { Review } from "../../models/Review.model.js";
import { Table } from "../../models/Table.model.js";
import { Booking } from "../../models/Booking.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Complaint } from "../../models/Complaint.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { RewardHistory } from "../../models/RewardHistory.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { getAdminHotelScope } from "../../utils/adminHotelScope.js";
import mongoose from "mongoose";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a branch/hotel match filter for aggregation pipelines.
 * - If branchId is supplied → filter to that branch (after validating scope).
 * - Otherwise filter to all branches belonging to admin's hotels.
 */
async function buildScopeFilter(req) {
  const { hotelId, branchId } = req.query;
  const adminHotelIds = await getAdminHotelScope(req, { hotelId, branchId });

  const filter = {};

  // Branch filter (independent — not else-if)
  if (branchId) {
    filter.branch = new mongoose.Types.ObjectId(branchId);
  } else if (req.admin?.role === "branch_admin") {
    filter.branch = {
      $in: req.admin.assignedBranches.map(
        (id) => new mongoose.Types.ObjectId(id)
      ),
    };
  }

  // Hotel filter (always applied alongside branch filter)
  if (hotelId) {
    filter.hotel = new mongoose.Types.ObjectId(hotelId);
  } else if (adminHotelIds !== null && adminHotelIds.length > 0) {
    filter.hotel = { $in: adminHotelIds };
  }

  return { filter, adminHotelIds };
}

/**
 * Parse a timeRange string ("1d","7d","30d","90d") into a start Date.
 */
function getStartDate(timeRange = "30d") {
  const now = new Date();
  switch (timeRange) {
    case "1d":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
}

// ─── 1. Order Status Distribution (Pie Chart) ────────────────────────────────

export const getOrderStatusDistribution = asyncHandler(async (req, res) => {
  const { timeRange } = req.query;
  const { filter } = await buildScopeFilter(req);
  const startDate = getStartDate(timeRange);

  const statusCounts = await Order.aggregate([
    {
      $match: {
        ...filter,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Ensure all 8 statuses are represented
  const allStatuses = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "served",
    "completed",
    "cancelled",
    "queued",
  ];

  const statusMap = statusCounts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const distribution = allStatuses.map((status) => ({
    status,
    count: statusMap[status] || 0,
  }));

  const total = distribution.reduce((sum, d) => sum + d.count, 0);

  res.status(200).json(
    new APIResponse(
      200,
      {
        distribution,
        total,
        timeRange: timeRange || "30d",
      },
      "Order status distribution retrieved successfully"
    )
  );
});

// ─── 2. Customer Ratings (Multi-Dimensional) ─────────────────────────────────

export const getCustomerRatings = asyncHandler(async (req, res) => {
  const { timeRange } = req.query;
  const { filter } = await buildScopeFilter(req);
  const startDate = getStartDate(timeRange);

  const matchStage = {
    ...filter,
    createdAt: { $gte: startDate },
  };

  const [dimensions, starDistribution, totalReviews] = await Promise.all([
    // Average per dimension
    Review.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          avgFood: { $avg: "$foodRating" },
          avgHotel: { $avg: "$hotelRating" },
          avgBranch: { $avg: "$branchRating" },
          avgStaff: { $avg: "$staffRating" },
        },
      },
    ]),

    // Star distribution using composite average
    Review.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          compositeRating: {
            $round: [
              {
                $avg: [
                  "$foodRating",
                  "$hotelRating",
                  "$branchRating",
                  "$staffRating",
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$compositeRating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Review.countDocuments(matchStage),
  ]);

  const dimData = dimensions[0] || {
    avgFood: 0,
    avgHotel: 0,
    avgBranch: 0,
    avgStaff: 0,
  };

  // Ensure all 5 stars are represented
  const distMap = starDistribution.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    stars: star,
    count: distMap[star] || 0,
  }));

  const overallAverage =
    totalReviews > 0
      ? Math.round(
          ((dimData.avgFood +
            dimData.avgHotel +
            dimData.avgBranch +
            dimData.avgStaff) /
            4) *
            100
        ) / 100
      : 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        dimensions: {
          food: Math.round((dimData.avgFood || 0) * 100) / 100,
          hotel: Math.round((dimData.avgHotel || 0) * 100) / 100,
          branch: Math.round((dimData.avgBranch || 0) * 100) / 100,
          staff: Math.round((dimData.avgStaff || 0) * 100) / 100,
        },
        distribution,
        totalReviews,
        overallAverage,
        timeRange: timeRange || "30d",
      },
      "Customer ratings retrieved successfully"
    )
  );
});

// ─── 3. Table Utilization (Hourly) ───────────────────────────────────────────

export const getTableUtilization = asyncHandler(async (req, res) => {
  const { branchId, hotelId, date } = req.query;
  const { filter, adminHotelIds } = await buildScopeFilter(req);

  // Default to today
  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // Get total table count for the scope
  const tableFilter = {};
  if (branchId) {
    tableFilter.branch = new mongoose.Types.ObjectId(branchId);
  } else if (hotelId) {
    tableFilter.hotel = new mongoose.Types.ObjectId(hotelId);
  } else if (adminHotelIds !== null && adminHotelIds.length > 0) {
    tableFilter.hotel = { $in: adminHotelIds };
  }
  tableFilter.isActive = true;

  const totalTables = await Table.countDocuments(tableFilter);

  // Get distinct tables used per hour
  const hourlyUtilization = await Order.aggregate([
    {
      $match: {
        ...filter,
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        table: { $ne: null },
      },
    },
    {
      $group: {
        _id: { $hour: "$createdAt" },
        tablesUsed: { $addToSet: "$table" },
      },
    },
    {
      $project: {
        hour: "$_id",
        occupied: { $size: "$tablesUsed" },
        _id: 0,
      },
    },
    { $sort: { hour: 1 } },
  ]);

  // Build full 24-hour array
  const hourlyMap = hourlyUtilization.reduce((acc, item) => {
    acc[item.hour] = item.occupied;
    return acc;
  }, {});

  const utilization = Array.from({ length: 24 }, (_, hour) => {
    const occupied = hourlyMap[hour] || 0;
    return {
      hour,
      occupied,
      available: Math.max(0, totalTables - occupied),
      occupancyPercent:
        totalTables > 0
          ? Math.round((occupied / totalTables) * 10000) / 100
          : 0,
    };
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        date: startOfDay.toISOString().split("T")[0],
        totalTables,
        utilization,
      },
      "Table utilization retrieved successfully"
    )
  );
});

// ─── 4. Booking Trends (Weekly Comparison) ───────────────────────────────────

export const getBookingTrends = asyncHandler(async (req, res) => {
  const { filter } = await buildScopeFilter(req);

  const now = new Date();
  const startOfCurrentWeek = new Date(now);
  startOfCurrentWeek.setDate(now.getDate() - now.getDay());
  startOfCurrentWeek.setHours(0, 0, 0, 0);

  const startOfPreviousWeek = new Date(
    startOfCurrentWeek.getTime() - 7 * 24 * 60 * 60 * 1000
  );

  const [currentWeek, previousWeek] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          ...filter,
          createdAt: { $gte: startOfCurrentWeek },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          count: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...filter,
          createdAt: {
            $gte: startOfPreviousWeek,
            $lt: startOfCurrentWeek,
          },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const currentMap = currentWeek.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const previousMap = previousWeek.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  // $dayOfWeek returns 1 (Sun) – 7 (Sat)
  const trends = dayNames.map((day, index) => ({
    day,
    current: currentMap[index + 1] || 0,
    previous: previousMap[index + 1] || 0,
  }));

  const currentTotal = trends.reduce((sum, t) => sum + t.current, 0);
  const previousTotal = trends.reduce((sum, t) => sum + t.previous, 0);

  res.status(200).json(
    new APIResponse(
      200,
      {
        trends,
        currentWeekTotal: currentTotal,
        previousWeekTotal: previousTotal,
        changePercent:
          previousTotal > 0
            ? Math.round(
                ((currentTotal - previousTotal) / previousTotal) * 10000
              ) / 100
            : 0,
      },
      "Booking trends retrieved successfully"
    )
  );
});

// ─── 5. Staff Performance ────────────────────────────────────────────────────

export const getStaffPerformance = asyncHandler(async (req, res) => {
  const { timeRange } = req.query;
  const { filter, adminHotelIds } = await buildScopeFilter(req);
  const startDate = getStartDate(timeRange);

  // Get order counts and revenue per staff
  const staffOrders = await Order.aggregate([
    {
      $match: {
        ...filter,
        createdAt: { $gte: startDate },
        staff: { $ne: null },
        status: "completed",
      },
    },
    {
      $group: {
        _id: "$staff",
        ordersHandled: { $sum: 1 },
        totalSales: { $sum: "$totalPrice" },
      },
    },
    {
      $lookup: {
        from: "staffs",
        localField: "_id",
        foreignField: "_id",
        as: "staffInfo",
      },
    },
    { $unwind: "$staffInfo" },
    {
      $project: {
        staffId: "$staffInfo.staffId",
        name: "$staffInfo.name",
        role: "$staffInfo.role",
        ordersHandled: 1,
        totalSales: 1,
      },
    },
    { $sort: { totalSales: -1 } },
    { $limit: 20 },
  ]);

  // Get average staff ratings
  const staffRatings = await Review.aggregate([
    {
      $match: {
        ...filter,
        createdAt: { $gte: startDate },
        staff: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$staff",
        averageRating: { $avg: "$staffRating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const ratingMap = staffRatings.reduce((acc, item) => {
    acc[item._id.toString()] = {
      averageRating: Math.round(item.averageRating * 100) / 100,
      totalReviews: item.totalReviews,
    };
    return acc;
  }, {});

  const performance = staffOrders.map((s) => ({
    staffId: s.staffId,
    name: s.name,
    role: s.role,
    ordersHandled: s.ordersHandled,
    totalSales: s.totalSales,
    averageRating: ratingMap[s._id.toString()]?.averageRating || 0,
    totalReviews: ratingMap[s._id.toString()]?.totalReviews || 0,
  }));

  res.status(200).json(
    new APIResponse(
      200,
      {
        performance,
        timeRange: timeRange || "30d",
      },
      "Staff performance retrieved successfully"
    )
  );
});

// ─── 6. Complaints Summary ──────────────────────────────────────────────────

export const getComplaintsSummary = asyncHandler(async (req, res) => {
  const { timeRange } = req.query;
  const { filter } = await buildScopeFilter(req);
  const startDate = getStartDate(timeRange);

  const matchStage = {
    ...filter,
    createdAt: { $gte: startDate },
  };

  const [byStatus, byCategory, byPriority, total] = await Promise.all([
    Complaint.aggregate([
      { $match: matchStage },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Complaint.aggregate([
      { $match: matchStage },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
    Complaint.aggregate([
      { $match: matchStage },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]),
    Complaint.countDocuments(matchStage),
  ]);

  const statusMap = byStatus.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const resolved = statusMap.resolved || 0;
  const resolutionRate =
    total > 0 ? Math.round((resolved / total) * 10000) / 100 : 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        total,
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
        byCategory: byCategory.map((c) => ({
          category: c._id,
          count: c.count,
        })),
        byPriority: byPriority.map((p) => ({
          priority: p._id,
          count: p.count,
        })),
        resolutionRate,
        timeRange: timeRange || "30d",
      },
      "Complaints summary retrieved successfully"
    )
  );
});

// ─── 7. Coin & Reward Activity ──────────────────────────────────────────────

export const getCoinActivity = asyncHandler(async (req, res) => {
  const { timeRange } = req.query;
  const { filter } = await buildScopeFilter(req);
  const startDate = getStartDate(timeRange);

  // CoinTransaction doesn't have hotel/branch directly — scope via orders
  // Get order IDs within the admin's scope
  const scopedOrders = await Order.find(
    { ...filter, createdAt: { $gte: startDate } },
    { _id: 1 }
  ).lean();
  const orderIds = scopedOrders.map((o) => o._id);

  const [transactionsByType, rewardsByType] = await Promise.all([
    CoinTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ order: { $in: orderIds } }, { order: null }],
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalCoins: { $sum: { $abs: "$amount" } },
        },
      },
    ]),
    RewardHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          order: { $in: orderIds },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalCoins: { $sum: "$coins" },
        },
      },
    ]),
  ]);

  const txMap = transactionsByType.reduce((acc, item) => {
    acc[item._id] = { count: item.count, totalCoins: item.totalCoins };
    return acc;
  }, {});

  const coinsEarned = txMap.earned?.totalCoins || 0;
  const coinsUsed = txMap.used?.totalCoins || 0;
  const coinsRefunded = txMap.refunded?.totalCoins || 0;

  res.status(200).json(
    new APIResponse(
      200,
      {
        coinsEarned,
        coinsUsed,
        coinsRefunded,
        netCoins: coinsEarned - coinsUsed + coinsRefunded,
        transactionsByType: transactionsByType.map((t) => ({
          type: t._id,
          count: t.count,
          totalCoins: t.totalCoins,
        })),
        rewardsByType: rewardsByType.map((r) => ({
          type: r._id,
          count: r.count,
          totalCoins: r.totalCoins,
        })),
        timeRange: timeRange || "30d",
      },
      "Coin activity retrieved successfully"
    )
  );
});
