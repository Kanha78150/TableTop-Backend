/**
 * Payment Controller
 * Handles customer-facing payment operations
 * Payment initiation, verification, status checking, and refunds
 */

import { Order } from "../../models/Order.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { PaymentConfig } from "../../models/PaymentConfig.model.js";
import dynamicPaymentService from "../../services/dynamicPaymentService.js";

/**
 * Initiate payment for an order
 * @route POST /api/v1/payments/initiate
 * @access Private (User)
 */
export const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Fetch order
    const order = await Order.findById(orderId)
      .populate("hotel")
      .populate("user");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Verify user owns this order
    if (order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to pay for this order",
      });
    }

    // Check if order is already paid
    if (order.payment?.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    // Check if order status allows payment
    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot pay for cancelled order",
      });
    }

    // Check if payment already initiated (has gatewayOrderId means initiation was done)
    if (
      order.payment &&
      order.payment.gatewayOrderId &&
      order.payment.paymentStatus === "pending"
    ) {
      // Return existing payment details
      return res.status(200).json({
        success: true,
        message: "Payment already initiated",
        data: {
          orderId: order._id,
          gatewayOrderId: order.payment.gatewayOrderId,
          provider: order.payment.provider,
          amount: order.totalPrice,
          currency: "INR",
          paymentDetails: order.payment.gatewayResponse,
        },
      });
    }

    // Prepare customer info
    const customerInfo = {
      name: req.user.name || order.customerName,
      email: req.user.email || order.customerEmail,
      phone: req.user.phone || order.customerPhone,
    };

    // Prepare order metadata
    const metadata = {
      orderNumber: order.orderNumber || order._id.toString(),
      customerName: customerInfo.name,
      hotelName: order.hotel.name,
    };

    // Create payment order
    const paymentResponse = await dynamicPaymentService.createOrder({
      hotelId: order.hotel._id.toString(),
      orderId: order._id.toString(),
      amount: order.totalPrice, // Fixed: was totalAmount, should be totalPrice
      currency: "INR",
      customerInfo,
      metadata,
    });

    return res.status(200).json({
      success: true,
      message: "Payment initiated successfully",
      data: paymentResponse,
    });
  } catch (error) {
    console.error("Error initiating payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
      error: error.message,
    });
  }
};

/**
 * Verify payment after completion
 * @route POST /api/v1/payments/verify
 * @access Private (User)
 */
export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature, ...additionalData } = req.body;

    if (!orderId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and Payment ID are required",
      });
    }

    // Fetch order to verify user ownership
    const order = await Order.findById(orderId).populate("user");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Verify user owns this order
    if (order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to verify this payment",
      });
    }

    // Verify payment
    const verificationResult = await dynamicPaymentService.verifyPayment({
      orderId,
      paymentId,
      signature,
      additionalData,
    });

    if (verificationResult.verified) {
      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        data: verificationResult,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        data: verificationResult,
      });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: error.message,
    });
  }
};

/**
 * Get payment status
 * @route GET /api/v1/payments/:orderId/status
 * @access Private (User/Admin/Manager)
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch order
    const order = await Order.findById(orderId)
      .populate("user")
      .populate("hotel");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization - user owns order OR admin/manager of hotel
    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isHotelManager =
      req.user.role === "manager" &&
      order.hotel.manager?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superAdmin";

    if (!isOwner && !isHotelManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this payment status",
      });
    }

    // If payment not initiated yet
    if (!order.payment || !order.payment.gatewayOrderId) {
      return res.status(200).json({
        success: true,
        data: {
          orderId: order._id,
          paymentStatus: order.paymentStatus || "pending",
          paymentInitiated: false,
        },
      });
    }

    // Get payment status from gateway
    const statusResult = await dynamicPaymentService.getPaymentStatus(orderId);

    return res.status(200).json({
      success: true,
      data: statusResult,
    });
  } catch (error) {
    console.error("Error getting payment status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get payment status",
      error: error.message,
    });
  }
};

/**
 * Request refund for an order
 * @route POST /api/v1/payments/:orderId/refund
 * @access Private (Admin/Manager)
 */
export const requestRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Refund reason is required",
      });
    }

    // Fetch order
    const order = await Order.findById(orderId).populate("hotel");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization - only hotel manager or admin can process refunds
    const isHotelManager =
      req.user.role === "manager" &&
      order.hotel.manager?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superAdmin";

    if (!isHotelManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to process refunds for this order",
      });
    }

    // Process refund
    const refundResult = await dynamicPaymentService.processRefund(
      orderId,
      amount,
      reason
    );

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: refundResult,
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process refund",
      error: error.message,
    });
  }
};

/**
 * Get payment history for a hotel
 * @route GET /api/v1/payments/hotel/:hotelId/history
 * @access Private (Manager/Admin)
 */
