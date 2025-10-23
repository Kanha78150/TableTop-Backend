// src/services/accountingService.js - Accounting Business Logic Service
import { Transaction } from "../models/Transaction.model.js";
import { Order } from "../models/Order.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { logger } from "../utils/logger.js";

/**
 * Get transaction analytics for dashboard
 */
export const getTransactionAnalytics = async (filters = {}) => {
  try {
    const { hotelId, branchId, period = "7d" } = filters;

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "1d":
        startDate.setDate(endDate.getDate() - 1);
        break;
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    const matchQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    };

    if (hotelId) matchQuery.hotel = hotelId;
    if (branchId) matchQuery.branch = branchId;

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            paymentMethod: "$paymentMethod",
          },
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          dailyTotal: { $sum: "$totalAmount" },
          dailyCount: { $sum: "$transactionCount" },
          paymentMethods: {
            $push: {
              method: "$_id.paymentMethod",
              amount: "$totalAmount",
              count: "$transactionCount",
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const dailyData = await Transaction.aggregate(pipeline);

    // Get overall statistics
    const [overallStats] = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
          maxTransactionAmount: { $max: "$amount" },
          minTransactionAmount: { $min: "$amount" },
        },
      },
    ]);

    return {
      period,
      dateRange: { startDate, endDate },
      dailyData: dailyData.map((day) => ({
        date: day._id,
        totalAmount: parseFloat(day.dailyTotal.toFixed(2)),
        transactionCount: day.dailyCount,
        paymentMethods: day.paymentMethods.reduce((acc, pm) => {
          acc[pm.method] = {
            amount: parseFloat(pm.amount.toFixed(2)),
            count: pm.count,
          };
          return acc;
        }, {}),
      })),
      summary: {
        totalRevenue: parseFloat((overallStats?.totalRevenue || 0).toFixed(2)),
        totalTransactions: overallStats?.totalTransactions || 0,
        avgTransactionAmount: parseFloat(
          (overallStats?.avgTransactionAmount || 0).toFixed(2)
        ),
        maxTransactionAmount: parseFloat(
          (overallStats?.maxTransactionAmount || 0).toFixed(2)
        ),
        minTransactionAmount: parseFloat(
          (overallStats?.minTransactionAmount || 0).toFixed(2)
        ),
      },
    };
  } catch (error) {
    logger.error("Error in getTransactionAnalytics:", error);
    throw error;
  }
};

/**
 * Get revenue comparison between periods
 */
