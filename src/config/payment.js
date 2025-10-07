import dotenv from "dotenv";

dotenv.config();

// PhonePe Payment Gateway Configuration
export const phonePeConfig = {
  merchantId: process.env.PHONEPE_MERCHANT_ID || "PGTESTPAYUAT",
  saltKey:
    process.env.PHONEPE_SALT_KEY || "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399",
  saltIndex: process.env.PHONEPE_SALT_INDEX || 1,
  merchantUserId: process.env.PHONEPE_MERCHANT_USER_ID || "MUID123",
  hostUrl:
    process.env.PHONEPE_HOST_URL ||
    "https://api-preprod.phonepe.com/apis/pg-sandbox",
  redirectUrl:
    process.env.PHONEPE_REDIRECT_URL ||
    "http://localhost:8000/api/v1/payment/phonepe/callback",
  callbackUrl:
    process.env.PHONEPE_CALLBACK_URL ||
    "http://localhost:8000/api/v1/payment/phonepe/status",
  mode: process.env.NODE_ENV === "production" ? "PRODUCTION" : "UAT",
};

// Payment Gateway URLs
export const phonePeUrls = {
  UAT: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  PRODUCTION: "https://api.phonepe.com/apis/pg",
};

// Payment Methods Enum
export const paymentMethods = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  WALLET: "wallet",
  PHONEPE: "phonepe",
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
  phonePeConfig,
  phonePeUrls,
  paymentMethods,
  paymentStatus,
};
