import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { Admin } from "../../models/Admin.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { paymentService } from "../../services/paymentService.js";
import { sendEmail } from "../../utils/emailService.js";

/**
 * Handle Payment Webhook
 * Processes payment webhooks from Razorpay for subscriptions
 * @route POST /api/v1/payment/webhook/subscription
 */
export const handleSubscriptionWebhook = async (req, res, next) => {
  try {
    const webhookBody = req.body;
    const webhookSignature = req.headers["x-razorpay-signature"];

    // Skip signature verification in development mode for Postman testing
    const isDevelopment = process.env.NODE_ENV === "development";

    // TODO: PRODUCTION - Uncomment below for production signature verification
    // if (!isDevelopment) {
    //   // Only verify signature in production
    //   const isValid = paymentService.verifyWebhookSignature(
    //     JSON.stringify(webhookBody),
    //     webhookSignature
    //   );

    //   if (!isValid) {
    //     console.error("Invalid webhook signature");
    //     return res.status(400).json({ error: "Invalid signature" });
    //   }
    // }

    if (isDevelopment) {
      console.log("⚠️  Development mode: Skipping signature verification");
    }

    const event = webhookBody.event;
    const payload = webhookBody.payload.payment.entity;

    console.log("Subscription webhook received:", {
      event,
      paymentId: payload.id,
      orderId: payload.order_id,
      status: payload.status,
    });

    // Handle different webhook events
    switch (event) {
      case "payment.captured":
      case "payment.authorized":
        await handleSuccessfulPayment(payload);
        break;

      case "payment.failed":
        await handleFailedPayment(payload);
        break;

      case "payment.refunded":
        await handleRefundedPayment(payload);
        break;

      default:
        console.log("Unhandled webhook event:", event);
    }

    // Respond to Razorpay webhook
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Webhook handling error:", error);
    // Still return 200 to Razorpay to avoid retries
    res.status(200).json({ status: "error", message: error.message });
  }
};

/**
 * Handle Successful Payment
 * Activates subscription after successful payment
 */
