import dotenv from "dotenv";

dotenv.config();

// Razorpay Payment Gateway Configuration
export const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  mode: process.env.NODE_ENV === "production" ? "PRODUCTION" : "TEST",
  hostUrl: "https://api.razorpay.com/v1", // Same for both test and production
  callbackUrl: process.env.RAZORPAY_REDIRECT_URL,
  webhookUrl: process.env.RAZORPAY_WEBHOOK_URL,
};

// Payment Gateway URLs
export const paymentGatewayUrls = {
  RAZORPAY: "https://api.razorpay.com/v1",
};

// Payment Methods Enum
export const paymentMethods = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  WALLET: "wallet",
  RAZORPAY: "razorpay",
};

// Payment Status Enum
export const paymentStatus = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
};

export default {
  razorpayConfig,
  paymentGatewayUrls,
  paymentMethods,
  paymentStatus,
};
