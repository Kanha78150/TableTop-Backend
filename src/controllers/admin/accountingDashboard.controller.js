// src/controllers/admin/accountingDashboardController.js - Accounting Dashboard Controller
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { Transaction } from "../../models/Transaction.model.js";
import mongoose from "mongoose";
import {
  getTransactionAnalytics,
  getRevenueComparison,
  getTopPerformers,
  getPaymentMethodDistribution,
} from "../../services/accounting.service.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { getAdminHotelScope } from "../../utils/adminHotelScope.js";

/**
 * Get accounting dashboard summary
 * GET /api/v1/admin/accounting/dashboard
 * @access Admin
 */
export const getAccountingDashboard = asyncHandler(async (req, res) => {
  const queryParams = req.validatedQuery || req.query;
  const { period = "30d", hotelId, branchId } = queryParams;

  // Scope to admin's own hotels
  const adminHotelIds = await getAdminHotelScope(req, { hotelId });

  if (adminHotelIds !== null && adminHotelIds.length === 0) {
    return res.status(200).json(
      new APIResponse(
        200,
        {
          overview: {
            period,
            totalRevenue: 0,
            totalTransactions: 0,
            avgTransactionAmount: 0,
            successRate: 0,
          },
          growth: { revenue: 0, transactions: 0, avgTransaction: 0 },
          dailyTrends: [],
          topPerformers: { hotels: [], branches: [] },
          paymentMethods: [],
          quickStats: {
            todayRevenue: 0,
            yesterdayRevenue: 0,
            avgDailyRevenue: 0,
            peakTransactionDay: { transactionCount: 0, date: null },
          },
        },
        "Accounting dashboard data retrieved successfully"
      )
    );
  }

  // Get all dashboard data in parallel
  const [analytics, comparison, topHotels, topBranches, paymentDistribution] =
    await Promise.all([
      getTransactionAnalytics({ period, hotelId, branchId, adminHotelIds }),
      getRevenueComparison({
        currentPeriod: period,
        hotelId,
        branchId,
        adminHotelIds,
      }),
      getTopPerformers({ period, type: "hotels", limit: 5, adminHotelIds }),
      getTopPerformers({ period, type: "branches", limit: 5, adminHotelIds }),
      getPaymentMethodDistribution({
        period,
        hotelId,
        branchId,
        adminHotelIds,
      }),
    ]);

  // Build base match for total transaction count (all statuses)
  const totalCountMatch = {
    createdAt: {
      $gte: analytics.dateRange.startDate,
      $lte: analytics.dateRange.endDate,
    },
  };
  if (adminHotelIds !== null && adminHotelIds.length > 0) {
    totalCountMatch.hotel = { $in: adminHotelIds };
  }
  if (hotelId) totalCountMatch.hotel = new mongoose.Types.ObjectId(hotelId);
  if (branchId) totalCountMatch.branch = new mongoose.Types.ObjectId(branchId);

  const totalTransactionsAllStatuses =
    await Transaction.countDocuments(totalCountMatch);

  const dashboardData = {
    overview: {
      period,
      totalRevenue: analytics.summary.totalRevenue,
      totalTransactions: analytics.summary.totalTransactions,
      avgTransactionAmount: analytics.summary.avgTransactionAmount,
      successRate:
        totalTransactionsAllStatuses > 0
          ? parseFloat(
              (
                (analytics.summary.totalTransactions /
                  totalTransactionsAllStatuses) *
                100
              ).toFixed(2)
            )
          : 0,
    },
    growth: comparison.growth,
    dailyTrends: analytics.dailyData,
    topPerformers: {
      hotels: topHotels.performers,
      branches: topBranches.performers,
    },
    paymentMethods: paymentDistribution.distribution,
    quickStats: {
      todayRevenue:
        analytics.dailyData.find(
          (day) => day.date === new Date().toISOString().split("T")[0]
        )?.totalAmount || 0,
      yesterdayRevenue:
        analytics.dailyData.find((day) => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return day.date === yesterday.toISOString().split("T")[0];
        })?.totalAmount || 0,
      avgDailyRevenue:
        analytics.dailyData.length > 0
          ? parseFloat(
              (
                analytics.summary.totalRevenue / analytics.dailyData.length
              ).toFixed(2)
            )
          : 0,
      peakTransactionDay: analytics.dailyData.reduce(
        (max, day) => (day.transactionCount > max.transactionCount ? day : max),
        { transactionCount: 0, date: null }
      ),
    },
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        dashboardData,
        "Accounting dashboard data retrieved successfully"
      )
    );

  logger.info("Accounting dashboard accessed", {
    adminId: req.user._id,
    period,
    hotelId,
    branchId,
  });
});

/**
 * Get quick financial summary
 * GET /api/v1/admin/accounting/summary
 * @access Admin
 */
export const getFinancialSummary = asyncHandler(async (req, res) => {
  const queryParams = req.validatedQuery || req.query;
  const { period = "30d" } = queryParams;

  // Scope to admin's own hotels
  const adminHotelIds = await getAdminHotelScope(req);

  const [analytics, comparison] = await Promise.all([
    getTransactionAnalytics({ period, adminHotelIds }),
    getRevenueComparison({ currentPeriod: period, adminHotelIds }),
  ]);

  // Count unique hotels and branches from recent transactions scoped to admin
  const entityMatch = {
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    status: "success",
  };
  if (adminHotelIds !== null && adminHotelIds.length > 0) {
    entityMatch.hotel = { $in: adminHotelIds };
  }

  const uniqueEntities = await Transaction.aggregate([
    { $match: entityMatch },
    {
      $group: {
        _id: null,
        hotels: { $addToSet: "$hotel" },
        branches: { $addToSet: "$branch" },
      },
    },
  ]);

  const totalActiveHotels = uniqueEntities[0]?.hotels?.length || 0;
  const totalActiveBranches = uniqueEntities[0]?.branches?.length || 0;

  const summary = {
    currentPeriod: {
      revenue: analytics.summary.totalRevenue,
      transactions: analytics.summary.totalTransactions,
      avgTransaction: analytics.summary.avgTransactionAmount,
    },
    growth: comparison.growth,
    trends: {
      revenueGrowth: comparison.growth.revenue,
      transactionGrowth: comparison.growth.transactions,
      avgTransactionGrowth: comparison.growth.avgTransaction,
    },
    status: {
      totalActiveHotels,
      totalActiveBranches,
    },
  };

  res
    .status(200)
    .json(
      new APIResponse(200, summary, "Financial summary retrieved successfully")
    );
});

export default {
  getAccountingDashboard,
  getFinancialSummary,
};