const handleSuccessfulPayment = async (payload) => {
  try {
    const { id: paymentId, order_id: orderId, amount, method } = payload;
    const notes = payload.notes || {};

    // Check if this is a subscription payment
    if (notes.type !== "subscription" || !notes.subscriptionId) {
      console.log("Not a subscription payment, skipping");
      return;
    }

    const subscriptionId = notes.subscriptionId;

    // Find subscription
    const subscription = await AdminSubscription.findById(
      subscriptionId
    ).populate("plan admin");

    if (!subscription) {
      console.error("Subscription not found:", subscriptionId);
      return;
    }

    // Check if already activated
    if (subscription.status === "active") {
      console.log("Subscription already active:", subscriptionId);
      return;
    }

    // Update subscription status to active
    subscription.status = "active";
    subscription.startDate = new Date();

    // Recalculate end date from actual activation date
    const endDate = new Date(subscription.startDate);
    if (subscription.billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    subscription.endDate = endDate;

    // Add payment to history
    subscription.paymentHistory.push({
      amount: amount / 100, // Convert from paise to rupees
      currency: "INR",
      paymentMethod: "razorpay", // razorpay, stripe, paypal, bank_transfer, other
      transactionId: paymentId,
      paymentDate: new Date(),
      status: "success",
      notes: `Payment via webhook - ${
        notes.planName || "Subscription"
      } (Method: ${method})`,
    });

    // Initialize usage counters
    subscription.usage = {
      hotels: 0,
      branches: 0,
      managers: 0,
      staff: 0,
      tables: 0,
      ordersThisMonth: 0,
      storageUsedGB: 0,
    };

    await subscription.save();

    // Update admin's subscription reference
    await Admin.findByIdAndUpdate(subscription.admin._id, {
      subscription: subscription._id,
    });

    // Send activation email
    try {
      await sendEmail(subscription.admin.email, "subscription-activated", {
        adminName: subscription.admin.name,
        planName: subscription.plan.name,
        startDate: subscription.startDate.toLocaleDateString(),
        endDate: subscription.endDate.toLocaleDateString(),
        amount: amount / 100,
      });
    } catch (emailError) {
      console.error("Failed to send activation email:", emailError);
    }

    console.log(
      "Subscription activated successfully via webhook:",
      subscriptionId
    );
  } catch (error) {
    console.error("Error handling successful payment:", error);
    throw error;
  }
};

/**
 * Handle Failed Payment
 * Updates subscription status when payment fails
 */
const handleFailedPayment = async (payload) => {
  try {
    const { order_id: orderId, error_description } = payload;
    const notes = payload.notes || {};

    // Check if this is a subscription payment
    if (notes.type !== "subscription" || !notes.subscriptionId) {
      return;
    }

    const subscriptionId = notes.subscriptionId;

    // Find subscription
    const subscription = await AdminSubscription.findById(
      subscriptionId
    ).populate("admin");

    if (!subscription) {
      console.error("Subscription not found:", subscriptionId);
      return;
    }

    // Add failed payment to history
    subscription.paymentHistory.push({
      amount: 0,
      currency: "INR",
      paymentMethod: "online",
      transactionId: orderId,
      paymentDate: new Date(),
      status: "failed",
      notes: `Payment failed: ${error_description || "Unknown error"}`,
    });

    await subscription.save();

    // Send payment failed email
    try {
      await sendEmail(subscription.admin.email, "payment-failed", {
        adminName: subscription.admin.name,
        planName: notes.planName || "Subscription",
        reason: error_description || "Payment processing failed",
        retryLink: `${process.env.FRONTEND_URL}/subscription/retry/${subscriptionId}`,
      });
    } catch (emailError) {
      console.error("Failed to send payment failed email:", emailError);
    }

    console.log("Failed payment recorded for subscription:", subscriptionId);
  } catch (error) {
    console.error("Error handling failed payment:", error);
    throw error;
  }
};

/**
 * Handle Refunded Payment
 * Updates subscription when payment is refunded
 */
const handleRefundedPayment = async (payload) => {
  try {
    const { id: paymentId, amount } = payload;
    const notes = payload.notes || {};

    // Check if this is a subscription payment
    if (notes.type !== "subscription" || !notes.subscriptionId) {
      return;
    }

    const subscriptionId = notes.subscriptionId;

    // Find subscription
    const subscription = await AdminSubscription.findById(
      subscriptionId
    ).populate("admin plan");

    if (!subscription) {
      console.error("Subscription not found:", subscriptionId);
      return;
    }

    // Cancel the subscription
    subscription.status = "cancelled";
    subscription.autoRenew = false;

    // Add refund to payment history
    subscription.paymentHistory.push({
      amount: -(amount / 100),
      currency: "INR",
      paymentMethod: "refund",
      transactionId: paymentId,
      paymentDate: new Date(),
      status: "refunded",
      notes: "Payment refunded",
    });

    await subscription.save();

    // Send refund confirmation email
    try {
      await sendEmail(subscription.admin.email, "subscription-cancelled", {
        adminName: subscription.admin.name,
        planName: subscription.plan?.name || "Your plan",
        refundAmount: amount / 100,
        refundDate: new Date().toLocaleDateString(),
      });
    } catch (emailError) {
      console.error("Failed to send refund email:", emailError);
    }

    console.log("Refund processed for subscription:", subscriptionId);
  } catch (error) {
    console.error("Error handling refunded payment:", error);
    throw error;
  }
};

/**
 * Manual Payment Verification
 * Allows manual verification of subscription payment
 * @route POST /api/v1/payment/verify-subscription
 */
export const verifySubscriptionPayment = async (req, res, next) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      subscriptionId,
    } = req.body;

    // Validate input
    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !subscriptionId
    ) {
      return next(
        new APIError(400, "Missing required payment verification parameters")
      );
    }

    // Verify signature
    const isValid = paymentService.verifySubscriptionPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!isValid) {
      return next(new APIError(400, "Invalid payment signature"));
    }

    // Get payment details
    const paymentDetails = await paymentService.fetchPaymentDetails(
      razorpay_payment_id
    );

    // Find subscription
    const subscription = await AdminSubscription.findById(subscriptionId);
    if (!subscription) {
      return next(new APIError(404, "Subscription not found"));
    }

    // Activate subscription (reuse webhook handler logic)
    await handleSuccessfulPayment({
      id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: paymentDetails.amount * 100, // Convert to paise
      method: paymentDetails.method,
      notes: {
        type: "subscription",
        subscriptionId: subscriptionId,
      },
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          subscriptionId,
          paymentId: razorpay_payment_id,
          status: "verified",
          message: "Payment verified and subscription activated successfully",
        },
        "Payment verification successful"
      )
    );
  } catch (error) {
    next(error);
  }
};
