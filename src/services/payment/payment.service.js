import { razorpayConfig } from "../../config/payment.js";
import crypto from "crypto";
import axios from "axios";
import Razorpay from "razorpay";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";

import { Order } from "../../models/Order.model.js";
import { Cart } from "../../models/Cart.model.js";
import { User } from "../../models/User.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { Transaction } from "../../models/Transaction.model.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { generateTransactionId } from "../../utils/idGenerator.js";
import assignmentService from "../assignment/assignment.service.js";

// Delegated modules
import {
  getAllPayments as _getAllPayments,
  getPaymentAnalytics as _getPaymentAnalytics,
} from "./analytics.service.js";
import {
  clearCartAfterPayment as _clearCartAfterPayment,
  restoreCartAfterPaymentFailure as _restoreCartAfterPaymentFailure,
  createTransactionRecord as _createTransactionRecord,
} from "./postProcess.service.js";

class PaymentService {
  constructor() {
    this.config = razorpayConfig;
    this.razorpay = new Razorpay({
      key_id: this.config.keyId,
      key_secret: this.config.keySecret,
    });
  }

  async initiatePayment(orderId, paymentData) {
    try {
      logger.info("Initiating Razorpay payment", { orderId });

      // Get order details from database
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      // Generate unique transaction ID
      const transactionId = generateTransactionId();

      // Convert amount to paise (Razorpay expects amount in smallest currency unit)
      const amountInPaise = Math.round(order.totalPrice * 100);

      // Create Razorpay order
      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `order_${orderId}`,
        notes: {
          orderId: orderId,
          transactionId: transactionId,
          userId: order.user.toString(),
          hotelId: order.hotel.toString(),
        },
      });

      // Update order with Razorpay order ID and transaction ID
      await Order.findByIdAndUpdate(orderId, {
        "payment.transactionId": transactionId,
        "payment.razorpayOrderId": razorpayOrder.id,
        "payment.gatewayTransactionId": razorpayOrder.id,
        "payment.paymentStatus": "pending",
      });

      logger.info("Razorpay order created successfully", {
        orderId,
        razorpayOrderId: razorpayOrder.id,
      });