export const getRevenueComparison = async (filters = {}) => {
  try {
    const {
      hotelId,
      branchId,
      currentPeriod = "30d",
      comparisonPeriod = "30d",
    } = filters;

    const currentEndDate = new Date();
    const currentStartDate = new Date();
    const prevEndDate = new Date();
    const prevStartDate = new Date();

    // Set current period
    switch (currentPeriod) {
      case "7d":
        currentStartDate.setDate(currentEndDate.getDate() - 7);
        prevEndDate.setDate(currentEndDate.getDate() - 7);
        prevStartDate.setDate(currentEndDate.getDate() - 14);
        break;
      case "30d":
        currentStartDate.setDate(currentEndDate.getDate() - 30);
        prevEndDate.setDate(currentEndDate.getDate() - 30);
        prevStartDate.setDate(currentEndDate.getDate() - 60);
        break;
      case "90d":
        currentStartDate.setDate(currentEndDate.getDate() - 90);
        prevEndDate.setDate(currentEndDate.getDate() - 90);
        prevStartDate.setDate(currentEndDate.getDate() - 180);
        break;
      default:
        currentStartDate.setDate(currentEndDate.getDate() - 30);
        prevEndDate.setDate(currentEndDate.getDate() - 30);
        prevStartDate.setDate(currentEndDate.getDate() - 60);
    }

    const baseQuery = { status: "completed" };
    if (hotelId) baseQuery.hotel = hotelId;
    if (branchId) baseQuery.branch = branchId;

    const [currentPeriodStats, previousPeriodStats] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            ...baseQuery,
            createdAt: { $gte: currentStartDate, $lte: currentEndDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
            avgTransactionAmount: { $avg: "$amount" },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...baseQuery,
            createdAt: { $gte: prevStartDate, $lte: prevEndDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
            avgTransactionAmount: { $avg: "$amount" },
          },
        },
      ]),
    ]);

    const current = currentPeriodStats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      avgTransactionAmount: 0,
    };
    const previous = previousPeriodStats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      avgTransactionAmount: 0,
    };

    const revenueGrowth =
      previous.totalRevenue > 0
        ? parseFloat(
            (
              ((current.totalRevenue - previous.totalRevenue) /
                previous.totalRevenue) *
              100
            ).toFixed(2)
          )
        : 0;

    const transactionGrowth =
      previous.totalTransactions > 0
        ? parseFloat(
            (
              ((current.totalTransactions - previous.totalTransactions) /
                previous.totalTransactions) *
              100
            ).toFixed(2)
          )
        : 0;

    return {
      currentPeriod: {
        totalRevenue: parseFloat(current.totalRevenue.toFixed(2)),
        totalTransactions: current.totalTransactions,
        avgTransactionAmount: parseFloat(
          current.avgTransactionAmount.toFixed(2)
        ),
        dateRange: { startDate: currentStartDate, endDate: currentEndDate },
      },
      previousPeriod: {
        totalRevenue: parseFloat(previous.totalRevenue.toFixed(2)),
        totalTransactions: previous.totalTransactions,
        avgTransactionAmount: parseFloat(
          previous.avgTransactionAmount.toFixed(2)
        ),
        dateRange: { startDate: prevStartDate, endDate: prevEndDate },
      },
      growth: {
        revenue: revenueGrowth,
        transactions: transactionGrowth,
        avgTransaction:
          previous.avgTransactionAmount > 0
            ? parseFloat(
                (
                  ((current.avgTransactionAmount -
                    previous.avgTransactionAmount) /
                    previous.avgTransactionAmount) *
                  100
                ).toFixed(2)
              )
            : 0,
      },
    };
  } catch (error) {
    logger.error("Error in getRevenueComparison:", error);
    throw error;
  }
};

/**
 * Get top performing hotels/branches
 */
export const getTopPerformers = async (filters = {}) => {
  try {
    const { period = "30d", limit = 10, type = "hotels" } = filters;

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    const matchQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    };

    let pipeline;

    if (type === "hotels") {
      pipeline = [
        { $match: matchQuery },
        {
          $group: {
            _id: "$hotel",
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
            avgTransactionAmount: { $avg: "$amount" },
          },
        },
        {
          $lookup: {
            from: "hotels",
            localField: "_id",
            foreignField: "_id",
            as: "hotelDetails",
          },
        },
        { $unwind: "$hotelDetails" },
        {
          $project: {
            _id: 1,
            totalRevenue: 1,
            totalTransactions: 1,
            avgTransactionAmount: 1,
            name: "$hotelDetails.name",
            hotelId: "$hotelDetails.hotelId",
            location: "$hotelDetails.location",
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit) },
      ];
    } else {
      pipeline = [
        { $match: matchQuery },
        {
          $group: {
            _id: "$branch",
            totalRevenue: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
            avgTransactionAmount: { $avg: "$amount" },
            hotel: { $first: "$hotel" },
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "_id",
            foreignField: "_id",
            as: "branchDetails",
          },
        },
        {
          $lookup: {
            from: "hotels",
            localField: "hotel",
            foreignField: "_id",
            as: "hotelDetails",
          },
        },
        { $unwind: "$branchDetails" },
        { $unwind: "$hotelDetails" },
        {
          $project: {
            _id: 1,
            totalRevenue: 1,
            totalTransactions: 1,
            avgTransactionAmount: 1,
            name: "$branchDetails.name",
            branchId: "$branchDetails.branchId",
            location: "$branchDetails.location",
            hotelName: "$hotelDetails.name",
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit) },
      ];
    }

    const results = await Transaction.aggregate(pipeline);

    return {
      type,
      period,
      performers: results.map((item, index) => ({
        rank: index + 1,
        id: item._id,
        name: item.name,
        code: item.hotelId || item.branchId,
        location: item.location,
        hotelName: item.hotelName,
        totalRevenue: parseFloat(item.totalRevenue.toFixed(2)),
        totalTransactions: item.totalTransactions,
        avgTransactionAmount: parseFloat(item.avgTransactionAmount.toFixed(2)),
      })),
    };
  } catch (error) {
    logger.error("Error in getTopPerformers:", error);
    throw error;
  }
};

