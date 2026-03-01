/**
 * Order Analytics Service – shared aggregation pipeline
 * used by admin & manager order controllers.
 *
 * Provides the *data* layer only (no HTTP / socket concerns).
 */

import { Order } from "../../models/Order.model.js";

/**
 * Run the full order-analytics aggregation pipeline.
 *
 * @param {Object} filter – Pre-built Mongoose filter (includes branch / hotel / date range)
 * @returns {Object} analytics payload ready for APIResponse
 */
export async function getOrderAnalytics(filter) {
  // Date expression for daily time series
  const dateGroupExpression = {
    year: { $year: "$createdAt" },
    month: { $month: "$createdAt" },
    day: { $dayOfMonth: "$createdAt" },
  };

  const [
    totalOrders,
    statusBreakdown,
    revenueStats,
    averageOrderValue,
    popularItems,
    staffPerformance,
    timeSeriesData,
  ] = await Promise.all([
    Order.countDocuments(filter),

    Order.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    Order.aggregate([
      { $match: { ...filter, status: { $in: ["completed", "served"] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
        },
      },
    ]),

    Order.aggregate([
      { $match: filter },
      { $group: { _id: null, avgValue: { $avg: "$totalPrice" } } },
    ]),

    Order.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.foodItemName",
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.totalPrice" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
    ]),

    Order.aggregate([
      { $match: { ...filter, staff: { $exists: true } } },
      {
        $group: {
          _id: "$staff",
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "staffs",
          localField: "_id",
          foreignField: "_id",
          as: "staffDetails",
        },
      },
    ]),

    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: dateGroupExpression,
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $in: ["$status", ["completed", "served"]] },
                "$totalPrice",
                0,
              ],
            },
          },
          completedOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
            },
          },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1,
        },
      },
    ]),
  ]);

  // Format time series
  const formattedTimeSeries = timeSeriesData.map((item) => ({
    label: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`,
    orders: item.orders,
    revenue: item.revenue,
    completedOrders: item.completedOrders,
    cancelledOrders: item.cancelledOrders,
  }));

  return {
    summary: {
      totalOrders,
      totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
      averageOrderValue:
        averageOrderValue.length > 0 ? averageOrderValue[0].avgValue : 0,
    },
    statusDistribution: statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    timeSeries: formattedTimeSeries,
    popularItems: popularItems.map((item) => ({
      name: item._id,
      quantity: item.totalQuantity,
      revenue: item.totalRevenue,
    })),
    topPerformingStaff: staffPerformance.map((staff) => ({
      id: staff._id,
      name: staff.staffDetails[0]?.name || "Unknown",
      orderCount: staff.orderCount,
      totalRevenue: staff.totalRevenue,
    })),
  };
}

export default { getOrderAnalytics };
