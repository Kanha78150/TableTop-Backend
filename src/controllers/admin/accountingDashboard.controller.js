// src/controllers/admin/accountingDashboardController.js - Accounting Dashboard Controller
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { Transaction } from "../../models/Transaction.model.js";
import {
  getTransactionAnalytics,
  getRevenueComparison,
  getTopPerformers,
  getPaymentMethodDistribution,
  getPendingSettlements,
} from "../../services/accounting.service.js";

/**
 * Get accounting dashboard summary
 * GET /api/v1/admin/accounting/dashboard
 * @access Admin
 */
export const getAccountingDashboard = async (req, res, next) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const { period = "30d", hotelId, branchId } = queryParams;

    // Get all dashboard data in parallel
    const [
      analytics,
      comparison,
      topHotels,
      topBranches,
      paymentDistribution,
      pendingSettlements,
    ] = await Promise.all([
      getTransactionAnalytics({ period, hotelId, branchId }),
      getRevenueComparison({ currentPeriod: period, hotelId, branchId }),
      getTopPerformers({ period, type: "hotels", limit: 5 }),
      getTopPerformers({ period, type: "branches", limit: 5 }),
      getPaymentMethodDistribution({ period, hotelId, branchId }),
      getPendingSettlements({ hotelId, branchId }),
    ]);

    const dashboardData = {
      overview: {
        period,
        totalRevenue: analytics.summary.totalRevenue,
        totalTransactions: analytics.summary.totalTransactions,
        avgTransactionAmount: analytics.summary.avgTransactionAmount,
        successRate:
          comparison.currentPeriod.totalTransactions > 0
            ? parseFloat(
                (
                  (analytics.summary.totalTransactions /
                    comparison.currentPeriod.totalTransactions) *
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
      pendingSettlements: {
        totalAmount: pendingSettlements.summary.totalPendingAmount,
        totalCount: pendingSettlements.summary.totalPendingSettlements,
        items: pendingSettlements.pendingSettlements.slice(0, 5), // Show top 5
      },
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
          (max, day) =>
            day.transactionCount > max.transactionCount ? day : max,
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
  } catch (error) {
    logger.error("Error fetching accounting dashboard:", error);
    next(error);
  }
};

/**
 * Get quick financial summary
 * GET /api/v1/admin/accounting/summary
 * @access Admin
 */
export const getFinancialSummary = async (req, res, next) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const { period = "30d" } = queryParams;

    const [analytics, comparison, pendingSettlements] = await Promise.all([
      getTransactionAnalytics({ period }),
      getRevenueComparison({ currentPeriod: period }),
      getPendingSettlements({}),
    ]);

    // Count unique hotels and branches from recent transactions
    const uniqueEntities = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
          status: "success",
        },
      },
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
        totalPendingSettlements:
          pendingSettlements.summary.totalPendingSettlements,
      },
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          summary,
          "Financial summary retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error fetching financial summary:", error);
    next(error);
  }
};

export default {
  getAccountingDashboard,
  getFinancialSummary,
};
