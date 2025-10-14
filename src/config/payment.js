import dotenv from "dotenv";

dotenv.config();

// Razorpay Payment Gateway Configuration
export const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID || "",
  keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  mode: process.env.NODE_ENV === "production" ? "PRODUCTION" : "TEST",
  hostUrl:
    process.env.NODE_ENV === "production"
      ? "https://api.razorpay.com/v1"
      : "https://api.razorpay.com/v1",
  callbackUrl:
    process.env.RAZORPAY_REDIRECT_URL ||
    "http://localhost:8000/api/v1/payment/razorpay/callback",
  webhookUrl:
    process.env.RAZORPAY_WEBHOOK_URL ||
    "http://localhost:8000/api/v1/payment/razorpay/webhook",
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
