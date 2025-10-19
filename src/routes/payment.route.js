import express from "express";
import {
  initiatePayment,
  handlePaymentCallback,
  handlePaymentWebhook,
  checkPaymentStatus,
  initiateRefund,
  getPaymentHistory,
  getAllPayments,
  getPaymentAnalytics,
  debugOrdersData,
  debugPaymentCallback,
} from "../controllers/payment/genericPaymentController.js";
import {
  createRefundRequest,
  getUserRefundRequests,
  getRefundRequestDetails,
  cancelRefundRequest,
  getAllRefundRequests,
  updateRefundRequestStatus,
} from "../controllers/payment/refundController.js";
import {
  authenticateAdmin,
  rateLimitSensitiveOps,
} from "../middleware/roleAuth.middleware.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validation.middleware.js";
import { body, param, query } from "express-validator";

const router = express.Router();

// Payment validation rules
const paymentInitiateValidation = [
  body("orderId").isMongoId().withMessage("Invalid order ID"),
  body("amount")
    .isFloat({ min: 1 })
    .withMessage("Amount must be a positive number"),
  body("userId").isMongoId().withMessage("Invalid user ID"),
  body("userPhone").isMobilePhone("en-IN").withMessage("Invalid phone number"),
  body("userName")
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),
  body("userEmail").optional().isEmail().withMessage("Invalid email address"),
];

const refundValidation = [
  body("orderId").isMongoId().withMessage("Invalid order ID"),
  body("amount")
    .isFloat({ min: 1 })
    .withMessage("Refund amount must be a positive number"),
  body("reason")
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage("Reason must be between 5 and 200 characters"),
];

const refundRequestValidation = [
  body("orderId").isMongoId().withMessage("Invalid order ID"),
  body("amount")
    .isFloat({ min: 1 })
    .withMessage("Refund amount must be a positive number"),
  body("reason")
    .isLength({ min: 10, max: 500 })
    .withMessage("Reason must be between 10 and 500 characters"),
];

const refundStatusValidation = [
  body("status")
    .isIn(["approved", "rejected", "processed", "completed"])
    .withMessage("Invalid status"),
  body("adminNotes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Admin notes cannot exceed 1000 characters"),
];

const orderIdValidation = [
  param("orderId").isMongoId().withMessage("Invalid order ID"),
];

const transactionIdValidation = [
  param("transactionId")
    .matches(/^TXN-\d{4}-[A-F0-9]{12}$/)
    .withMessage("Invalid transaction ID format"),
];

// Razorpay Payment Routes
router.post(
  "/razorpay/initiate",
  rateLimitSensitiveOps,
  authenticateUser,
  paymentInitiateValidation,
  validateRequest,
  initiatePayment
);

// Request logging middleware for callback debugging
const logCallbackRequest = (req, res, next) => {
  console.log("=== PAYMENT CALLBACK DEBUG ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Query:", JSON.stringify(req.query, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("Content-Type:", req.get("content-type"));
  console.log(
    "Raw Body Length:",
    req.rawBody ? req.rawBody.length : "No raw body"
  );
  console.log("===============================");
  next();
};

// Payment callback/redirect (public route) - supports both GET and POST
router.get("/razorpay/callback", logCallbackRequest, handlePaymentCallback);
router.post("/razorpay/callback", logCallbackRequest, handlePaymentCallback);

// Payment webhook (public route) - Razorpay will call this
router.post("/razorpay/webhook", handlePaymentWebhook);

// Check payment status
router.get(
  "/razorpay/status/:transactionId",
  authenticateUser,
  transactionIdValidation,
  validateRequest,
  checkPaymentStatus
);

// Initiate refund (Admin/Manager only)
router.post(
  "/razorpay/refund",
  authenticateAdmin,
  refundValidation,
  validateRequest,
  initiateRefund
);

// Payment history for specific order
router.get(
  "/history/:orderId",
  authenticateUser,
  orderIdValidation,
  validateRequest,
  getPaymentHistory
);

// Get all payments (Admin only)
router.get(
  "/all",
  authenticateAdmin,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("status")
      .optional()
      .isIn([
        "pending",
        "paid",
        "failed",
        "refund_pending",
        "refunded",
        "cancelled",
      ])
      .withMessage("Invalid payment status"),
    query("method")
      .optional()
      .isIn(["cash", "card", "upi", "wallet", "razorpay"])
      .withMessage("Invalid payment method"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid start date format"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid end date format"),
  ],
  validateRequest,
  getAllPayments
);

// Payment analytics (Admin/Manager only)
router.get(
  "/analytics",
  authenticateAdmin,
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid start date format"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid end date format"),
    query("branchId").optional().isMongoId().withMessage("Invalid branch ID"),
  ],
  validateRequest,
  getPaymentAnalytics
);

// =================== USER REFUND REQUEST ROUTES ===================

// Create refund request (User)
router.post(
  "/refund-request",
  authenticateUser,
  refundRequestValidation,
  validateRequest,
  createRefundRequest
);

// Get user's refund requests (User)
router.get("/refund-requests", authenticateUser, getUserRefundRequests);

// Get refund request details (User)
router.get(
  "/refund-request/:requestId",
  authenticateUser,
  getRefundRequestDetails
);

// Cancel refund request (User)
router.delete(
  "/refund-request/:requestId",
  authenticateUser,
  cancelRefundRequest
);

// =================== ADMIN REFUND MANAGEMENT ROUTES ===================

// Get all refund requests (Admin)
router.get("/admin/refund-requests", authenticateAdmin, getAllRefundRequests);

// Update refund request status (Admin)
router.put(
  "/admin/refund-request/:requestId/status",
  authenticateAdmin,
  refundStatusValidation,
  validateRequest,
  updateRefundRequestStatus
);

// Debug orders data (temporary)
router.get("/debug/orders", authenticateAdmin, debugOrdersData);

// Debug payment callback (temporary)
router.post("/debug/callback", debugPaymentCallback);

// Health check route for payment service
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Payment service is running",
    timestamp: new Date().toISOString(),
    service: "Razorpay Payment Gateway",
  });
});

export default router;
