/**
 * Webhook Routes
 * Public endpoints for payment gateway webhooks
 * Razorpay, PhonePe, and Paytm webhook handlers
 */

import express from "express";
import {
  handleRazorpayWebhook,
  handleRazorpayWebhookUniversal,
  handlePhonePeWebhook,
  handlePaytmWebhook,
  getWebhookLogs,
  testWebhook,
  retryWebhook,
} from "../../controllers/payment/webhookController.js";
import { authenticate, rbac } from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Public webhook endpoints (no authentication required)
// Payment gateways will call these URLs directly

// Universal Razorpay webhook - auto-detects hotel from order
// Use this URL in Razorpay dashboard: /api/v1/webhooks/razorpay
router.post("/razorpay", handleRazorpayWebhookUniversal);

// Hotel-specific Razorpay webhook (if you prefer per-hotel webhook URLs)
router.post("/razorpay/:hotelId", handleRazorpayWebhook);
router.post("/phonepe/:hotelId", handlePhonePeWebhook);
router.post("/paytm/:hotelId", handlePaytmWebhook);

// Protected admin routes for webhook management
router.use(authenticate);
router.use(rbac({ roles: ["admin", "super_admin"] }));

router.get("/logs/:hotelId", getWebhookLogs);
router.post("/test/:provider/:hotelId", testWebhook);
router.post("/retry/:orderId", retryWebhook);

export default router;
