import dotenv from "dotenv";

dotenv.config();

// PhonePe Payment Gateway Configuration - Official UAT Sandbox
export const phonePeConfig = {
  merchantId: process.env.PHONEPE_MERCHANT_ID || "PGTESTPAYUAT",
  saltKey:
    process.env.PHONEPE_SALT_KEY || "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399",
  saltIndex: process.env.PHONEPE_SALT_INDEX || 1,
  merchantUserId: process.env.PHONEPE_MERCHANT_USER_ID || "MUID123",
  // Official UAT Sandbox URL as per documentation
  hostUrl:
    process.env.PHONEPE_HOST_URL ||
    "https://api-preprod.phonepe.com/apis/pg-sandbox",
  // OAuth endpoint for authentication (will be used for production)
  authUrl:
    process.env.PHONEPE_AUTH_URL ||
    "https://api-preprod.phonepe.com/apis/identity-manager",
  redirectUrl:
    process.env.PHONEPE_REDIRECT_URL ||
    "http://localhost:8000/api/v1/payment/phonepe/callback",
  callbackUrl:
    process.env.PHONEPE_CALLBACK_URL ||
    "http://localhost:8000/api/v1/payment/phonepe/webhook",
  mode: process.env.NODE_ENV === "production" ? "PRODUCTION" : "UAT",
  // Add client credentials for OAuth (for future production use)
  clientId: process.env.PHONEPE_CLIENT_ID || "",
  clientSecret: process.env.PHONEPE_CLIENT_SECRET || "",
  clientVersion: process.env.PHONEPE_CLIENT_VERSION || "v1",
};

// Payment Gateway URLs - Official PhonePe Documentation
export const phonePeUrls = {
  UAT: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  PRODUCTION: "https://api.phonepe.com/apis/pg",
  AUTH_PRODUCTION: "https://api.phonepe.com/apis/identity-manager",
};

// API Endpoints as per official documentation
export const phonePeEndpoints = {
  OAUTH_TOKEN: "/v1/oauth/token",
  CREATE_PAYMENT: "/checkout/v2/pay",
  ORDER_STATUS: "/checkout/v2/order",
  REFUND: "/payments/v2/refund",
  REFUND_STATUS: "/payments/v2/refund",
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
