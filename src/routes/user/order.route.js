// src/routes/user/order.route.js - User Order Routes
// Note: authenticateUser is applied at the mount level in user.route.js
import express from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  getOrderPaymentInfo,
  cancelOrder,
  reorder,
  getOrderStatus,
  getActiveOrders,
  getOrderHistory,
  getTableOrderHistory,
  downloadInvoice,
  downloadCreditNote,
} from "../../controllers/user/order.controller.js";
import { getOrderRefundStatus } from "../../controllers/user/refundStatus.controller.js";

const router = express.Router();

// Place a new order
router.post("/", placeOrder);

// Get user's orders with filters
router.get("/", getMyOrders);

// Get active orders
router.get("/active", getActiveOrders);

// Get order history
router.get("/history", getOrderHistory);

// Get table order history
router.get("/table-history", getTableOrderHistory);

// Get order payment information (for payment page) - MUST be before /:orderId
router.get("/:orderId/payment-info", getOrderPaymentInfo);

// Get specific order details
router.get("/:orderId", getOrderDetails);

// Get order status/tracking info
router.get("/:orderId/status", getOrderStatus);

// Cancel order
router.put("/:orderId/cancel", cancelOrder);

// Reorder from previous order
router.post("/:orderId/reorder", reorder);

// Download invoice for order
router.get("/:orderId/invoice", downloadInvoice);

// Download credit note for order
router.get("/:orderId/credit-notes/:creditNoteNumber", downloadCreditNote);

// Refund status for a specific order
router.get("/:orderId/refund-status", getOrderRefundStatus);

export default router;
