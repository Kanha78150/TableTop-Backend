/**
 * Cash-payment post-processing helpers shared by admin, manager & staff controllers.
 *
 * Handles the review-invitation email, invoice email, and socket notification that are
 * shared across all three confirmCashPayment handlers and order completion flows.
 */

import { Order } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import { EmailQueue } from "../../models/EmailQueue.model.js";
import { logger } from "../../utils/logger.js";
import { getIO, isIOInitialized } from "../../utils/socketService.js";
import { sendReviewInvitationEmail } from "../../utils/emailService.js";
import { invoiceService } from "../invoice.service.js";

/**
 * Send review invitation email after cash-payment confirmation
 * (only if order is already completed and email not sent yet).
 *
 * @param {Object} updatedOrder – The order document returned by orderService.confirmCashPayment
 * @param {string} orderId – The order's _id (string)
 */
export async function sendReviewEmailIfReady(updatedOrder, orderId) {
  if (updatedOrder.status !== "completed" || updatedOrder.reviewInviteSentAt) {
    return;
  }

  try {
    const user = await User.findById(
      updatedOrder.user._id || updatedOrder.user
    );
    if (!user?.email) return;

    const orderWithDetails = await Order.findById(updatedOrder._id)
      .populate("hotel", "name")
      .populate("branch", "name");

    await sendReviewInvitationEmail(orderWithDetails, user);

    // Mark email as sent (fire-and-forget)
    Order.findByIdAndUpdate(orderId, { reviewInviteSentAt: new Date() }).catch(
      (err) => logger.error("Failed to update reviewInviteSentAt:", err)
    );

    logger.info(
      `Review invitation email sent after cash payment confirmation for order ${orderId}`
    );
  } catch (emailError) {
    logger.error(
      `Failed to send review invitation email for order ${orderId}:`,
      emailError
    );
  }
}

/**
 * Generate and send invoice email after order is both completed and paid.
 * Skips if invoice email was already sent.
 *
 * @param {Object} updatedOrder – The order document (may be partially populated)
 * @param {string} orderId – The order's _id (string)
 */
export async function sendInvoiceEmailIfReady(updatedOrder, orderId) {
  if (
    updatedOrder.status !== "completed" ||
    updatedOrder.payment?.paymentStatus !== "paid" ||
    updatedOrder.invoiceEmailStatus === "sent"
  ) {
    return;
  }

  try {
    // Populate order fully for invoice generation
    const populatedOrder = await Order.findById(orderId)
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address")
      .populate("items.foodItem", "name price");

    if (!populatedOrder) return;

    const userEmail = populatedOrder.user?.email;
    if (!userEmail) {
      await Order.findByIdAndUpdate(orderId, {
        invoiceEmailStatus: "no_email",
      });
      return;
    }

    // Generate invoice number if not already present
    if (!populatedOrder.invoiceNumber) {
      const invoiceNumber = `INV-${Date.now()}-${orderId
        .toString()
        .slice(-8)
        .toUpperCase()}`;

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
    }

    // Generate invoice PDF
    const invoice = await invoiceService.generateOrderInvoice(populatedOrder, {
      showCancelledStamp: false,
    });

    // Send email
    try {
      await invoiceService.sendInvoiceEmail(
        invoice,
        userEmail,
        populatedOrder.user.name,
        "invoice"
      );
      populatedOrder.invoiceEmailStatus = "sent";
      logger.info(`Invoice email sent for order ${orderId}`, {
        invoiceNumber: populatedOrder.invoiceNumber,
        recipientEmail: userEmail,
      });
    } catch (emailError) {
      logger.error(
        `Failed to send invoice email for order ${orderId}, queuing for retry`,
        {
          error: emailError.message,
        }
      );

      await EmailQueue.create({
        type: "invoice",
        orderId: populatedOrder._id,
        recipientEmail: userEmail,
        recipientName: populatedOrder.user.name,
        status: "pending",
        emailData: {
          subject: `Invoice ${populatedOrder.invoiceNumber} - TableTop`,
          invoiceNumber: populatedOrder.invoiceNumber,
          amount: populatedOrder.totalPrice,
        },
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
      }).catch((queueErr) =>
        logger.error("Failed to queue invoice email for retry:", queueErr)
      );

      populatedOrder.invoiceEmailStatus = "failed";
      populatedOrder.invoiceEmailAttempts = 1;
    }

    await populatedOrder.save();
  } catch (err) {
    logger.error(`Failed to generate/send invoice for order ${orderId}:`, err);
  }
}

/**
 * Emit socket notification after cash-payment confirmation.
 *
 * @param {Object} updatedOrder – The order document
 * @param {string} confirmedBy – "admin" | "manager" | "staff"
 */
export function emitPaymentConfirmed(updatedOrder, confirmedBy) {
  try {
    if (!isIOInitialized()) return;

    const io = getIO();
    const userId = updatedOrder.user._id || updatedOrder.user;
    io.to(`user_${userId}`).emit("payment:confirmed", {
      orderId: updatedOrder._id,
      paymentStatus: "paid",
      paymentMethod: "cash",
      confirmedBy,
      message: "Your cash payment has been confirmed",
    });
  } catch (socketError) {
    logger.error("Socket notification error:", socketError);
  }
}

export default {
  sendReviewEmailIfReady,
  sendInvoiceEmailIfReady,
  emitPaymentConfirmed,
};