      return {
        transactionId: transactionId,
        orderId: orderId,
        order_id: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key: this.config.keyId,
        name: "Hotel Management System",
        description: `Payment for Order #${orderId}`,
        callback_url: this.config.callbackUrl,
        prefill: {
          name: paymentData.customerName || "",
          email: paymentData.customerEmail || "",
          contact: paymentData.customerPhone || "",
        },
        theme: {
          color: "#3399cc",
        },
      };
    } catch (error) {
      logger.error("Payment initiation failed", {
        orderId,
        error: error.message,
        stack: error.stack,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment initiation failed");
    }
  }

  async checkPaymentStatus(identifier) {
    try {
      logger.info("Checking payment status", { identifier });

      let order;
      let payment;

      // Check if identifier is a transaction ID (our format) or Razorpay payment ID
      if (identifier.startsWith("TXN-")) {
        // Find order by our transaction ID
        order = await Order.findOne({
          "payment.transactionId": identifier,
        });

        if (!order) {
          throw new APIError(404, "Transaction not found");
        }

        // If we have a Razorpay payment ID, fetch payment details
        if (order.payment.razorpayPaymentId) {
          payment = await this.razorpay.payments.fetch(
            order.payment.razorpayPaymentId
          );
        }
      } else {
        // Assume it's a Razorpay payment ID
        payment = await this.razorpay.payments.fetch(identifier);

        // Find order by Razorpay order ID
        order = await Order.findOne({
          "payment.razorpayOrderId": payment.order_id,
        });
      }
      if (!order) {
        throw new APIError(404, "Order not found for this payment");
      }

      // Map Razorpay status to our system status (if payment exists)
      let paymentStatus = order.payment.paymentStatus || "pending";

      if (payment) {
        switch (payment.status) {
          case "captured":
          case "authorized":
            paymentStatus = "paid";
            break;
          case "failed":
            paymentStatus = "failed";
            break;
          case "refunded":
            paymentStatus = "refunded";
            break;
          default:
            paymentStatus = "pending";
        }
      }

      // Check if staff assignment is needed (regardless of payment fetch)
      const needsStatusUpdate =
        paymentStatus === "paid" && order.payment.paymentStatus !== "paid";
      const needsStaffAssignment = !order.staff && paymentStatus === "paid";

      // ?? BACKUP NOTIFICATION: Check if order was recently assigned but notification might have been missed
      // This handles race conditions where webhook assigns staff but notification fails
      const wasRecentlyAssigned =
        order.staff &&
        order.assignedAt &&
        Date.now() - new Date(order.assignedAt).getTime() < 60000; // Within last 60 seconds
      const needsNotification =
        wasRecentlyAssigned &&
        !order.notificationSentAt &&
        paymentStatus === "paid";

      console.log(`\n?? ========== PAYMENT STATUS CHECK ==========`);
      console.log(`?? Order: ${order._id}`);
      console.log(`?? Current Payment Status: ${order.payment.paymentStatus}`);
      console.log(`?? Razorpay Payment Status: ${paymentStatus}`);
      console.log(`?? Current Staff: ${order.staff || "None"}`);
      console.log(`?? Needs Status Update: ${needsStatusUpdate}`);
      console.log(`?? Needs Staff Assignment: ${needsStaffAssignment}`);
      console.log(`?? Needs Notification: ${needsNotification}`);
      console.log(`?? ============================================\n`);

      // Check if failed status needs to be updated
      const needsFailedUpdate =
        paymentStatus === "failed" && order.payment.paymentStatus !== "failed";

      if (payment && needsStatusUpdate) {
        console.log(`\n?? ========== PAYMENT STATUS CHANGED ==========`);
        console.log(`?? Order: ${order._id}`);
        console.log(`?? Status: ${order.payment.paymentStatus} ? paid`);
        console.log(`?? =============================================\n`);

        const updateData = {
          "payment.paymentStatus": "paid",
          "payment.razorpayPaymentId": payment.id,
          "payment.paidAt": new Date(),
        };

        // Order stays "pending" � staff will confirm it manually
        // Payment status is tracked separately in order.payment.paymentStatus

        // Use {new: true} to get updated order in one query (eliminates redundant fetch)
        const updatedOrder = await Order.findByIdAndUpdate(
          order._id,
          updateData,
          {
            new: true,
          }
        );

        // Create transaction record for successful payment
        try {
          await this.createTransactionRecord(updatedOrder);
        } catch (txError) {
          logger.error("Failed to create transaction record", {
            orderId: order._id,
            error: txError.message,
          });
        }

        // Update order reference for assignment check below
        order = updatedOrder;
      } else if (payment && needsFailedUpdate) {
        console.log(`\n?? ========== PAYMENT FAILED ==========`);
        console.log(`?? Order: ${order._id}`);
        console.log(`?? Status: ${order.payment.paymentStatus} ? failed`);
        console.log(`?? ======================================\n`);

        const updateData = {
          "payment.paymentStatus": "failed",
          "payment.failureReason":
            payment.error_description || "Payment failed at gateway",
        };

        const updatedOrder = await Order.findByIdAndUpdate(
          order._id,
          updateData,
          { new: true }
        );

        // Create transaction record for failed payment
        try {
          await this.createTransactionRecord(updatedOrder);
        } catch (txError) {
          logger.error(
            "Failed to create transaction record for failed payment",
            {
              orderId: order._id,
              error: txError.message,
            }
          );
        }

        // Restore cart so user can try again
        try {
          await this.restoreCartAfterPaymentFailure(order._id);
        } catch (cartError) {
          logger.error("Cart restore error after failed payment", {
            orderId: order._id,
            error: cartError.message,
          });
        }

        order = updatedOrder;
      }

      // ?? TRIGGER STAFF ASSIGNMENT IF PAYMENT IS PAID AND NO STAFF ASSIGNED
      // Re-fetch from DB to get the latest staff value (prevents race with verifyPayment)
      if (needsStaffAssignment) {
        const freshOrder = await Order.findById(order._id).lean();
        if (freshOrder && freshOrder.staff) {
          logger.info("Staff already assigned by another path, skipping", {
            orderId: order._id,
            staffId: freshOrder.staff,
          });
        } else if (freshOrder) {
          try {
            console.log(
              `\n?? ========== TRIGGERING STAFF ASSIGNMENT ==========`
            );
            console.log(`?? Order: ${order._id}`);
            console.log(`?? Payment Status: ${paymentStatus}`);
            console.log(`?? Current Staff: ${order.staff || "None"}`);
            console.log(
              `?? ===================================================\n`
            );

            logger.info(
              "Triggering staff assignment after payment status check",
              {
                orderId: order._id,
                paymentStatus: paymentStatus,
                statusChanged: needsStatusUpdate,
              }
            );

            // Pass order object to avoid re-fetching from DB
            const assignmentResult = await assignmentService.assignOrder(order);

            if (assignmentResult.success && assignmentResult.waiter) {
              console.log(`\n? ========== ASSIGNMENT SUCCESS ==========`);
              console.log(
                `?? Staff: ${assignmentResult.waiter.name} (${assignmentResult.waiter.id})`
              );
              console.log(`?? Method: ${assignmentResult.assignmentMethod}`);
              console.log(`? ==========================================\n`);

              logger.info(
                "Staff assignment successful after payment status check",
                {
                  orderId: order._id,
                  waiterId: assignmentResult.waiter.id,
                  waiterName: assignmentResult.waiter.name,
                  method: assignmentResult.assignmentMethod,
                }
              );
            } else {
              console.log(
                `\n?? ========== ASSIGNMENT QUEUED/FAILED ==========`
              );
              console.log(
                `?? Reason: ${assignmentResult.message || "No available staff"}`
              );
              console.log(
                `?? ================================================\n`
              );

              logger.warn(
                "Staff assignment failed after payment status check",
                {
                  orderId: order._id,
                  reason: assignmentResult.message || "No available staff",
                }
              );
            }
          } catch (assignmentError) {
            console.error(`\n? ========== ASSIGNMENT ERROR ==========`);
            console.error(`?? Error: ${assignmentError.message}`);
            console.error(`?? Order: ${order._id}`);
            console.error(`? =========================================\n`);

            // Log assignment error but don't fail the payment status check
            logger.error("Staff assignment error after payment status check", {
              orderId: order._id,
              error: assignmentError.message,
              stack: assignmentError.stack,
            });
          }
        }
      }

      // ? BACKUP NOTIFICATION: Send notification if staff was recently assigned but notification missed
      // This handles race conditions where webhook/callback assigned staff but notification failed
      if (needsNotification) {
        try {
          console.log(`\n?? ========== SENDING BACKUP NOTIFICATION ==========`);
          console.log(`?? Order: ${order._id}`);
          console.log(`?? Staff: ${order.staff}`);
          console.log(`? Assigned At:`, order.assignedAt);
          console.log(
            `?? ==================================================\n`
          );

          // Populate order for notification
          const populatedOrder = await Order.findById(order._id)
            .populate("staff", "name staffId email manager")
            .populate("items.foodItem", "name preparationTime");

          if (populatedOrder && populatedOrder.staff) {
            const { notifyStaffOrderAssigned, notifyManagerOrderAssigned } =
              await import("./notification.service.js");

            // Send staff notification
            await notifyStaffOrderAssigned(
              populatedOrder,
              populatedOrder.staff,
              populatedOrder.assignmentMethod || "automatic"
            );

            // Send manager notification if manager exists
            if (populatedOrder.staff.manager) {
              await notifyManagerOrderAssigned(
                populatedOrder,
                populatedOrder.staff.manager,
                {
                  staff: populatedOrder.staff,
                  assignmentMethod:
                    populatedOrder.assignmentMethod || "automatic",
                  isManualAssignment: false,
                }
              );
            }

            console.log(`\n? ========== BACKUP NOTIFICATION SENT ==========`);
            console.log(`?? Staff: ${populatedOrder.staff.name}`);
            console.log(`? ===============================================\n`);

            logger.info(
              "Backup notification sent for recently assigned order",
              {
                orderId: order._id,
                staffId: populatedOrder.staff._id,
                staffName: populatedOrder.staff.name,
              }
            );
          }
        } catch (notificationError) {
          console.error(`\n? ========== BACKUP NOTIFICATION ERROR ==========`);
          console.error(`?? Error: ${notificationError.message}`);
          console.error(
            `? =================================================\n`
          );

          logger.error("Backup notification failed", {
            orderId: order._id,
            error: notificationError.message,
            stack: notificationError.stack,
          });
          // Don't fail the payment status check on notification error
        }
      }

      // ??? CLEAR CART AFTER PAYMENT (only if status was updated)
      if (needsStatusUpdate && payment) {
        try {
          await this.clearCartAfterPayment(order);
        } catch (cartError) {
          // Log cart clearing error but don't fail the payment status check
          logger.error("Cart clearing error after payment status check", {
            orderId: order._id,
            error: cartError.message,
            stack: cartError.stack,
          });
        }
      }

      logger.info("Payment status checked successfully", {
        identifier,
        transactionId: order.payment.transactionId,
        status: paymentStatus,
      });

      return {
        transactionId: order.payment.transactionId,
        orderId: order._id,
        razorpayOrderId: order.payment.razorpayOrderId,
        razorpayPaymentId:
          order.payment.razorpayPaymentId || (payment ? payment.id : null),
        status: paymentStatus,
        amount: payment ? payment.amount / 100 : order.totalPrice, // Convert back to rupees
        currency: payment ? payment.currency : "INR",
        method: payment ? payment.method : order.payment.paymentMethod,
        createdAt: payment
          ? new Date(payment.created_at * 1000)
          : order.createdAt,
      };
    } catch (error) {
      logger.error("Payment status check failed", {
        identifier,
        error: error.message,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment status check failed");
    }
  }

  async handlePaymentCallback(callbackData) {
    try {
      logger.info("Processing Razorpay payment callback", {
        callbackData,
        dataType: typeof callbackData,
        hasData: !!callbackData,
        keys: callbackData ? Object.keys(callbackData) : [],
      });

      // Validate callback data exists
      if (!callbackData || typeof callbackData !== "object") {
        logger.error("Invalid callback data received", {
          callbackData,
          type: typeof callbackData,
        });
        throw new APIError(400, "No callback data received");
      }

      // Check if this is a standard Razorpay callback or custom callback
      const isRazorpayCallback =
        callbackData.razorpay_payment_id && callbackData.razorpay_order_id;
      const isCustomCallback =
        callbackData.orderId && callbackData.transactionId;
      const isSuccessCallback =
        callbackData.orderId &&
        callbackData.transactionId &&
        (callbackData.code === "PAYMENT_SUCCESS" ||
          callbackData.status === "SUCCESS");

      logger.info("Callback type detection", {
        isRazorpayCallback,
        isCustomCallback,
        isSuccessCallback,
        hasPaymentId: !!callbackData.razorpay_payment_id,
        hasOrderId: !!callbackData.razorpay_order_id,
        hasCustomOrderId: !!callbackData.orderId,
        hasTransactionId: !!callbackData.transactionId,
        code: callbackData.code,
        status: callbackData.status,
      });

      if (isRazorpayCallback) {
        return await this.handleStandardRazorpayCallback(callbackData);
      } else if (isSuccessCallback) {
        return await this.handleSuccessCallback(callbackData);
      } else if (isCustomCallback) {
        return await this.handleCustomCallback(callbackData);
      } else {
        logger.error("Unrecognized callback format", {
          callbackData,
          availableKeys: Object.keys(callbackData),
        });
        throw new APIError(
          400,
          "Invalid callback parameters - missing required fields"
        );
      }
    } catch (error) {
      logger.error("Payment callback handling failed", {
        error: error.message,
        callbackData,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment callback handling failed");
    }
  }

  async handleStandardRazorpayCallback(callbackData) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      callbackData;

    // Verify payment signature (skip if already verified via webhook)
    if (razorpay_signature !== "webhook_verified") {
      const isSignatureValid = this.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      if (!isSignatureValid) {
        throw new APIError(400, "Invalid payment signature");
      }
    }

    // Find order by Razorpay order ID
    const order = await Order.findOne({
      "payment.razorpayOrderId": razorpay_order_id,
    });

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    // Get payment details from Razorpay
    const payment = await this.razorpay.payments.fetch(razorpay_payment_id);

    // Update order status
    const updateData = {
      "payment.paymentStatus": "paid",
      "payment.razorpayPaymentId": razorpay_payment_id,
      "payment.paidAt": new Date(),
      "payment.paymentMethod": "razorpay",
    };

    // Order stays "pending" � staff will confirm it manually
    // Payment status is tracked separately in order.payment.paymentStatus

    // Use {new: true} to get updated order in one query (eliminates redundant fetch)
    const updatedOrder = await Order.findByIdAndUpdate(order._id, updateData, {
      new: true,
    });

    logger.info("Standard Razorpay callback processed successfully", {
      orderId: order._id,
      razorpayPaymentId: razorpay_payment_id,
    });

    // Create transaction record for accounting
    try {
      await this.createTransactionRecord(updatedOrder);
    } catch (txError) {
      logger.error("Failed to create transaction record", {
        orderId: order._id,
        error: txError.message,
      });
    }

    // ?? TRIGGER STAFF ASSIGNMENT ONLY IF NO STAFF ASSIGNED YET
    // Re-fetch from DB to get the latest staff value (prevents race with verifyPayment)
    const freshStdOrder = await Order.findById(updatedOrder._id).lean();
    if (freshStdOrder && !freshStdOrder.staff) {
      try {
        console.log(`\n?? ========== TRIGGERING STAFF ASSIGNMENT ==========`);
        console.log(`?? Order: ${updatedOrder._id}`);
        console.log(`?? Payment Status: paid`);
        console.log(`?? ===================================================\n`);

        logger.info("Triggering staff assignment after payment confirmation", {
          orderId: updatedOrder._id,
        });

        // Pass order object to avoid re-fetching from DB
        const assignmentResult =
          await assignmentService.assignOrder(updatedOrder);

        if (assignmentResult.success && assignmentResult.waiter) {
          console.log(`\n? ========== ASSIGNMENT SUCCESS ==========`);
          console.log(
            `?? Staff: ${assignmentResult.waiter.name} (${assignmentResult.waiter.id})`
          );
          console.log(`?? Method: ${assignmentResult.assignmentMethod}`);
          console.log(`? ==========================================\n`);

          logger.info("Staff assignment successful after payment", {
            orderId: updatedOrder._id,
            waiterId: assignmentResult.waiter.id,
            waiterName: assignmentResult.waiter.name,
            method: assignmentResult.assignmentMethod,
          });
        } else {
          console.log(`\n?? ========== ASSIGNMENT QUEUED/FAILED ==========`);
          console.log(
            `?? Reason: ${assignmentResult.message || "No available staff"}`
          );
          console.log(`?? ================================================\n`);

          logger.warn("Staff assignment failed after payment", {
            orderId: updatedOrder._id,
            reason: assignmentResult.message || "No available staff",
            assignmentResult: assignmentResult, // Log full result for debugging
          });
        }
      } catch (assignmentError) {
        console.error(`\n? ========== ASSIGNMENT ERROR ==========`);
        console.error(`?? Error: ${assignmentError.message}`);
        console.error(`?? Order: ${updatedOrder._id}`);
        console.error(`? =========================================\n`);

        // Log assignment error but don't fail the payment confirmation
        logger.error("Staff assignment error after payment confirmation", {
          orderId: updatedOrder._id,
          error: assignmentError.message,
          stack: assignmentError.stack,
        });
        // Payment is still successful even if assignment fails
      }
    } // End of if (!updatedOrder.staff)

    // ?? CLEAR CART AND PROCESS COINS AFTER PAYMENT CONFIRMATION
    try {
      await this.clearCartAfterPayment(order);
    } catch (cartError) {
      // Log cart clearing error but don't fail the payment confirmation
      logger.error("Cart clearing error after payment confirmation", {
        orderId: order._id,
        error: cartError.message,
        stack: cartError.stack,
      });
    }

    // ?? GENERATE AND SEND INVOICE AFTER PAYMENT CONFIRMATION
    try {
      const { invoiceService } = await import("./invoice.service.js");
      const { EmailQueue } = await import("../models/EmailQueue.model.js");

      logger.info("Starting invoice generation in payment callback", {
        orderId: order._id,
      });

      // Populate order for invoice generation
      const populatedOrder = await Order.findById(order._id)
        .populate("user", "name email phone")
        .populate("hotel", "name email contactNumber gstin")
        .populate("branch", "name email contactNumber address")
        .populate("items.foodItem", "name price");

      if (populatedOrder && !populatedOrder.invoiceNumber) {
        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}-${order._id
          .toString()
          .slice(-8)
          .toUpperCase()}`;

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

        // Generate invoice PDF
        const invoice = await invoiceService.generateOrderInvoice(
          populatedOrder,
          { showCancelledStamp: false }
        );

        // Try to send email
        if (populatedOrder.user?.email) {
          try {
            await invoiceService.sendInvoiceEmail(
              invoice,
              populatedOrder.user.email,
              populatedOrder.user.name,
              "invoice"
            );
            populatedOrder.invoiceEmailStatus = "sent";
            logger.info("? Invoice email sent in callback", {
              orderId: order._id,
              invoiceNumber: invoiceNumber,
            });
          } catch (emailError) {
            // Email failed - add to queue
            logger.warn("Failed to send invoice email, adding to queue", {
              orderId: order._id,
              error: emailError.message,
            });

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
              scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
            });

            populatedOrder.invoiceEmailStatus = "failed";
            populatedOrder.invoiceEmailAttempts = 1;
          }
        } else {
          populatedOrder.invoiceEmailStatus = "no_email";
        }

        // Save order with invoice data
        await populatedOrder.save();
        logger.info("? Invoice generated in callback", {
          orderId: order._id,
          invoiceNumber: invoiceNumber,
        });
      }
    } catch (invoiceError) {
      // Log invoice error but don't fail the payment confirmation
      logger.error("Invoice generation error in callback", {
        orderId: order._id,
        error: invoiceError.message,
        stack: invoiceError.stack,
      });
    }

    return {
      transactionId: order.payment.transactionId,
      orderId: order._id,
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      amount: payment.amount / 100,
    };
  }

  async handleSuccessCallback(callbackData) {
    const { orderId, transactionId, code, status } = callbackData;

    logger.info("Processing success callback", {
      orderId,
      transactionId,
      code,
      status,
    });

    // Find order by order ID
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId);
    } else if (transactionId) {
      order = await Order.findOne({
        "payment.transactionId": transactionId,
      });
    }

    if (!order) {
      throw new APIError(404, "Order not found for success callback");
    }

    // Check if payment is already confirmed
    if (order.payment.paymentStatus === "paid") {
      logger.info("Payment already confirmed for order", {
        orderId: order._id,
        currentStatus: order.payment.paymentStatus,
      });

      return {
        transactionId: order.payment.transactionId,
        orderId: order._id,
        status: "success",
        message: "Payment already confirmed",
      };
    }

    // Update order status to paid
    const updateData = {
      "payment.paymentStatus": "paid",
      "payment.paidAt": new Date(),
      "payment.paymentMethod": "razorpay",
    };

    // Order stays "pending" � staff will confirm it manually
    // Payment status is tracked separately in order.payment.paymentStatus

    // Use {new: true} to get updated order in one query (eliminates redundant fetch)
    const updatedOrder = await Order.findByIdAndUpdate(order._id, updateData, {
      new: true,
    });

    logger.info("Success callback processed successfully", {
      orderId: order._id,
      transactionId: order.payment.transactionId,
    });

    // Create transaction record for accounting
    try {
      await this.createTransactionRecord(updatedOrder);
    } catch (txError) {
      logger.error("Failed to create transaction record", {
        orderId: order._id,
        error: txError.message,
      });
    }

    // ?? TRIGGER STAFF ASSIGNMENT ONLY IF NO STAFF ASSIGNED YET
    // Re-fetch from DB to get the latest staff value (prevents race with verifyPayment)
    const freshSuccessOrder = await Order.findById(updatedOrder._id).lean();
    if (freshSuccessOrder && !freshSuccessOrder.staff) {
      try {
        logger.info("Triggering staff assignment after success callback", {
          orderId: updatedOrder._id,
        });

        // Pass order object to avoid re-fetching from DB
        const assignmentResult =
          await assignmentService.assignOrder(updatedOrder);

        if (assignmentResult.success && assignmentResult.waiter) {
          logger.info("Staff assignment successful after success callback", {
            orderId: updatedOrder._id,
            waiterId: assignmentResult.waiter.id,
            waiterName: assignmentResult.waiter.name,
            method: assignmentResult.assignmentMethod,
          });
        } else {
          logger.warn("Staff assignment failed after success callback", {
            orderId: updatedOrder._id,
            reason: assignmentResult.message || "No available staff",
            assignmentResult: assignmentResult, // Log full result for debugging
          });
        }
      } catch (assignmentError) {
        // Log assignment error but don't fail the payment confirmation
        logger.error("Staff assignment error after success callback", {
          orderId: updatedOrder._id,
          error: assignmentError.message,
          stack: assignmentError.stack,
        });
      }
    } // End of if (!updatedOrder.staff)

    // ?? CLEAR CART AND PROCESS COINS AFTER PAYMENT CONFIRMATION
    try {
      await this.clearCartAfterPayment(updatedOrder);
    } catch (cartError) {
      // Log cart clearing error but don't fail the payment confirmation
      logger.error("Cart clearing error after success callback", {
        orderId: updatedOrder._id,
        error: cartError.message,
        stack: cartError.stack,
      });
    }

    return {
      transactionId: order.payment.transactionId,
      orderId: order._id,
      status: "success",
      amount: order.totalPrice,
    };
  }

  async handleCustomCallback(callbackData) {
    const { orderId, transactionId } = callbackData;

    logger.info("Processing custom callback", { orderId, transactionId });

    // Find order by order ID or transaction ID
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId);
    }

    if (!order && transactionId) {
      order = await Order.findOne({
        "payment.transactionId": transactionId,
      });
    }

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    // Check current payment status from Razorpay
    const currentStatus = await this.checkPaymentStatus(
      transactionId || order.payment.transactionId
    );

    if (currentStatus.status === "paid") {
      // Update order if payment is successful
      const updateData = {
        "payment.paymentStatus": "paid",
        "payment.paidAt": new Date(),
        "payment.paymentMethod": "razorpay",
      };

      // Order stays "pending" � staff will confirm it manually
      // Payment status is tracked separately in order.payment.paymentStatus

      // Use {new: true} to get updated order in one query (eliminates redundant fetch)
      const updatedOrder = await Order.findByIdAndUpdate(
        order._id,
        updateData,
        {
          new: true,
        }
      );

      logger.info(
        "Custom callback processed successfully - payment confirmed",
        {
          orderId: order._id,
          transactionId: currentStatus.transactionId,
        }
      );

      // Create transaction record for accounting
      try {
        await this.createTransactionRecord(updatedOrder);
      } catch (txError) {
        logger.error("Failed to create transaction record", {
          orderId: order._id,
          error: txError.message,
        });
      }

      return {
        transactionId: currentStatus.transactionId,
        orderId: order._id,
        status: "success",
        razorpayPaymentId: currentStatus.razorpayPaymentId,
        amount: currentStatus.amount,
      };
    } else {
      logger.info("Custom callback processed - payment still pending/failed", {
        orderId: order._id,
        transactionId: currentStatus.transactionId,
        paymentStatus: currentStatus.status,
      });

      return {
        transactionId: currentStatus.transactionId,
        orderId: order._id,
        status: currentStatus.status,
        amount: currentStatus.amount,
      };
    }
  }

  async initiateRefund(orderId, refundData) {
    try {
      logger.info("Initiating Razorpay refund", { orderId, refundData });

      // Get order details
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      logger.info("Order payment details", {
        orderId,
        paymentStatus: order.payment?.paymentStatus,
        razorpayPaymentId: order.payment?.razorpayPaymentId,
        gatewayTransactionId: order.payment?.gatewayTransactionId,
        transactionId: order.payment?.transactionId,
      });

      // Allow refund for paid or refund_pending orders
      const eligibleStatuses = ["paid", "refund_pending"];
      if (!eligibleStatuses.includes(order.payment.paymentStatus)) {
        throw new APIError(
          400,
          "Cannot refund order with current payment status"
        );
      }

      // Get payment ID - try different sources
      let paymentId = order.payment.razorpayPaymentId;

      if (!paymentId && order.payment.gatewayTransactionId) {
        // If we have gatewayTransactionId (Razorpay order ID), get payments for this order
        try {
          const razorpayOrderId = order.payment.gatewayTransactionId;
          const razorpayOrder =
            await this.razorpay.orders.fetch(razorpayOrderId);

          // Get payments for this order
          const payments =
            await this.razorpay.orders.fetchPayments(razorpayOrderId);

          if (payments.items && payments.items.length > 0) {
            // Find the successful payment
            const successfulPayment = payments.items.find(
              (p) => p.status === "captured" || p.status === "authorized"
            );
            if (successfulPayment) {
              paymentId = successfulPayment.id;

              // Update order with payment ID for future use
              await Order.findByIdAndUpdate(orderId, {
                "payment.razorpayPaymentId": paymentId,
              });
            }
          }
        } catch (fetchError) {
          logger.error("Failed to fetch payment details from Razorpay", {
            orderId,
            gatewayTransactionId: order.payment.gatewayTransactionId,
            error: fetchError.message,
          });
        }
      }

      if (!paymentId) {
        throw new APIError(
          400,
          "No payment ID found for this order. Cannot process refund."
        );
      }

      // Calculate refund amount (in paise)
      const refundAmount = refundData.amount
        ? Math.round(refundData.amount * 100)
        : Math.round(order.totalPrice * 100);

      // Create refund in Razorpay
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: refundAmount,
        notes: {
          orderId: orderId,
          reason: refundData.reason || "Refund requested",
          initiatedBy: refundData.initiatedBy,
        },
      });

      // Update order status to refunded (since Razorpay refund was successful)
      await Order.findByIdAndUpdate(orderId, {
        "payment.paymentStatus": "refunded",
        "payment.refund": {
          refundId: refund.id,
          amount: refundAmount / 100,
          reason: refundData.reason || "Refund requested",
          initiatedAt: new Date(),
          completedAt: new Date(),
          gatewayResponse: refund,
        },
      });

      logger.info("Refund initiated successfully", {
        orderId,
        refundId: refund.id,
        amount: refundAmount / 100,
      });

      return {
        refundTransactionId: refund.id,
        refundId: refund.id,
        orderId: orderId,
        amount: refundAmount / 100,
        status: "refunded",
        estimatedSettlement: "5-7 business days",
      };
    } catch (error) {
      logger.error("Refund initiation failed", {
        orderId,
        error: error.message,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Refund initiation failed");
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - Payment verification data
   * @returns {boolean} - Signature validity
   */
  verifyPaymentSignature(paymentData) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        paymentData;

      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", this.config.keySecret)
        .update(body.toString())
        .digest("hex");

      return expectedSignature === razorpay_signature;
    } catch (error) {
      logger.error("Signature verification failed", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Verify Razorpay webhook signature using official Razorpay utility
   * @param {string} body - Raw webhook body
   * @param {string} signature - Webhook signature from headers
   * @returns {boolean} - Signature validity
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.config.webhookSecret) {
        logger.warn("Webhook secret not configured, skipping verification");
        return true; // Allow for now if webhook secret is not set
      }

      // Use official Razorpay utility for webhook validation
      const isValid = validateWebhookSignature(
        JSON.stringify(body),
        signature,
        this.config.webhookSecret
      );

      logger.info("Webhook signature verification", {
        isValid,
        hasSignature: !!signature,
        hasSecret: !!this.config.webhookSecret,
      });

      return isValid;
    } catch (error) {
      logger.error("Webhook signature verification failed", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Clear cart and process coins after successful payment
   * Delegated to payment/postProcess.service.js
   */
  async clearCartAfterPayment(order) {
    return _clearCartAfterPayment(order);
  }

  /**
   * Restore cart to active status when payment fails or is cancelled
   * Delegated to payment/postProcess.service.js
   */
  async restoreCartAfterPaymentFailure(orderId) {
    return _restoreCartAfterPaymentFailure(orderId);
  }

  /**
   * Create Transaction record for any payment outcome
   * Delegated to payment/postProcess.service.js
   */
  async createTransactionRecord(order) {
    return _createTransactionRecord(order);
  }

  /**
   * Get all payments with filtering and pagination
   * Delegated to payment/analytics.service.js
   */
  async getAllPayments(options = {}) {
    return _getAllPayments(options);
  }

  /**
   * Get payment analytics and reports
   * Delegated to payment/analytics.service.js
   */
  async getPaymentAnalytics(options = {}) {
    return _getPaymentAnalytics(options);
  }

  /**
   * Create Subscription Payment Order
   * Creates a payment order for subscription
   * @param {Object} subscriptionData - Subscription payment data
   * @returns {Object} Payment order details
   */
  async createSubscriptionPaymentOrder(subscriptionData) {
    try {
      const { subscriptionId, amount, planName, billingCycle } =
        subscriptionData;

      logger.info("Creating subscription payment order", {
        subscriptionId,
        amount,
        planName,
      });

      // Convert amount to paise
      const amountInPaise = Math.round(amount * 100);

      // Create Razorpay order
      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `subscription_${subscriptionId}`,
        notes: {
          subscriptionId: subscriptionId,
          planName: planName,
          billingCycle: billingCycle,
          type: "subscription",
        },
      });

      logger.info("Subscription payment order created successfully", {
        subscriptionId,
        razorpayOrderId: razorpayOrder.id,
      });

      return {
        orderId: razorpayOrder.id,
        amount: amount,
        amountInPaise: amountInPaise,
        currency: "INR",
        key: this.config.keyId,
        name: "Hotel Management System",
        description: `${planName} - ${billingCycle} subscription`,
        subscriptionId: subscriptionId,
      };
    } catch (error) {
      logger.error("Subscription payment order creation failed", {
        error: error.message,
        subscriptionData,
      });
      throw new APIError(500, "Failed to create subscription payment order");
    }
  }

  /**
   * Verify Subscription Payment
   * Verifies subscription payment signature
   * @param {Object} paymentData - Payment verification data
   * @returns {Boolean} True if payment is verified
   */
  verifySubscriptionPayment(paymentData) {
    return this.verifyPaymentSignature(paymentData);
  }

  /**
   * Fetch Payment Details from Razorpay
   * Retrieves payment details by Razorpay payment ID
   * @param {String} paymentId - Razorpay payment ID (e.g., pay_xxx)
   * @returns {Object} Payment details from Razorpay (amount in paise, method, status, etc.)
   */
  async fetchPaymentDetails(paymentId) {
    try {
      logger.info("Fetching payment details from Razorpay", { paymentId });

      const payment = await this.razorpay.payments.fetch(paymentId);

      logger.info("Payment details fetched successfully", {
        paymentId,
        status: payment.status,
        amount: payment.amount,
        method: payment.method,
      });

      return payment;
    } catch (error) {
      logger.error("Failed to fetch payment details from Razorpay", {
        paymentId,
        error: error.message,
      });
      throw new APIError(500, "Failed to fetch payment details from Razorpay");
    }
  }

  /**
   * Sync Payment Status with Razorpay
   * Fetches actual payment status from Razorpay and syncs with database
   * Useful for handling abandoned/back button scenarios
   * @param {String} orderId - MongoDB Order ID
   * @returns {Object} Sync result with updated status
   */
  async syncPaymentStatus(orderId) {
    try {
      logger.info("Syncing payment status with Razorpay", { orderId });

      // Find order in database
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      // If no Razorpay order ID, nothing to sync
      if (!order.payment?.razorpayOrderId) {
        return {
          synced: false,
          message: "No Razorpay payment initiated for this order",
          currentStatus: order.payment?.paymentStatus || "pending",
        };
      }

      // Fetch Razorpay order details
      const razorpayOrder = await this.razorpay.orders.fetch(
        order.payment.razorpayOrderId
      );

      logger.info("Razorpay order fetched", {
        orderId,
        razorpayOrderId: razorpayOrder.id,
        razorpayStatus: razorpayOrder.status,
        attempts: razorpayOrder.attempts,
      });

      let actualStatus = "pending";
      let razorpayPayment = null;

      // If order has payments, fetch the latest payment
      if (razorpayOrder.attempts > 0) {
        try {
          // Fetch payments for this order
          const payments = await this.razorpay.orders.fetchPayments(
            razorpayOrder.id
          );

          if (payments.items && payments.items.length > 0) {
            // Get the latest payment attempt
            razorpayPayment = payments.items[0];

            logger.info("Payment attempt found", {
              orderId,
              paymentId: razorpayPayment.id,
              status: razorpayPayment.status,
            });

            // Map Razorpay payment status to our status
            switch (razorpayPayment.status) {
              case "captured":
              case "authorized":
                actualStatus = "paid";
                break;
              case "failed":
                actualStatus = "failed";
                break;
              case "refunded":
                actualStatus = "refunded";
                break;
              default:
                actualStatus = "pending";
            }
          }
        } catch (paymentError) {
          logger.warn("Could not fetch payments for order", {
            orderId,
            razorpayOrderId: razorpayOrder.id,
            error: paymentError.message,
          });
        }
      } else {
        // No payment attempts - user abandoned
        actualStatus = "failed";
        logger.info("No payment attempts - marking as failed", { orderId });
      }

      // Check if status needs to be updated
      const currentDbStatus = order.payment?.paymentStatus || "pending";

      if (currentDbStatus !== actualStatus) {
        logger.info("Payment status mismatch - updating database", {
          orderId,
          dbStatus: currentDbStatus,
          razorpayStatus: actualStatus,
        });

        // Update order in database
        const updateData = {
          "payment.paymentStatus": actualStatus,
        };

        // If payment was successful, update additional fields
        if (actualStatus === "paid" && razorpayPayment) {
          updateData["payment.razorpayPaymentId"] = razorpayPayment.id;
          updateData["payment.paidAt"] = new Date();

          // Order stays "pending" � staff will confirm it manually
          // Payment status is tracked separately in order.payment.paymentStatus

          // Use {new: true} to get updated order in one query (eliminates redundant fetch)
          const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            updateData,
            {
              new: true,
            }
          );

          // Create transaction record for accounting
          try {
            await this.createTransactionRecord(updatedOrder);
          } catch (txError) {
            logger.error("Failed to create transaction record during sync", {
              orderId,
              error: txError.message,
            });
          }

          // Trigger staff assignment only if no staff assigned yet
          // Re-fetch from DB to get the latest staff value (prevents race with verifyPayment)
          const freshSyncOrder = await Order.findById(orderId).lean();
          if (freshSyncOrder && !freshSyncOrder.staff) {
            try {
              const assignmentResult =
                await assignmentService.assignOrder(updatedOrder);
              if (assignmentResult.success) {
                logger.info("Staff assigned after payment sync", {
                  orderId,
                  waiterId: assignmentResult.waiter?.id,
                });
              }
            } catch (assignmentError) {
              logger.error("Staff assignment failed during sync", {
                orderId,
                error: assignmentError.message,
              });
            }
          }

          // Clear cart
          try {
            await this.clearCartAfterPayment(updatedOrder);
          } catch (cartError) {
            logger.error("Cart clearing failed during sync", {
              orderId,
              error: cartError.message,
            });
          }

          return {
            synced: true,
            statusChanged: true,
            previousStatus: currentDbStatus,
            currentStatus: actualStatus,
            message: `Payment status updated from ${currentDbStatus} to ${actualStatus}`,
            razorpayOrderId: razorpayOrder.id,
            razorpayPaymentId: razorpayPayment?.id || null,
          };
        } else if (actualStatus === "failed") {
          // Mark order as cancelled for failed payments
          updateData.status = "cancelled";
          await Order.findByIdAndUpdate(orderId, updateData);

          return {
            synced: true,
            statusChanged: true,
            previousStatus: currentDbStatus,
            currentStatus: actualStatus,
            message: `Payment status updated from ${currentDbStatus} to ${actualStatus}`,
            razorpayOrderId: razorpayOrder.id,
            razorpayPaymentId: razorpayPayment?.id || null,
          };
        } else {
          await Order.findByIdAndUpdate(orderId, updateData);

          return {
            synced: true,
            statusChanged: true,
            previousStatus: currentDbStatus,
            currentStatus: actualStatus,
            message: `Payment status updated from ${currentDbStatus} to ${actualStatus}`,
            razorpayOrderId: razorpayOrder.id,
            razorpayPaymentId: razorpayPayment?.id || null,
          };
        }
      }

      // Status already matches
      return {
        synced: true,
        statusChanged: false,
        currentStatus: actualStatus,
        message: "Payment status is already up to date",
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: razorpayPayment?.id || null,
      };
    } catch (error) {
      logger.error("Payment sync failed", {
        orderId,
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof APIError) throw error;
      throw new APIError(500, "Failed to sync payment status");
    }
  }
}

export const paymentService = new PaymentService();
