import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
import { paymentLogger } from "../utils/paymentLogger.js";
import { sendEmail } from "../utils/emailService.js";
import { APIError } from "../utils/APIError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Invoice Service
 * Handles PDF invoice generation for orders and subscriptions
 */

class InvoiceService {
  constructor() {
    // Create invoices directory if it doesn't exist
    this.invoicesDir = path.join(__dirname, "../../public/invoices");
    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }
  }

  /**
   * Generate invoice for an order
   * @param {Object} order - Order object with populated fields
   * @returns {Object} Invoice file path and details
   */
  async generateOrderInvoice(order) {
    try {
      logger.info("Generating order invoice", { orderId: order._id });

      // Generate invoice number
      const invoiceNumber = this.generateInvoiceNumber("ORD", order._id);
      const fileName = `invoice_${invoiceNumber}.pdf`;
      const filePath = path.join(this.invoicesDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Add invoice header
      this.addInvoiceHeader(doc, {
        title: "ORDER INVOICE",
        invoiceNumber: invoiceNumber,
        date: order.createdAt,
        dueDate: order.payment?.paidAt || order.createdAt,
      });

      // Add seller information
      this.addSellerInfo(doc, {
        name: order.hotel?.name || "Hotel Name",
        branch: order.branch?.name || "Branch Name",
        address: order.branch?.address || "Address",
        phone: order.hotel?.contactNumber || order.branch?.contactNumber,
        email: order.hotel?.email || order.branch?.email,
        gstin: order.hotel?.gstin || "N/A",
      });

      // Add customer information
      this.addCustomerInfo(doc, {
        name: order.user?.name || "Guest",
        email: order.user?.email || "N/A",
        phone: order.user?.phone || "N/A",
        address: order.deliveryAddress || "Dine-in",
      });

      // Add order details table
      this.addOrderItemsTable(doc, order);

      // Add payment information
      this.addPaymentInfo(doc, {
        transactionId: order.payment?.transactionId,
        razorpayPaymentId: order.payment?.razorpayPaymentId,
        paymentMethod: order.payment?.paymentMethod || "Cash",
        paymentStatus: order.payment?.paymentStatus || "Pending",
        paidAt: order.payment?.paidAt,
      });

      // Add footer
      this.addInvoiceFooter(doc);

      // Finalize PDF
      doc.end();

      // Wait for file to be written
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      const fileSize = fs.statSync(filePath).size;

      // Log invoice generation
      paymentLogger.logInvoiceGeneration({
        invoiceId: invoiceNumber,
        orderId: order._id.toString(),
        amount: order.totalPrice,
        invoiceNumber: invoiceNumber,
        generatedBy: "system",
        fileSize: fileSize,
        format: "PDF",
      });

      logger.info("Order invoice generated successfully", {
        orderId: order._id,
        invoiceNumber: invoiceNumber,
        filePath: filePath,
      });

      return {
        invoiceNumber: invoiceNumber,
        filePath: filePath,
        fileName: fileName,
        fileSize: fileSize,
        publicUrl: `/invoices/${fileName}`,
      };
    } catch (error) {
      logger.error("Order invoice generation failed", {
        orderId: order._id,
        error: error.message,
        stack: error.stack,
      });
      throw new APIError(500, "Failed to generate order invoice");
    }
  }

  /**
   * Generate invoice for a subscription payment
   * @param {Object} subscription - Subscription object with populated fields
   * @param {Object} payment - Payment details from payment history
   * @returns {Object} Invoice file path and details
   */
  async generateSubscriptionInvoice(subscription, payment) {
    try {
      logger.info("Generating subscription invoice", {
        subscriptionId: subscription._id,
        paymentId: payment._id,
      });

      // Generate invoice number
      const invoiceNumber = this.generateInvoiceNumber("SUB", subscription._id);
      const fileName = `subscription_invoice_${invoiceNumber}.pdf`;
      const filePath = path.join(this.invoicesDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Add invoice header
      this.addInvoiceHeader(doc, {
        title: "SUBSCRIPTION INVOICE",
        invoiceNumber: invoiceNumber,
        date: payment.date || new Date(),
        dueDate: payment.date || new Date(),
      });

      // Add company information
      this.addSellerInfo(doc, {
        name: "TableTop Hotel Management",
        address: "Your Company Address",
        phone: "Your Company Phone",
        email: "billing@tabletop.com",
        gstin: "YOUR_GSTIN",
      });

      // Add customer information
      this.addCustomerInfo(doc, {
        name: subscription.admin?.name || "Admin",
        email: subscription.admin?.email || "N/A",
        phone: subscription.admin?.phone || "N/A",
        businessName: subscription.admin?.hotel?.name || "N/A",
      });

      // Add subscription details
      this.addSubscriptionDetails(doc, subscription, payment);

      // Add payment information
      this.addPaymentInfo(doc, {
        transactionId: payment.transactionId,
        razorpayPaymentId: payment.razorpayPaymentId,
        paymentMethod: payment.method || "Razorpay",
        paymentStatus: payment.status || "success",
        paidAt: payment.date,
      });

      // Add footer
      this.addInvoiceFooter(doc);

      // Finalize PDF
      doc.end();

      // Wait for file to be written
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      const fileSize = fs.statSync(filePath).size;

      // Log invoice generation
      paymentLogger.logInvoiceGeneration({
        invoiceId: invoiceNumber,
        subscriptionId: subscription._id.toString(),
        amount: payment.amount,
        invoiceNumber: invoiceNumber,
        generatedBy: "system",
        fileSize: fileSize,
        format: "PDF",
      });

      logger.info("Subscription invoice generated successfully", {
        subscriptionId: subscription._id,
        invoiceNumber: invoiceNumber,
        filePath: filePath,
      });

      return {
        invoiceNumber: invoiceNumber,
        filePath: filePath,
        fileName: fileName,
        fileSize: fileSize,
        publicUrl: `/invoices/${fileName}`,
      };
    } catch (error) {
      logger.error("Subscription invoice generation failed", {
        subscriptionId: subscription._id,
        error: error.message,
        stack: error.stack,
      });
      throw new APIError(500, "Failed to generate subscription invoice");
    }
  }

  /**
   * Send invoice via email
   * @param {Object} invoiceData - Invoice details
   * @param {String} recipientEmail - Recipient email address
   * @param {String} recipientName - Recipient name
   */
  async sendInvoiceEmail(invoiceData, recipientEmail, recipientName) {
    try {
      logger.info("Sending invoice email", {
        invoiceNumber: invoiceData.invoiceNumber,
        recipientEmail: recipientEmail,
      });

      const emailOptions = {
        to: recipientEmail,
        subject: `Invoice ${invoiceData.invoiceNumber} - TableTop`,
        html: this.getInvoiceEmailTemplate(
          recipientName,
          invoiceData.invoiceNumber
        ),
        attachments: [
          {
            filename: invoiceData.fileName,
            path: invoiceData.filePath,
          },
        ],
      };

      await sendEmail(emailOptions);

      logger.info("Invoice email sent successfully", {
        invoiceNumber: invoiceData.invoiceNumber,
        recipientEmail: recipientEmail,
      });
    } catch (error) {
      logger.error("Failed to send invoice email", {
        invoiceNumber: invoiceData.invoiceNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   * @param {String} prefix - Invoice prefix (ORD/SUB)
   * @param {String} id - Order or subscription ID
   * @returns {String} Invoice number
   */
  generateInvoiceNumber(prefix, id) {
    const timestamp = Date.now();
    const shortId = id.toString().substring(0, 8).toUpperCase();
    return `${prefix}-${timestamp}-${shortId}`;
  }

  /**
   * Add invoice header to PDF
   */
  addInvoiceHeader(doc, data) {
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .text(data.title, { align: "center" })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Invoice Number: ${data.invoiceNumber}`, 50, 120)
      .text(
        `Invoice Date: ${new Date(data.date).toLocaleDateString()}`,
        50,
        135
      )
      .text(`Due Date: ${new Date(data.dueDate).toLocaleDateString()}`, 50, 150)
      .moveDown(2);
  }

  /**
   * Add seller/company information
   */
  addSellerInfo(doc, data) {
    const startY = 200;

    doc.fontSize(12).font("Helvetica-Bold").text("From:", 50, startY);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(data.name, 50, startY + 20)
      .text(data.branch || "", 50, startY + 35)
      .text(data.address, 50, startY + 50, { width: 200 })
      .text(`Phone: ${data.phone || "N/A"}`, 50, startY + 80)
      .text(`Email: ${data.email || "N/A"}`, 50, startY + 95)
      .text(`GSTIN: ${data.gstin || "N/A"}`, 50, startY + 110);
  }

  /**
   * Add customer information
   */
  addCustomerInfo(doc, data) {
    const startY = 200;

    doc.fontSize(12).font("Helvetica-Bold").text("Bill To:", 320, startY);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(data.name, 320, startY + 20)
      .text(data.businessName || "", 320, startY + 35)
      .text(`Email: ${data.email}`, 320, startY + 50)
      .text(`Phone: ${data.phone}`, 320, startY + 65)
      .text(`Address: ${data.address || "N/A"}`, 320, startY + 80, {
        width: 200,
      });
  }

  /**
   * Add order items table
   */
  addOrderItemsTable(doc, order) {
    const tableTop = 380;
    const itemX = 50;
    const qtyX = 320;
    const priceX = 380;
    const totalX = 460;

    // Table header
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Item", itemX, tableTop)
      .text("Qty", qtyX, tableTop)
      .text("Price", priceX, tableTop)
      .text("Total", totalX, tableTop);

    // Draw line under header
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Add items
    let currentY = tableTop + 25;
    order.items.forEach((item, index) => {
      const itemName = item.foodItem?.name || item.name || "Item";
      const quantity = item.quantity || 0;
      const price = item.price || 0;
      const total = quantity * price;

      doc
        .fontSize(9)
        .font("Helvetica")
        .text(itemName, itemX, currentY, { width: 250 })
        .text(quantity.toString(), qtyX, currentY)
        .text(`₹${price.toFixed(2)}`, priceX, currentY)
        .text(`₹${total.toFixed(2)}`, totalX, currentY);

      currentY += 20;
    });

    // Draw line before totals
    currentY += 5;
    doc.moveTo(50, currentY).lineTo(550, currentY).stroke();

    // Add totals
    currentY += 15;

    const subtotal = order.items.reduce(
      (sum, item) => sum + (item.quantity * item.price || 0),
      0
    );

    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Subtotal:", 380, currentY)
      .text(`₹${subtotal.toFixed(2)}`, totalX, currentY);

    currentY += 20;

    if (order.coinDiscount > 0) {
      doc
        .text("Coin Discount:", 380, currentY)
        .text(`-₹${order.coinDiscount.toFixed(2)}`, totalX, currentY);
      currentY += 20;
    }

    if (order.discount > 0) {
      doc
        .text("Discount:", 380, currentY)
        .text(`-₹${order.discount.toFixed(2)}`, totalX, currentY);
      currentY += 20;
    }

    if (order.tax > 0) {
      doc
        .text("Tax:", 380, currentY)
        .text(`₹${order.tax.toFixed(2)}`, totalX, currentY);
      currentY += 20;
    }

    // Total
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Total Amount:", 380, currentY)
      .text(`₹${order.totalPrice.toFixed(2)}`, totalX, currentY);

    // Coins earned
    if (order.rewardCoins > 0) {
      currentY += 25;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("green")
        .text(`🎉 Reward Coins Earned: ${order.rewardCoins}`, 380, currentY)
        .fillColor("black");
    }
  }

  /**
   * Add subscription details table
   */
  addSubscriptionDetails(doc, subscription, payment) {
    const tableTop = 380;

    // Subscription details
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Subscription Details", 50, tableTop)
      .moveDown(0.5);

    const detailsY = tableTop + 25;

    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Plan:", 50, detailsY)
      .font("Helvetica-Bold")
      .text(subscription.plan?.name || "N/A", 200, detailsY)
      .font("Helvetica")
      .text("Billing Cycle:", 50, detailsY + 20)
      .font("Helvetica-Bold")
      .text(subscription.billingCycle || "N/A", 200, detailsY + 20)
      .font("Helvetica")
      .text("Period:", 50, detailsY + 40)
      .font("Helvetica-Bold")
      .text(
        `${new Date(subscription.startDate).toLocaleDateString()} - ${new Date(
          subscription.endDate
        ).toLocaleDateString()}`,
        200,
        detailsY + 40
      )
      .font("Helvetica")
      .text("Status:", 50, detailsY + 60)
      .font("Helvetica-Bold")
      .text(subscription.status.toUpperCase(), 200, detailsY + 60);

    // Payment summary
    const summaryY = detailsY + 100;

    doc.moveTo(50, summaryY).lineTo(550, summaryY).stroke();

    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Amount:", 380, summaryY + 15)
      .font("Helvetica-Bold")
      .text(`₹${payment.amount.toFixed(2)}`, 460, summaryY + 15);

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Total Amount:", 380, summaryY + 40)
      .text(`₹${payment.amount.toFixed(2)}`, 460, summaryY + 40);
  }

  /**
   * Add payment information
   */
  addPaymentInfo(doc, data) {
    const startY = 600;

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("Payment Information", 50, startY)
      .moveDown(0.5);

    doc
      .fontSize(9)
      .font("Helvetica")
      .text(`Transaction ID: ${data.transactionId || "N/A"}`, 50, startY + 20)
      .text(
        `Razorpay Payment ID: ${data.razorpayPaymentId || "N/A"}`,
        50,
        startY + 35
      )
      .text(`Payment Method: ${data.paymentMethod}`, 50, startY + 50)
      .text(`Payment Status: ${data.paymentStatus}`, 50, startY + 65);

    if (data.paidAt) {
      doc.text(
        `Paid At: ${new Date(data.paidAt).toLocaleString()}`,
        50,
        startY + 80
      );
    }
  }

  /**
   * Add invoice footer
   */
  addInvoiceFooter(doc) {
    const footerY = 720;

    doc
      .fontSize(8)
      .font("Helvetica")
      .text("Thank you for your business!", 50, footerY, { align: "center" })
      .text(
        "For any queries, please contact us at support@tabletop.com",
        50,
        footerY + 15,
        { align: "center" }
      )
      .text(
        "This is a computer-generated invoice and does not require a signature.",
        50,
        footerY + 30,
        { align: "center", width: 500 }
      );
  }

  /**
   * Get invoice email template
   */
  getInvoiceEmailTemplate(recipientName, invoiceNumber) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3498db; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 10px 20px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Invoice Generated</h1>
          </div>
          <div class="content">
            <p>Dear ${recipientName},</p>
            <p>Your invoice <strong>${invoiceNumber}</strong> has been generated successfully.</p>
            <p>Please find the invoice attached to this email for your records.</p>
            <p>If you have any questions or concerns regarding this invoice, please don't hesitate to contact our support team.</p>
            <p>Thank you for your business!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} TableTop Hotel Management. All rights reserved.</p>
            <p>support@tabletop.com | www.tabletop.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Delete invoice file
   * @param {String} fileName - Invoice file name
   */
  async deleteInvoice(fileName) {
    try {
      const filePath = path.join(this.invoicesDir, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info("Invoice file deleted", { fileName });
        return true;
      }

      logger.warn("Invoice file not found for deletion", { fileName });
      return false;
    } catch (error) {
      logger.error("Failed to delete invoice file", {
        fileName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get invoice file path
   * @param {String} fileName - Invoice file name
   * @returns {String} Full file path
   */
  getInvoicePath(fileName) {
    return path.join(this.invoicesDir, fileName);
  }
}

// Export singleton instance
export const invoiceService = new InvoiceService();
