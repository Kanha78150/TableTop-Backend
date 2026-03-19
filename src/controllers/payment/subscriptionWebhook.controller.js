import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { Admin } from "../../models/Admin.model.js";
import { EmailQueue } from "../../models/EmailQueue.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { paymentService } from "../../services/payment/payment.service.js";
import { invoiceService } from "../../services/invoice.service.js";
import { sendEmail } from "../../utils/emailService.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

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

    if (!isDevelopment) {
      // Verify webhook signature in non-development environments
      const isValid = paymentService.verifyWebhookSignature(
        webhookBody,
        webhookSignature
      );

      if (!isValid) {
        console.error("Invalid webhook signature");
        return res.status(400).json({ error: "Invalid signature" });
      }
    } else {
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
    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("plan admin");

    if (!subscription) {
      console.error("Subscription not found:", subscriptionId);
      return;
    }

    // Handle upgrade payment (subscription is already active)
    if (notes.upgradeToPlanId && subscription.status === "active") {
      const { SubscriptionPlan } =
        await import("../../models/SubscriptionPlan.model.js");
      const newPlan = await SubscriptionPlan.findById(notes.upgradeToPlanId);
      if (newPlan) {
        subscription.plan = newPlan._id;
        subscription.paymentHistory.push({
          amount: amount / 100,
          currency: "INR",
          paymentMethod: "razorpay",
          transactionId: paymentId,
          paymentDate: new Date(),
          status: "success",
          notes: `Upgrade payment completed - ${newPlan.name} (Method: ${method})`,
        });
        await subscription.save();

        try {
          await sendEmail({
            to: subscription.admin.email,
            subject: "Plan Upgraded Successfully",
            template: "subscription-activated",
            data: {
              name: subscription.admin.name,
              planName: newPlan.name,
              billingCycle: subscription.billingCycle,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              amount: amount / 100,
              maxHotels: newPlan.features?.maxHotels || 0,
              maxBranches: newPlan.features?.maxBranches || 0,
              maxManagers: newPlan.features?.maxManagers || 0,
              maxStaff: newPlan.features?.maxStaff || 0,
              maxTables: newPlan.features?.maxTables || 0,
            },
          });
        } catch (emailError) {
          console.error("Failed to send upgrade email:", emailError);
        }

        console.log(
          "Subscription upgraded successfully via webhook:",
          subscriptionId
        );
        return;
      }
    }

    // Handle renewal of active subscription (extend from current endDate)
    const isRenewal = notes.isRenewal === "true";

    if (subscription.status === "active" && !isRenewal) {
      console.log(
        "Subscription already active (not a renewal), skipping:",
        subscriptionId
      );
      return;
    }

    // Determine the start date for the new period
    const wasActive = subscription.status === "active";
    let newStartDate;
    if (isRenewal && wasActive && new Date(subscription.endDate) > new Date()) {
      // Early renewal: extend from current endDate (don't lose remaining days)
      newStartDate = new Date(subscription.endDate);
    } else {
      // Fresh activation or expired renewal: start from now
      newStartDate = new Date();
    }

    // Update subscription status to active
    subscription.status = "active";
    // Keep original startDate for early renewals, set new one for fresh activations
    if (!wasActive) {
      subscription.startDate = newStartDate;
    }

    // Calculate new end date
    const endDate = new Date(newStartDate);
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

    // Initialize usage counters only for fresh activations (not renewals)
    if (!wasActive) {
      subscription.usage = {
        hotels: 0,
        branches: 0,
        managers: 0,
        staff: 0,
        tables: 0,
        ordersThisMonth: 0,
        storageUsedGB: 0,
      };
    }

    await subscription.save();

    // Update admin's subscription reference
    await Admin.findByIdAndUpdate(subscription.admin._id, {
      subscription: subscription._id,
    });

    // Send activation email
    try {
      await sendEmail({
        to: subscription.admin.email,
        subject: "Subscription Activated Successfully",
        template: "subscription-activated",
        data: {
          name: subscription.admin.name,
          planName: subscription.plan.name,
          billingCycle: subscription.billingCycle,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          amount: amount / 100,
          maxHotels: subscription.plan.features?.maxHotels || 0,
          maxBranches: subscription.plan.features?.maxBranches || 0,
          maxManagers: subscription.plan.features?.maxManagers || 0,
          maxStaff: subscription.plan.features?.maxStaff || 0,
          maxTables: subscription.plan.features?.maxTables || 0,
        },
      });
    } catch (emailError) {
      console.error("Failed to send activation email:", emailError);
    }

    // Generate and send subscription invoice
    try {
      const lastPayment =
        subscription.paymentHistory[subscription.paymentHistory.length - 1];
      const invoice = await invoiceService.generateSubscriptionInvoice(
        subscription,
        lastPayment
      );

      try {
        await invoiceService.sendInvoiceEmail(
          invoice,
          subscription.admin.email,
          subscription.admin.name,
          "invoice"
        );
        console.log("Subscription invoice email sent:", subscriptionId);
      } catch (emailError) {
        console.error(
          "Failed to send subscription invoice email, adding to queue:",
          emailError.message
        );
        await EmailQueue.create({
          type: "subscription_invoice",
          subscriptionId: subscription._id,
          recipientEmail: subscription.admin.email,
          recipientName: subscription.admin.name,
          status: "pending",
          emailData: {
            subject: `Subscription Invoice ${invoice.invoiceNumber} - TableTop`,
            invoiceNumber: invoice.invoiceNumber,
            amount: lastPayment.amount,
          },
          scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
        });
      }
    } catch (invoiceError) {
      console.error(
        "Failed to generate subscription invoice:",
        invoiceError.message
      );
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
    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("admin");

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
      await sendEmail({
        to: subscription.admin.email,
        subject: "Subscription Payment Failed",
        template: "payment-failed",
        data: {
          name: subscription.admin.name,
          amount: (payload.amount || 0) / 100,
          transactionId: payload.order_id || "N/A",
          reason: error_description || "Payment processing failed",
          retryLink: `${process.env.FRONTEND_URL || "http://localhost:5173"}/subscription/retry/${subscriptionId}`,
        },
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
    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("admin plan");

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
      await sendEmail({
        to: subscription.admin.email,
        subject: "Subscription Refunded & Cancelled",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #f44336;">Subscription Cancelled</h2>
            <p>Hello ${subscription.admin.name},</p>
            <p>Your subscription to <strong>${subscription.plan?.name || "Your plan"}</strong> has been cancelled and a refund of <strong>₹${amount / 100}</strong> has been processed.</p>
            <p><strong>Refund Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p>The refund will be credited to your original payment method within 5-7 business days.</p>
            <p>Best regards,<br><strong>Hotel Management Team</strong></p>
          </div>
        `,
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
export const verifySubscriptionPayment = asyncHandler(
  async (req, res, next) => {
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
    const paymentDetails =
      await paymentService.fetchPaymentDetails(razorpay_payment_id);

    // Find subscription
    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("plan");
    if (!subscription) {
      return next(new APIError(404, "Subscription not found"));
    }

    // Activate subscription (reuse webhook handler logic)
    // paymentDetails.amount from Razorpay API is already in paise
    await handleSuccessfulPayment({
      id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: paymentDetails.amount, // Already in paise from Razorpay
      method: paymentDetails.method,
      notes: {
        type: "subscription",
        subscriptionId: subscriptionId,
        planName: subscription.plan?.name || "Subscription",
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
  }
);