export const getHotelPaymentHistory = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    const isHotelManager =
      req.user.role === "manager" &&
      hotel.manager?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superAdmin";

    if (!isHotelManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view payment history for this hotel",
      });
    }

    // Build query
    const query = { hotel: hotelId, "payment.paymentId": { $exists: true } };

    if (status) {
      query["payment.status"] = status;
    }

    if (startDate || endDate) {
      query["payment.createdAt"] = {};
      if (startDate) query["payment.createdAt"].$gte = new Date(startDate);
      if (endDate) query["payment.createdAt"].$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .sort({ "payment.createdAt": -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    // Calculate totals
    const totalAmount = orders.reduce(
      (sum, order) => sum + (order.payment?.amount || 0),
      0
    );
    const totalCommission = orders.reduce(
      (sum, order) => sum + (order.commissionAmount || 0),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        summary: {
          totalOrders: total,
          totalAmount,
          totalCommission,
          netAmount: totalAmount - totalCommission,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
      error: error.message,
    });
  }
};

/**
 * Get user's payment history
 * @route GET /api/v1/payments/my-payments
 * @access Private (User)
 */
export const getMyPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // Build query
    const query = {
      user: req.user._id,
      "payment.paymentId": { $exists: true },
    };

    if (status) {
      query["payment.status"] = status;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(query)
      .populate("hotel", "name location")
      .sort({ "payment.createdAt": -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user payments:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
      error: error.message,
    });
  }
};

/**
 * Get commission summary for a hotel
 * @route GET /api/v1/payments/hotel/:hotelId/commission
 * @access Private (Manager/Admin)
 */
export const getCommissionSummary = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    const isHotelManager =
      req.user.role === "manager" &&
      hotel.manager?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superAdmin";

    if (!isHotelManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view commission data for this hotel",
      });
    }

    // Build query
    const query = {
      hotel: hotelId,
      commissionAmount: { $gt: 0 },
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Aggregate commission data
    const commissionData = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$commissionStatus",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalCommission: { $sum: "$commissionAmount" },
        },
      },
    ]);

    // Format response
    const summary = {
      pending: { count: 0, totalAmount: 0, totalCommission: 0 },
      due: { count: 0, totalAmount: 0, totalCommission: 0 },
      paid: { count: 0, totalAmount: 0, totalCommission: 0 },
      waived: { count: 0, totalAmount: 0, totalCommission: 0 },
    };

    commissionData.forEach((item) => {
      if (summary[item._id]) {
        summary[item._id] = {
          count: item.count,
          totalAmount: item.totalAmount,
          totalCommission: item.totalCommission,
        };
      }
    });

    const totalCommissionDue = summary.due.totalCommission;
    const totalCommissionPaid = summary.paid.totalCommission;
    const totalCommissionPending = summary.pending.totalCommission;

    return res.status(200).json({
      success: true,
      data: {
        summary,
        totals: {
          pending: totalCommissionPending,
          due: totalCommissionDue,
          paid: totalCommissionPaid,
          outstanding: totalCommissionDue + totalCommissionPending,
        },
        commissionConfig: hotel.commissionConfig,
      },
    });
  } catch (error) {
    console.error("Error fetching commission summary:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch commission summary",
      error: error.message,
    });
  }
};

/**
 * Get payment gateway public key for frontend checkout
 * @route GET /api/v1/payments/public-key/:hotelId
 * @access Public (no auth required - public key is safe to expose)
 */
export const getPaymentPublicKey = async (req, res) => {
  try {
    const { hotelId } = req.params;

    if (!hotelId) {
      return res.status(400).json({
        success: false,
        message: "Hotel ID is required",
      });
    }

    // Fetch hotel
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Fetch payment config with ALL credentials
    const paymentConfig = await PaymentConfig.findOne({
      hotel: hotelId,
    }).select(
      "+credentials.keyId +credentials.keySecret +credentials.webhookSecret +credentials.merchantId +credentials.saltKey +credentials.saltIndex +credentials.merchantKey +credentials.websiteName"
    );

    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "Payment configuration not found for this hotel",
      });
    }

    if (!paymentConfig.isActive) {
      return res.status(400).json({
        success: false,
        message: "Payment gateway is currently disabled for this hotel",
      });
    }

    // Get decrypted credentials with proper error handling
    let credentials;
    try {
      credentials = paymentConfig.getDecryptedCredentials();
    } catch (decryptError) {
      console.error(
        "Decryption failed for payment config:",
        decryptError.message
      );
      return res.status(500).json({
        success: false,
        message:
          "Payment credentials are corrupted. Please reconfigure payment gateway in admin panel.",
        error: "DECRYPTION_FAILED",
      });
    }

    if (!credentials || !credentials.keyId) {
      return res.status(500).json({
        success: false,
        message: "Payment gateway not properly configured",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment public key retrieved successfully",
      data: {
        provider: paymentConfig.provider,
        keyId: credentials.keyId, // Public key - safe to expose
        hotelName: hotel.name,
      },
    });
  } catch (error) {
    console.error("Error fetching payment public key:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment public key",
      error: error.message,
    });
  }
};
