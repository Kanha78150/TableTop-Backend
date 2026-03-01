import { paymentService } from "../../services/payment/payment.service.js";
import { invoiceService } from "../../services/invoice.service.js";
import { paymentLogger } from "../../utils/paymentLogger.js";
import { logger } from "../../utils/logger.js";
import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { Order } from "../../models/Order.model.js";
import { EmailQueue } from "../../models/EmailQueue.model.js";
import { Admin } from "../../models/Admin.model.js";
import { sendEmail } from "../../utils/emailService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import assignmentService from "../../services/assignment/assignment.service.js";

/**
 * Comprehensive Razorpay Webhook Handler
 * Handles all Razorpay webhook events for orders and subscriptions
 * @route POST /api/v1/payment/webhook
 */
export const handleRazorpayWebhook = async (req, res) => {
  const startTime = Date.now();

  try {
    const webhookBody = req.body;
    const webhookSignature = req.headers["x-razorpay-signature"];

    // Log webhook received
    paymentLogger.logWebhookReceived({
      event: webhookBody.event,
      webhookId: webhookBody.account_id,
      entity: webhookBody.payload,
      signatureVerified: false,
      payload: webhookBody,
    });

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(
      webhookBody,
      webhookSignature
    );

    if (!isValid) {
      paymentLogger.logWebhookError({
        event: webhookBody.event,
        error: "Invalid webhook signature",
        errorMessage: "Signature verification failed",
        payload: webhookBody,
      });

      // Return 200 to prevent Razorpay retries for invalid signatures
      return res.status(200).json({ status: "signature_invalid" });
    }

    // Extract event and payload
    const event = webhookBody.event;
    const entity =
      webhookBody.payload?.payment?.entity ||
      webhookBody.payload?.order?.entity;

    logger.info("Processing verified webhook", {
      event,
      entityId: entity?.id,
      orderId: entity?.order_id,
    });

    // Route to appropriate handler based on event type
    let result;
    switch (event) {
      // Payment Events
      case "payment.captured":
        result = await handlePaymentCaptured(entity);
        break;

      case "payment.authorized":
        result = await handlePaymentAuthorized(entity);
        break;

      case "payment.failed":
        result = await handlePaymentFailed(entity);
        break;

      case "payment.pending":
        result = await handlePaymentPending(entity);
        break;

      // Refund Events
      case "refund.created":
        result = await handleRefundCreated(entity);
        break;

      case "refund.processed":
        result = await handleRefundProcessed(entity);
        break;

      case "refund.failed":
        result = await handleRefundFailed(entity);
        break;

      // Order Events
      case "order.paid":
        result = await handleOrderPaid(entity);
        break;

      // Settlement Events
      case "settlement.processed":
        result = await handleSettlementProcessed(entity);
        break;

      // Dispute Events
      case "dispute.created":
        result = await handleDisputeCreated(entity);
        break;

      case "dispute.won":
        result = await handleDisputeWon(entity);
        break;

      case "dispute.lost":
        result = await handleDisputeLost(entity);
        break;

      default:
        logger.warn("Unhandled webhook event", { event });
        result = {
          success: true,
          message: "Event acknowledged but not processed",
        };
    }

    const processingTime = Date.now() - startTime;

    // Log webhook processing
    paymentLogger.logWebhookProcessing({
      event,
      entityId: entity?.id,
      orderId: entity?.order_id,
      action: event,
      result: result.success ? "success" : "failed",
      processingTime,
    });

    // Always return 200 to Razorpay
    res.status(200).json({
      status: "ok",
      event,
      processed: result.success,
      message: result.message,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    paymentLogger.logWebhookError({
      event: req.body.event,
      error: error.name,
      errorMessage: error.message,
      stack: error.stack,
      payload: req.body,
    });

    logger.error("Webhook processing error", {
      error: error.message,
      stack: error.stack,
      processingTime,
    });

    // Still return 200 to prevent Razorpay retries
    res.status(200).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * Handle Payment Captured Event
 * Payment has been successfully captured
 */
async function handlePaymentCaptured(entity) {
  try {
    const { id: paymentId, order_id: orderId, amount, method, notes } = entity;

    paymentLogger.logPaymentSuccess({
      transactionId: paymentId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amount: amount / 100,
      paymentMethod: method,
      metadata: notes,
    });

    // Check if subscription or order payment
    if (notes?.type === "subscription") {
      return await processSubscriptionPayment(entity, "captured");
    } else {
      return await processOrderPayment(entity, "captured");
    }
  } catch (error) {
    logger.error("Error handling payment.captured", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Payment Authorized Event
 * Payment has been authorized but not captured yet
 */
async function handlePaymentAuthorized(entity) {
  try {
    const { id: paymentId, order_id: orderId, amount, notes } = entity;

    paymentLogger.logPaymentSuccess({
      transactionId: paymentId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amount: amount / 100,
      metadata: notes,
    });

    // For auto-capture, treat as captured
    if (notes?.type === "subscription") {
      return await processSubscriptionPayment(entity, "authorized");
    } else {
      return await processOrderPayment(entity, "authorized");
    }
  } catch (error) {
    logger.error("Error handling payment.authorized", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Payment Failed Event
 */
async function handlePaymentFailed(entity) {
  try {
    const {
      id: paymentId,
      order_id: orderId,
      error_description,
      notes,
    } = entity;

    paymentLogger.logPaymentFailure({
      transactionId: paymentId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      reason: error_description,
      metadata: notes,
    });

    if (notes?.type === "subscription") {
      // Handle subscription payment failure
      const subscriptionId = notes.subscriptionId;
      const subscription =
        await AdminSubscription.findById(subscriptionId).populate("admin plan");

      if (subscription) {
        subscription.paymentHistory.push({
          amount: 0,
          currency: "INR",
          transactionId: paymentId,
          date: new Date(),
          status: "failed",
          notes: `Payment failed: ${error_description || "Unknown error"}`,
        });

        await subscription.save();

        // Send failure notification
        try {
          await sendEmail({
            to: subscription.admin.email,
            subject: "Subscription Payment Failed",
            html: `<p>Your subscription payment has failed. Reason: ${error_description}</p>`,
          });
        } catch (emailError) {
          logger.error("Failed to send payment failure email", {
            error: emailError.message,
          });
        }
      }
    } else {
      // Handle order payment failure
      const order = await Order.findOne({
        $or: [
          { "payment.gatewayOrderId": orderId },
          { "payment.razorpayOrderId": orderId },
        ],
      });

      if (order) {
        order.payment.paymentStatus = "failed";
        order.payment.failureReason = error_description;
        await order.save();

        // Restore cart
        await paymentService.restoreCartAfterPaymentFailure(order._id);
      }
    }

    return { success: true, message: "Payment failure recorded" };
  } catch (error) {
    logger.error("Error handling payment.failed", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Payment Pending Event
 */
async function handlePaymentPending(entity) {
  try {
    const { id: paymentId, order_id: orderId, notes } = entity;

    paymentLogger.logPaymentPending({
      transactionId: paymentId,
      razorpayOrderId: orderId,
      metadata: notes,
    });

    return { success: true, message: "Payment pending status recorded" };
  } catch (error) {
    logger.error("Error handling payment.pending", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Refund Created Event
 */
async function handleRefundCreated(entity) {
  try {
    const { id: refundId, payment_id: paymentId, amount } = entity;

    paymentLogger.logRefundInitiation({
      refundId,
      paymentId,
      refundAmount: amount / 100,
    });

    return { success: true, message: "Refund creation recorded" };
  } catch (error) {
    logger.error("Error handling refund.created", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Refund Processed Event
 */
async function handleRefundProcessed(entity) {
  try {
    const { id: refundId, payment_id: paymentId, amount } = entity;

    paymentLogger.logRefundSuccess({
      refundId,
      paymentId,
      refundAmount: amount / 100,
      refundStatus: "processed",
    });

    // Update order or subscription status
    const order = await Order.findOne({
      "payment.razorpayPaymentId": paymentId,
    })
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address");

    if (order) {
      order.payment.paymentStatus = "refunded";
      order.payment.refund = {
        refundId,
        amount: amount / 100,
        completedAt: new Date(),
      };
      await order.save();

      // Generate and send credit note
      try {
        // Find the refund request by razorpay refund ID
        const { RefundRequest } =
          await import("../../models/RefundRequest.model.js");
        const refundRequest = await RefundRequest.findOne({
          refundTransactionId: refundId,
          order: order._id,
        });

        if (refundRequest) {
          // Generate credit note
          const creditNote = await invoiceService.generateCreditNote(
            order,
            refundRequest
          );

          // Add credit note to order
          order.creditNotes.push({
            creditNoteNumber: creditNote.creditNoteNumber,
            refundRequestId: refundRequest._id,
            amount: refundRequest.amount,
            reason: refundRequest.reason,
            generatedAt: new Date(),
          });

          await order.save();

          // Try to send credit note email
          if (order.user?.email) {
            try {
              await invoiceService.sendInvoiceEmail(
                creditNote,
                order.user.email,
                order.user.name,
                "credit_note"
              );
              logger.info("Credit note email sent successfully", {
                orderId: order._id,
                creditNoteNumber: creditNote.creditNoteNumber,
              });
            } catch (emailError) {
              // Email failed - add to queue
              logger.warn("Failed to send credit note email, adding to queue", {
                orderId: order._id,
                error: emailError.message,
              });

              await EmailQueue.create({
                type: "credit_note",
                orderId: order._id,
                recipientEmail: order.user.email,
                recipientName: order.user.name,
                status: "pending",
                emailData: {
                  subject: `Credit Note ${creditNote.creditNoteNumber} - TableTop`,
                  creditNoteNumber: creditNote.creditNoteNumber,
                  amount: refundRequest.amount,
                },
                scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
              });
            }
          }

          logger.info("Credit note generated successfully", {
            orderId: order._id,
            creditNoteNumber: creditNote.creditNoteNumber,
            refundAmount: refundRequest.amount,
          });
        } else {
          logger.warn("Refund request not found for credit note generation", {
            orderId: order._id,
            refundId,
          });
        }
      } catch (creditNoteError) {
        logger.error("Failed to generate/send credit note", {
          orderId: order._id,
          error: creditNoteError.message,
          stack: creditNoteError.stack,
        });
        // Don't fail the refund processing if credit note fails
      }
    }

    return { success: true, message: "Refund processed successfully" };
  } catch (error) {
    logger.error("Error handling refund.processed", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Refund Failed Event
 */
async function handleRefundFailed(entity) {
  try {
    const { id: refundId, payment_id: paymentId, amount } = entity;

    paymentLogger.logRefundFailure({
      refundId,
      paymentId,
      refundAmount: amount / 100,
      reason: "Refund processing failed",
    });

    return { success: true, message: "Refund failure recorded" };
  } catch (error) {
    logger.error("Error handling refund.failed", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Order Paid Event
 */
async function handleOrderPaid(entity) {
  try {
    const { id: orderId, amount } = entity;

    logger.info("Order paid event received", { orderId, amount: amount / 100 });

    return { success: true, message: "Order paid event processed" };
  } catch (error) {
    logger.error("Error handling order.paid", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Settlement Processed Event
 */
async function handleSettlementProcessed(entity) {
  try {
    const { id: settlementId, amount, utr, fees, tax } = entity;

    paymentLogger.logSettlement({
      settlementId,
      amount: amount / 100,
      utr,
      fees: fees / 100,
      tax: tax / 100,
      netAmount: (amount - fees - tax) / 100,
      settledAt: new Date(),
    });

    return { success: true, message: "Settlement processed" };
  } catch (error) {
    logger.error("Error handling settlement.processed", {
      error: error.message,
    });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Dispute Created Event
 */
async function handleDisputeCreated(entity) {
  try {
    const {
      id: disputeId,
      payment_id: paymentId,
      amount,
      reason_description,
    } = entity;

    logger.warn("Dispute created", {
      disputeId,
      paymentId,
      amount: amount / 100,
      reason: reason_description,
    });

    // Notify super admin
    // TODO: Implement dispute notification

    return { success: true, message: "Dispute recorded" };
  } catch (error) {
    logger.error("Error handling dispute.created", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Dispute Won Event
 */
async function handleDisputeWon(entity) {
  try {
    const { id: disputeId } = entity;

    logger.info("Dispute won", { disputeId });

    return { success: true, message: "Dispute won recorded" };
  } catch (error) {
    logger.error("Error handling dispute.won", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Handle Dispute Lost Event
 */
async function handleDisputeLost(entity) {
  try {
    const { id: disputeId, payment_id: paymentId, amount } = entity;

    logger.warn("Dispute lost", {
      disputeId,
      paymentId,
      amount: amount / 100,
    });

    // Update order/subscription status as needed

    return { success: true, message: "Dispute lost recorded" };
  } catch (error) {
    logger.error("Error handling dispute.lost", { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * Process Subscription Payment
 */
async function processSubscriptionPayment(entity, status) {
  try {
    const { id: paymentId, order_id: orderId, amount, method, notes } = entity;
    const subscriptionId = notes.subscriptionId;

    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("plan admin");

    if (!subscription) {
      logger.error("Subscription not found", { subscriptionId });
      return { success: false, message: "Subscription not found" };
    }

    // Activate subscription
    if (subscription.status !== "active") {
      subscription.status = "active";
      subscription.startDate = new Date();

      const endDate = new Date(subscription.startDate);
      if (subscription.billingCycle === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      subscription.endDate = endDate;

      // Initialize usage
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

    // Add payment to history
    subscription.paymentHistory.push({
      amount: amount / 100,
      currency: "INR",
      method: method || "online",
      transactionId: paymentId,
      razorpayPaymentId: paymentId,
      date: new Date(),
      status: "success",
      notes: `Payment ${status} - ${notes.planName || "Subscription"}`,
    });

    await subscription.save();

    // Update admin reference
    await Admin.findByIdAndUpdate(subscription.admin._id, {
      subscription: subscription._id,
    });

    // Generate and send invoice
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
        logger.info("Subscription invoice email sent successfully", {
          subscriptionId: subscription._id,
          invoiceNumber: invoice.invoiceNumber,
        });
      } catch (emailError) {
        // Email failed - add to queue
        logger.warn(
          "Failed to send subscription invoice email, adding to queue",
          {
            subscriptionId: subscription._id,
            error: emailError.message,
          }
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
          scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
        });
      }
    } catch (invoiceError) {
      logger.error("Failed to generate/send invoice", {
        error: invoiceError.message,
      });
    }

    // Send activation email
    try {
      await sendEmail({
        to: subscription.admin.email,
        subject: "Subscription Activated Successfully",
        html: `<p>Your subscription to ${subscription.plan.name} has been activated successfully!</p>`,
      });
    } catch (emailError) {
      logger.error("Failed to send activation email", {
        error: emailError.message,
      });
    }

    logger.info("Subscription payment processed successfully", {
      subscriptionId,
    });

    return { success: true, message: "Subscription activated" };
  } catch (error) {
    logger.error("Error processing subscription payment", {
      error: error.message,
    });
    return { success: false, message: error.message };
  }
}

/**
 * Process Order Payment
 */
async function processOrderPayment(entity, status) {
  try {
    const { id: paymentId, order_id: orderId, amount, method } = entity;

    const order = await Order.findOne({
      $or: [
        { "payment.gatewayOrderId": orderId },
        { "payment.razorpayOrderId": orderId },
      ],
    }).populate("user");

    if (!order) {
      logger.error("Order not found", { orderId });
      return { success: false, message: "Order not found" };
    }

    // Idempotency guard: skip if payment already processed
    if (order.payment.paymentStatus === "paid") {
      logger.info("Order payment already processed, skipping webhook", {
        orderId: order._id,
      });
      return { success: true, message: "Payment already processed" };
    }

    // Update order status
    order.payment.paymentStatus = "paid";
    order.payment.razorpayPaymentId = paymentId;
    order.payment.paymentId = paymentId; // Also set generic paymentId for dynamic payment system
    order.payment.paymentMethod = order.payment.provider || "razorpay"; // Use provider, not raw Razorpay method
    order.payment.paidAt = new Date();
    // Order stays "pending" — staff will confirm it manually

    await order.save();

    // Trigger staff assignment
    if (!order.staff) {
      try {
        const assignmentResult = await assignmentService.assignOrder(order);
        if (assignmentResult.success && assignmentResult.waiter) {
          logger.info("Staff assigned via webhook", {
            orderId: order._id,
            staffId: assignmentResult.waiter.id,
            staffName: assignmentResult.waiter.name,
          });
        } else {
          logger.warn("Staff assignment queued via webhook", {
            orderId: order._id,
            reason: assignmentResult.message || "No available staff",
          });
        }
      } catch (assignmentError) {
        logger.error("Staff assignment error in webhook", {
          orderId: order._id,
          error: assignmentError.message,
        });
        // Don't fail webhook processing if assignment fails
      }
    }

    // Create transaction record for accounting
    try {
      await paymentService.createTransactionRecord(order);
    } catch (txError) {
      logger.error("Failed to create transaction record in webhook", {
        orderId: order._id,
        error: txError.message,
      });
    }

    // Clear cart and process coins
    try {
      await paymentService.clearCartAfterPayment(order);
    } catch (cartError) {
      logger.error("Failed to clear cart", { error: cartError.message });
    }

    // Generate and send invoice
    logger.info("Starting invoice generation process", {
      orderId: order._id,
      userId: order.user,
      hotelId: order.hotel,
      branchId: order.branch,
    });

    try {
      // Populate order for invoice generation
      logger.debug("Populating order for invoice", { orderId: order._id });
      const populatedOrder = await Order.findById(order._id)
        .populate("user", "name email phone")
        .populate("hotel", "name email contactNumber gstin")
        .populate("branch", "name email contactNumber address")
        .populate("items.foodItem", "name price");

      if (!populatedOrder) {
        throw new Error("Order not found for invoice generation");
      }

      logger.debug("Order populated successfully", {
        orderId: populatedOrder._id,
        hasUser: !!populatedOrder.user,
        hasHotel: !!populatedOrder.hotel,
        hasBranch: !!populatedOrder.branch,
        userEmail: populatedOrder.user?.email,
      });

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}-${order._id
        .toString()
        .slice(-8)
        .toUpperCase()}`;

      logger.info("Generated invoice number", {
        invoiceNumber,
        orderId: order._id,
      });

      // Create invoice snapshot
      populatedOrder.invoiceNumber = invoiceNumber;
      populatedOrder.invoiceGeneratedAt = new Date();
      populatedOrder.invoiceSnapshot = {
        hotelName: populatedOrder.hotel?.name || "Hotel Name",
        hotelEmail: populatedOrder.hotel?.email || "",
        hotelPhone: populatedOrder.hotel?.contactNumber || "",
        hotelGSTIN: populatedOrder.hotel?.gstin || "",
        branchName: populatedOrder.branch?.name || "Branch Name",
        branchAddress: populatedOrder.branch?.address || "",
        branchPhone: populatedOrder.branch?.contactNumber || "",
        branchEmail: populatedOrder.branch?.email || "",
        customerName: populatedOrder.user?.name || "Guest",
        customerEmail: populatedOrder.user?.email || "",
        customerPhone: populatedOrder.user?.phone || "",
        tableNumber: populatedOrder.tableNumber || "",
      };

      logger.debug("Invoice snapshot created", {
        invoiceNumber,
        hasHotel: !!populatedOrder.hotel,
        hasBranch: !!populatedOrder.branch,
        hasUser: !!populatedOrder.user,
      });

      // Generate invoice PDF
      logger.debug("Generating invoice PDF", {
        invoiceNumber,
        orderId: populatedOrder._id,
      });
      const invoice = await invoiceService.generateOrderInvoice(
        populatedOrder,
        { showCancelledStamp: false }
      );
      logger.info("Invoice PDF generated successfully", {
        invoiceNumber,
        fileName: invoice.fileName,
        bufferSize: invoice.buffer?.length,
      });

      // Try to send email
      if (populatedOrder.user?.email) {
        logger.info("Attempting to send invoice email", {
          recipientEmail: populatedOrder.user.email,
          recipientName: populatedOrder.user.name,
          invoiceNumber,
        });

        try {
          await invoiceService.sendInvoiceEmail(
            invoice,
            populatedOrder.user.email,
            populatedOrder.user.name,
            "invoice"
          );
          populatedOrder.invoiceEmailStatus = "sent";
          logger.info("✅ Invoice email sent successfully", {
            orderId: order._id,
            invoiceNumber: invoiceNumber,
            recipientEmail: populatedOrder.user.email,
          });
        } catch (emailError) {
          // Email failed - add to queue
          logger.error("❌ Failed to send invoice email, adding to queue", {
            orderId: order._id,
            error: emailError.message,
            stack: emailError.stack,
            recipientEmail: populatedOrder.user.email,
          });

          try {
            await EmailQueue.create({
              type: "invoice",
              orderId: populatedOrder._id,
              recipientEmail: populatedOrder.user.email,
              recipientName: populatedOrder.user.name,
              status: "pending",
              emailData: {
                subject: `Invoice ${invoiceNumber} - TableTop`,
                invoiceNumber: invoiceNumber,
                amount: populatedOrder.totalPrice,
              },
              scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
            });
            logger.info("Email queued for retry", {
              orderId: populatedOrder._id,
              recipientEmail: populatedOrder.user.email,
            });
          } catch (queueError) {
            logger.error("Failed to queue email for retry", {
              error: queueError.message,
              orderId: populatedOrder._id,
            });
          }

          populatedOrder.invoiceEmailStatus = "failed";
          populatedOrder.invoiceEmailAttempts = 1;
        }
      } else {
        logger.warn("No user email available, skipping invoice email", {
          orderId: populatedOrder._id,
          hasUser: !!populatedOrder.user,
        });
        populatedOrder.invoiceEmailStatus = "no_email";
      }

      // Save order with invoice data
      await populatedOrder.save();

      logger.info("✅ Invoice generated and saved successfully", {
        orderId: order._id,
        invoiceNumber: invoiceNumber,
        invoiceEmailStatus: populatedOrder.invoiceEmailStatus,
      });
    } catch (invoiceError) {
      logger.error("❌ CRITICAL: Failed to generate/send invoice", {
        orderId: order._id,
        error: invoiceError.message,
        stack: invoiceError.stack,
        errorName: invoiceError.name,
      });

      // Try to mark order with invoice error status
      try {
        const orderToUpdate = await Order.findById(order._id);
        if (orderToUpdate) {
          orderToUpdate.invoiceEmailStatus = "generation_failed";
          orderToUpdate.invoiceGenerationError = invoiceError.message;
          await orderToUpdate.save();
          logger.info("Order marked with invoice generation failure", {
            orderId: order._id,
          });
        }
      } catch (updateError) {
        logger.error("Failed to update order with invoice error status", {
          error: updateError.message,
        });
      }
      // Don't fail the payment if invoice fails
    }

    logger.info("Order payment processed successfully", { orderId: order._id });

    return { success: true, message: "Order payment processed" };
  } catch (error) {
    logger.error("Error processing order payment", { error: error.message });
    return { success: false, message: error.message };
  }
}

export default {
  handleRazorpayWebhook,
};