/**
 * Get payment method distribution
 */
export const getPaymentMethodDistribution = async (filters = {}) => {
  try {
    const { hotelId, branchId, period = "30d" } = filters;

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    const matchQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    };

    if (hotelId) matchQuery.hotel = hotelId;
    if (branchId) matchQuery.branch = branchId;

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ];

    const results = await Transaction.aggregate(pipeline);
    const totalRevenue = results.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );
    const totalTransactions = results.reduce(
      (sum, item) => sum + item.transactionCount,
      0
    );

    return {
      period,
      distribution: results.map((item) => ({
        paymentMethod: item._id,
        totalAmount: parseFloat(item.totalAmount.toFixed(2)),
        transactionCount: item.transactionCount,
        avgTransactionAmount: parseFloat(item.avgTransactionAmount.toFixed(2)),
        revenueShare: parseFloat(
          ((item.totalAmount / totalRevenue) * 100).toFixed(2)
        ),
        transactionShare: parseFloat(
          ((item.transactionCount / totalTransactions) * 100).toFixed(2)
        ),
      })),
      summary: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalTransactions,
        totalPaymentMethods: results.length,
      },
    };
  } catch (error) {
    logger.error("Error in getPaymentMethodDistribution:", error);
    throw error;
  }
};

/**
 * Get pending settlements summary
 */
export const getPendingSettlements = async (filters = {}) => {
  try {
    const { hotelId, branchId } = filters;

    // Get transactions that need settlement (older than 1 day, completed status)
    const settlementCutoff = new Date();
    settlementCutoff.setDate(settlementCutoff.getDate() - 1);

    const matchQuery = {
      status: "completed",
      createdAt: { $lte: settlementCutoff },
    };

    if (hotelId) matchQuery.hotel = hotelId;
    if (branchId) matchQuery.branch = branchId;

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: {
            hotel: "$hotel",
            branch: "$branch",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          oldestTransaction: { $min: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "hotels",
          localField: "_id.hotel",
          foreignField: "_id",
          as: "hotelDetails",
        },
      },
      {
        $lookup: {
          from: "branches",
          localField: "_id.branch",
          foreignField: "_id",
          as: "branchDetails",
        },
      },
      { $unwind: "$hotelDetails" },
      { $unwind: "$branchDetails" },
      { $sort: { oldestTransaction: 1 } },
    ];

    const pendingSettlements = await Transaction.aggregate(pipeline);

    const summary = pendingSettlements.reduce(
      (acc, settlement) => ({
        totalAmount: acc.totalAmount + settlement.totalAmount,
        totalCount: acc.totalCount + settlement.transactionCount,
      }),
      { totalAmount: 0, totalCount: 0 }
    );

    return {
      pendingSettlements: pendingSettlements.map((settlement) => ({
        settlementId: `PEND-${settlement._id.date}-${settlement._id.hotel
          .toString()
          .slice(-6)}`,
        hotelId: settlement._id.hotel,
        hotelName: settlement.hotelDetails.name,
        branchId: settlement._id.branch,
        branchName: settlement.branchDetails.name,
        settlementDate: settlement._id.date,
        totalAmount: parseFloat(settlement.totalAmount.toFixed(2)),
        transactionCount: settlement.transactionCount,
        daysPending: Math.floor(
          (new Date() - settlement.oldestTransaction) / (1000 * 60 * 60 * 24)
        ),
      })),
      summary: {
        totalPendingAmount: parseFloat(summary.totalAmount.toFixed(2)),
        totalPendingTransactions: summary.totalCount,
        totalPendingSettlements: pendingSettlements.length,
      },
    };
  } catch (error) {
    logger.error("Error in getPendingSettlements:", error);
    throw error;
  }
};

export default {
  getTransactionAnalytics,
  getRevenueComparison,
  getTopPerformers,
  getPaymentMethodDistribution,
  getPendingSettlements,
};
