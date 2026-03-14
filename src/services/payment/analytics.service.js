import { Order } from "../../models/Order.model.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * Get all payments with filtering and pagination
 * @param {Object} options - Query options
 * @returns {Object} Paginated payments with metadata
 */
export async function getAllPayments(options = {}) {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      method,
      startDate,
      endDate,
    } = options;

    logger.info("Fetching all payments", {
      page,
      limit,
      status,
      method,
      startDate,
      endDate,
    });

    // Build query filter
    let query = {};

    if (status) {
      query["payment.paymentStatus"] = status;
    }

    if (method) {
      query["payment.paymentMethod"] = method;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate([
          { path: "user", select: "name email phone" },
          { path: "hotel", select: "name" },
          { path: "branch", select: "name address" },
          { path: "staff", select: "name staffId role" },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    const payments = orders.map((order) => ({
      orderId: order._id,
      transactionId: order.payment?.transactionId,
      razorpayOrderId: order.payment?.razorpayOrderId,
      razorpayPaymentId: order.payment?.razorpayPaymentId,
      amount: order.totalPrice,
      paymentStatus: order.payment?.paymentStatus || "pending",
      paymentMethod: order.payment?.paymentMethod || "cash",
      orderStatus: order.status,
      user: {
        id: order.user?._id,
        name: order.user?.name,
        email: order.user?.email,
        phone: order.user?.phone,
      },
      hotel: {
        id: order.hotel?._id,
        name: order.hotel?.name,
      },
      branch: {
        id: order.branch?._id,
        name: order.branch?.name,
        address: order.branch?.address,
      },
      staff: order.staff
        ? {
            id: order.staff._id,
            name: order.staff.name,
            staffId: order.staff.staffId,
            role: order.staff.role,
          }
        : null,
      createdAt: order.createdAt,
      paidAt: order.payment?.paidAt,
      coinsUsed: order.coinsUsed || 0,
      coinDiscount: order.coinDiscount || 0,
      rewardCoins: order.rewardCoins || 0,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const totalRevenue = orders.reduce((sum, order) => {
      return order.payment?.paymentStatus === "paid"
        ? sum + order.totalPrice
        : sum;
    }, 0);

    const paymentMethodStats = orders.reduce((stats, order) => {
      const method = order.payment?.paymentMethod || "cash";
      stats[method] = (stats[method] || 0) + 1;
      return stats;
    }, {});

    const paymentStatusStats = orders.reduce((stats, order) => {
      const status = order.payment?.paymentStatus || "pending";
      stats[status] = (stats[status] || 0) + 1;
      return stats;
    }, {});

    logger.info("Payments retrieved successfully", {
      totalCount,
      currentPage: page,
      totalPages,
      paymentCount: payments.length,
    });

    return {
      payments,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit: parseInt(limit),
      },
      summary: {
        totalRevenue,
        totalOrders: totalCount,
        averageOrderValue:
          totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0,
        paymentMethodStats,
        paymentStatusStats,
      },
      filters: { status, method, startDate, endDate },
    };
  } catch (error) {
    logger.error("Failed to get all payments", {
      error: error.message,
      stack: error.stack,
      options,
    });
    if (error instanceof APIError) throw error;
    throw new APIError(500, "Failed to retrieve payments");
  }
}

/**
 * Get payment analytics and reports
 * @param {Object} options - Analytics options
 * @returns {Object} Analytics data
 */
export async function getPaymentAnalytics(options = {}) {
  try {
    const { startDate, endDate, branchId } = options;

    logger.info("Generating payment analytics", {
      startDate,
      endDate,
      branchId,
    });

    let query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (branchId) {
      query.branch = branchId;
    }

    const orders = await Order.find(query)
      .populate([
        { path: "branch", select: "name" },
        { path: "hotel", select: "name" },
      ])
      .lean();

    const totalOrders = orders.length;
    const paidOrders = orders.filter(
      (order) => order.payment?.paymentStatus === "paid"
    );
    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum + order.totalPrice,
      0
    );
    const averageOrderValue =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Payment method breakdown
    const paymentMethodStats = orders.reduce((stats, order) => {
      const method = order.payment?.paymentMethod || "cash";
      if (!stats[method]) {
        stats[method] = { count: 0, revenue: 0 };
      }
      stats[method].count += 1;
      if (order.payment?.paymentStatus === "paid") {
        stats[method].revenue += order.totalPrice;
      }
      return stats;
    }, {});

    // Payment status breakdown
    const paymentStatusStats = orders.reduce((stats, order) => {
      const status = order.payment?.paymentStatus || "pending";
      if (!stats[status]) {
        stats[status] = { count: 0, revenue: 0 };
      }
      stats[status].count += 1;
      if (status === "paid") {
        stats[status].revenue += order.totalPrice;
      }
      return stats;
    }, {});

    // Daily revenue breakdown
    const dailyRevenue = {};
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startAnalysisDate = startDate ? new Date(startDate) : thirtyDaysAgo;
    const endAnalysisDate = endDate ? new Date(endDate) : now;

    for (
      let d = new Date(startAnalysisDate);
      d <= endAnalysisDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateKey = d.toISOString().split("T")[0];
      dailyRevenue[dateKey] = 0;
    }

    paidOrders.forEach((order) => {
      const dateKey = order.createdAt.toISOString().split("T")[0];
      if (dailyRevenue.hasOwnProperty(dateKey)) {
        dailyRevenue[dateKey] += order.totalPrice;
      }
    });

    // Top branches by revenue
    const branchStats = orders.reduce((stats, order) => {
      if (!order.branch) return stats;
      const bId = order.branch._id.toString();
      const branchName = order.branch.name || "Unknown Branch";
      if (!stats[bId]) {
        stats[bId] = {
          branchId: bId,
          branchName,
          totalOrders: 0,
          totalRevenue: 0,
          paidOrders: 0,
        };
      }
      stats[bId].totalOrders += 1;
      if (order.payment?.paymentStatus === "paid") {
        stats[bId].totalRevenue += order.totalPrice;
        stats[bId].paidOrders += 1;
      }
      return stats;
    }, {});

    const topBranches = Object.values(branchStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    // Refund statistics
    const refundOrders = orders.filter(
      (order) =>
        order.payment?.paymentStatus === "refunded" ||
        order.payment?.paymentStatus === "refund_pending"
    );

    const refundStats = {
      totalRefunds: refundOrders.length,
      totalRefundAmount: refundOrders.reduce(
        (sum, order) => sum + order.totalPrice,
        0
      ),
      refundRate:
        totalOrders > 0
          ? Math.round((refundOrders.length / totalOrders) * 100)
          : 0,
    };

    // Coins statistics
    const coinStats = {
      totalCoinsUsed: orders.reduce(
        (sum, order) => sum + (order.coinsUsed || 0),
        0
      ),
      totalCoinsRewarded: orders.reduce(
        (sum, order) => sum + (order.rewardCoins || 0),
        0
      ),
      totalCoinDiscount: orders.reduce(
        (sum, order) => sum + (order.coinDiscount || 0),
        0
      ),
    };
    coinStats.netCoins =
      coinStats.totalCoinsRewarded - coinStats.totalCoinsUsed;

    // Conversion metrics
    const conversionRate =
      totalOrders > 0 ? Math.round((paidOrders.length / totalOrders) * 100) : 0;
    const failedPayments = orders.filter(
      (order) => order.payment?.paymentStatus === "failed"
    ).length;
    const failureRate =
      totalOrders > 0 ? Math.round((failedPayments / totalOrders) * 100) : 0;

    logger.info("Payment analytics generated successfully", {
      totalOrders,
      totalRevenue,
      conversionRate,
      analysisDateRange: {
        start: startAnalysisDate.toISOString(),
        end: endAnalysisDate.toISOString(),
      },
    });

    return {
      overview: {
        totalOrders,
        paidOrders: paidOrders.length,
        totalRevenue,
        averageOrderValue,
        conversionRate,
        failureRate,
      },
      paymentMethods: paymentMethodStats,
      paymentStatus: paymentStatusStats,
      dailyRevenue: Object.entries(dailyRevenue).map(([date, revenue]) => ({
        date,
        revenue,
      })),
      topBranches,
      refundStats,
      coinStats,
      dateRange: {
        start: startDate || startAnalysisDate.toISOString(),
        end: endDate || endAnalysisDate.toISOString(),
      },
    };
  } catch (error) {
    logger.error("Failed to generate payment analytics", {
      error: error.message,
      stack: error.stack,
      options,
    });
    if (error instanceof APIError) throw error;
    throw new APIError(500, "Failed to generate payment analytics");
  }
}
