/**
 * Webhook Routes
 * Public endpoints for payment gateway webhooks
 * Razorpay, PhonePe, and Paytm webhook handlers
 */

import express from "express";
import {
  handleRazorpayWebhook,
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
