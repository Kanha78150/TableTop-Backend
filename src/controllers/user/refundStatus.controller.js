import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { Order } from "../../models/Order.model.js";
import { RefundRequest } from "../../models/RefundRequest.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";

/**
 * @desc    Get refund status for user's order
 * @route   GET /api/v1/user/orders/:orderId/refund-status
 * @access  Private (User)
 */
export const getOrderRefundStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { orderId } = req.params;

  // Find the order
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  // Check if order has any refund information
  const hasRefund =
    order.payment &&
    (order.payment.paymentStatus?.includes("refund") || order.payment.refund);

  if (!hasRefund) {
    return res.status(200).json(
      new APIResponse(
        200,
        {
          orderId: order._id,
          hasRefund: false,
          message: "No refund information available for this order",
        },
        "Refund status retrieved"
      )
    );
  }

  // Get refund request if exists
  const refundRequest = await RefundRequest.findOne({
    order: orderId,
    user: userId,
  });

  // Build comprehensive refund status
  const refundStatus = {
    orderId: order._id,
    hasRefund: true,
    paymentStatus: order.payment.paymentStatus,
    refundInfo: {
      amount: order.payment.refund?.amount || 0,
      reason: order.payment.refund?.reason || refundRequest?.reason || "N/A",
      status: getRefundDisplayStatus(
        order.payment.paymentStatus,
        order.payment.refund?.gatewayResponse
      ),
      initiatedAt: order.payment.refund?.initiatedAt,
      expectedCompletionTime: getExpectedCompletionTime(
        order.payment.refund?.gatewayResponse
      ),
      transactionId: order.payment.refund?.transactionId,
      gatewayTransactionId:
        order.payment.refund?.gatewayResponse?.data?.transactionId,
    },
    refundRequest: refundRequest
      ? {
          id: refundRequest._id,
          status: refundRequest.status,
          requestedAt: refundRequest.createdAt,
          adminNotes: refundRequest.adminNotes,
        }
      : null,
    timeline: buildRefundTimeline(order, refundRequest),
  };

  res
    .status(200)
    .json(
      new APIResponse(200, refundStatus, "Refund status retrieved successfully")
    );
});

/**
 * @desc    Get all orders with refund information for user
 * @route   GET /api/v1/user/refunds
 * @access  Private (User)
 */
export const getUserRefunds = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  // Build query for orders with refunds
  const matchQuery = {
    user: userId,
    $or: [
      { "payment.paymentStatus": { $regex: "refund", $options: "i" } },
      { "payment.refund": { $exists: true } },
    ],
  };

  // Add status filter if provided
  if (status && ["pending", "completed", "failed"].includes(status)) {
    if (status === "pending") {
      matchQuery["payment.paymentStatus"] = "refund_pending";
    } else if (status === "completed") {
      matchQuery["payment.paymentStatus"] = "refunded";
    } else if (status === "failed") {
      matchQuery["payment.paymentStatus"] = "refund_failed";
    }
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { updatedAt: -1 },
    populate: [
      { path: "hotel", select: "name" },
      { path: "branch", select: "name" },
    ],
  };

  const result = await Order.paginate(matchQuery, options);

  // Get refund requests for these orders
  const orderIds = result.docs.map((order) => order._id);
  const refundRequests = await RefundRequest.find({
    order: { $in: orderIds },
    user: userId,
  });

  // Enhance orders with refund information
  const ordersWithRefundInfo = result.docs.map((order) => {
    const refundRequest = refundRequests.find(
      (req) => req.order.toString() === order._id.toString()
    );

    return {
      _id: order._id,
      orderNumber: order.orderNumber || order._id,
      hotel: order.hotel,
      branch: order.branch,
      totalPrice: order.totalPrice,
      orderDate: order.createdAt,
      paymentStatus: order.payment?.paymentStatus,
      refund: {
        amount: order.payment?.refund?.amount || 0,
        status: getRefundDisplayStatus(
          order.payment?.paymentStatus,
          order.payment?.refund?.gatewayResponse
        ),
        reason: order.payment?.refund?.reason || refundRequest?.reason || "N/A",
        initiatedAt: order.payment?.refund?.initiatedAt,
        transactionId: order.payment?.refund?.transactionId,
        expectedCompletion: getExpectedCompletionTime(
          order.payment?.refund?.gatewayResponse
        ),
      },
      refundRequest: refundRequest
        ? {
            status: refundRequest.status,
            requestedAt: refundRequest.createdAt,
          }
        : null,
    };
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        refunds: ordersWithRefundInfo,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.totalDocs,
          hasNext: result.hasNextPage,
          hasPrev: result.hasPrevPage,
        },
      },
      "User refunds retrieved successfully"
    )
  );
});

/**
 * Helper function to get user-friendly refund status
 */
function getRefundDisplayStatus(paymentStatus, gatewayResponse) {
  if (!paymentStatus) return "Unknown";

  switch (paymentStatus) {
    case "refund_pending":
      const gatewayState = gatewayResponse?.data?.state;
      if (gatewayState === "PENDING") return "Processing";
      if (gatewayState === "COMPLETED") return "Completed";
      if (gatewayState === "FAILED") return "Failed";
      return "Initiated";

    case "refunded":
      return "Completed";

    case "refund_failed":
      return "Failed";

    default:
      return "Unknown";
  }
}

/**
 * Helper function to calculate expected completion time
 */
function getExpectedCompletionTime(gatewayResponse) {
  if (!gatewayResponse?.data?.estimatedTime) return null;

  const estimatedMinutes = gatewayResponse.data.estimatedTime;
  const initiatedAt = new Date();
  const expectedAt = new Date(initiatedAt.getTime() + estimatedMinutes * 60000);

  return {
    estimatedMinutes,
    expectedAt: expectedAt.toISOString(),
    message: `Expected within ${estimatedMinutes} minutes`,
  };
}

/**
 * Helper function to build refund timeline
 */
function buildRefundTimeline(order, refundRequest) {
  const timeline = [];

  // Order placed
  timeline.push({
    status: "Order Placed",
    timestamp: order.createdAt,
    description: "Order was successfully placed",
  });

  // Payment completed
  if (order.payment?.paidAt) {
    timeline.push({
      status: "Payment Completed",
      timestamp: order.payment.paidAt,
      description: `Payment of ₹${order.totalPrice} was successful`,
    });
  }

  // Refund requested
  if (refundRequest) {
    timeline.push({
      status: "Refund Requested",
      timestamp: refundRequest.createdAt,
      description: `Refund of ₹${refundRequest.amount} was requested`,
    });
  }

  // Refund initiated
  if (order.payment?.refund?.initiatedAt) {
    timeline.push({
      status: "Refund Initiated",
      timestamp: order.payment.refund.initiatedAt,
      description: "Refund has been processed with payment gateway",
    });
  }

  // Refund completed (if status is refunded)
  if (order.payment?.paymentStatus === "refunded") {
    timeline.push({
      status: "Refund Completed",
      timestamp: order.updatedAt,
      description: "Refund has been successfully completed",
    });
  }

  return timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export default {
  getOrderRefundStatus,
  getUserRefunds,
};
