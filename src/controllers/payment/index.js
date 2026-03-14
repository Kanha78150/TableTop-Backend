// Payment controllers barrel export
// Note: namespace exports used for files with overlapping function names

// Non-conflicting — flat re-exports
export * from "./paymentConfig.controller.js";
export * from "./refund.controller.js";
export * from "./subscriptionWebhook.controller.js";

// Conflicting: payment & genericPayment both export `initiatePayment`
export * as paymentCtrl from "./payment.controller.js";
export * as genericPaymentCtrl from "./genericPayment.controller.js";

// Conflicting: webhook & webhookHandler both export `handleRazorpayWebhook`
export * as webhookCtrl from "./webhook.controller.js";
export * as webhookHandlerCtrl from "./webhookHandler.controller.js";
