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
   * @param {Object} options - Options for invoice generation
   * @param {Boolean} options.showCancelledStamp - Whether to show CANCELLED stamp
   * @returns {Object} Invoice buffer and details
   */
  async generateOrderInvoice(order, options = {}) {
    try {
      logger.info("Generating order invoice", { orderId: order._id });

      const { showCancelledStamp = false } = options;

      // Use existing invoice number or generate new one
      const invoiceNumber =
        order.invoiceNumber || this.generateInvoiceNumber("INV", order._id);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      // Collect PDF data in memory
      doc.on("data", buffers.push.bind(buffers));

      const pdfPromise = new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
      });

      // Use invoiceSnapshot if available, otherwise use populated data
      const sellerInfo = order.invoiceSnapshot
        ? {
            name: order.invoiceSnapshot.hotelName,
            branch: order.invoiceSnapshot.branchName,
            address: order.invoiceSnapshot.branchAddress,
            phone:
              order.invoiceSnapshot.hotelPhone ||
              order.invoiceSnapshot.branchPhone,
            email:
              order.invoiceSnapshot.hotelEmail ||
              order.invoiceSnapshot.branchEmail,
            gstin: order.invoiceSnapshot.hotelGSTIN || "N/A",
          }
        : {
            name: order.hotel?.name || "Hotel Name",
            branch: order.branch?.name || "Branch Name",
            address: order.branch?.address || "Address",
            phone: order.hotel?.contactNumber || order.branch?.contactNumber,
            email: order.hotel?.email || order.branch?.email,
            gstin: order.hotel?.gstin || "N/A",
          };

      const customerInfo = order.invoiceSnapshot
        ? {
            name: order.invoiceSnapshot.customerName,
            email: order.invoiceSnapshot.customerEmail,
            phone: order.invoiceSnapshot.customerPhone,
            address: order.invoiceSnapshot.tableNumber
              ? `Table ${order.invoiceSnapshot.tableNumber}`
              : "Dine-in",
          }
        : {
            name: order.user?.name || "Guest",
            email: order.user?.email || "N/A",
            phone: order.user?.phone || "N/A",
            address: order.tableNumber
              ? `Table ${order.tableNumber}`
              : "Dine-in",
          };

      // Add invoice header
      this.addInvoiceHeader(doc, {
        invoiceNumber: invoiceNumber,
        date: order.createdAt,
        sellerName: sellerInfo.name,
        sellerBranch: sellerInfo.branch,
        sellerAddress: sellerInfo.address,
        sellerPhone: sellerInfo.phone,
        customerName: customerInfo.name,
      });

      // Add order items and get current Y position
      const currentY = this.addOrderItemsTable(doc, order);

      // Add payment information
      const paymentY = this.addPaymentInfo(
        doc,
        {
          paymentMethod: order.payment?.paymentMethod || "Online",
          paidAt: order.payment?.paidAt || order.createdAt,
          transactionId:
            order.payment?.paymentId ||
            order.payment?.razorpayPaymentId ||
            order.payment?.gatewayOrderId ||
            order.payment?.razorpayOrderId,
          orderId: order._id.toString().slice(-12).toUpperCase(),
        },
        currentY
      );

      // Add CANCELLED stamp if needed
      if (showCancelledStamp) {
        this.addCancelledStamp(doc);
      }

      // Add footer
      this.addInvoiceFooter(doc, paymentY);

      // Finalize PDF
      doc.end();

      // Wait for PDF to be generated
      const pdfBuffer = await pdfPromise;

      // Log invoice generation
      paymentLogger.logInvoiceGeneration({
        invoiceId: invoiceNumber,
        orderId: order._id.toString(),
        amount: order.totalPrice,
        invoiceNumber: invoiceNumber,
        generatedBy: "system",
        fileSize: pdfBuffer.length,
        format: "PDF",
      });

      logger.info("Order invoice generated successfully", {
        orderId: order._id,
        invoiceNumber: invoiceNumber,
        bufferSize: pdfBuffer.length,
      });

      return {
        invoiceNumber: invoiceNumber,
        buffer: pdfBuffer,
        fileName: `Invoice-${invoiceNumber}.pdf`,
        fileSize: pdfBuffer.length,
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
   * @returns {Object} Invoice buffer and details
   */
  async generateSubscriptionInvoice(subscription, payment) {
    try {
      logger.info("Generating subscription invoice", {
        subscriptionId: subscription._id,
        paymentId: payment._id,
      });

      // Generate invoice number
      const invoiceNumber = this.generateInvoiceNumber("SUB", subscription._id);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      // Collect PDF data in memory
      doc.on("data", buffers.push.bind(buffers));

      const pdfPromise = new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
      });

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

      // Wait for PDF to be generated
      const pdfBuffer = await pdfPromise;

      // Log invoice generation
      paymentLogger.logInvoiceGeneration({
        invoiceId: invoiceNumber,
        subscriptionId: subscription._id.toString(),
        amount: payment.amount,
        invoiceNumber: invoiceNumber,
        generatedBy: "system",
        fileSize: pdfBuffer.length,
        format: "PDF",
      });

      logger.info("Subscription invoice generated successfully", {
        subscriptionId: subscription._id,
        invoiceNumber: invoiceNumber,
        bufferSize: pdfBuffer.length,
      });

      return {
        invoiceNumber: invoiceNumber,
        buffer: pdfBuffer,
        fileName: `Subscription-Invoice-${invoiceNumber}.pdf`,
        fileSize: pdfBuffer.length,
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
   * Generate credit note for a refund
   * @param {Object} order - Order object with populated fields
   * @param {Object} refundRequest - Refund request object
   * @returns {Object} Credit note buffer and details
   */
  async generateCreditNote(order, refundRequest) {
    try {
      logger.info("Generating credit note", {
        orderId: order._id,
        refundRequestId: refundRequest._id,
      });

      // Generate credit note number
      const creditNoteNumber = this.generateInvoiceNumber("CN", order._id);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];

      // Collect PDF data in memory
      doc.on("data", buffers.push.bind(buffers));

      const pdfPromise = new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
      });

      // Add credit note header
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#e74c3c")
        .text("CREDIT NOTE", { align: "center" })
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("black")
        .text(`Credit Note Number: ${creditNoteNumber}`, 50, 120)
        .text(`Issue Date: ${new Date().toLocaleDateString()}`, 50, 135)
        .text(`Original Invoice: ${order.invoiceNumber || "N/A"}`, 50, 150)
        .moveDown(2);

      // Use invoiceSnapshot for seller/customer info
      const sellerInfo = order.invoiceSnapshot
        ? {
            name: order.invoiceSnapshot.hotelName,
            branch: order.invoiceSnapshot.branchName,
            address: order.invoiceSnapshot.branchAddress,
            phone:
              order.invoiceSnapshot.hotelPhone ||
              order.invoiceSnapshot.branchPhone,
            email:
              order.invoiceSnapshot.hotelEmail ||
              order.invoiceSnapshot.branchEmail,
            gstin: order.invoiceSnapshot.hotelGSTIN || "N/A",
          }
        : {
            name: order.hotel?.name || "Hotel Name",
            branch: order.branch?.name || "Branch Name",
            address: order.branch?.address || "Address",
            phone: order.hotel?.contactNumber || order.branch?.contactNumber,
            email: order.hotel?.email || order.branch?.email,
            gstin: order.hotel?.gstin || "N/A",
          };

      const customerInfo = order.invoiceSnapshot
        ? {
            name: order.invoiceSnapshot.customerName,
            email: order.invoiceSnapshot.customerEmail,
            phone: order.invoiceSnapshot.customerPhone,
          }
        : {
            name: order.user?.name || "Guest",
            email: order.user?.email || "N/A",
            phone: order.user?.phone || "N/A",
          };

      // Add seller information
      this.addSellerInfo(doc, sellerInfo);

      // Add customer information
      this.addCustomerInfo(doc, customerInfo);

      // Add refund details
      doc.moveDown(2);
      doc.fontSize(14).font("Helvetica-Bold").text("Refund Details:", 50);
      doc.moveDown(0.5);

      const refundTableTop = doc.y;
      doc
        .fontSize(10)
        .font("Helvetica")
        .text("Refund Amount:", 50, refundTableTop)
        .font("Helvetica-Bold")
        .text(`₹${refundRequest.amount.toFixed(2)}`, 200, refundTableTop)
        .font("Helvetica")
        .text("Refund Reason:", 50, refundTableTop + 20)
        .text(refundRequest.reason || "N/A", 200, refundTableTop + 20, {
          width: 300,
        })
        .text("Refund Date:", 50, refundTableTop + 60)
        .text(
          new Date(
            refundRequest.processedAt || Date.now()
          ).toLocaleDateString(),
          200,
          refundTableTop + 60
        );

      if (refundRequest.refundTransactionId) {
        doc
          .text("Refund Transaction ID:", 50, refundTableTop + 80)
          .text(refundRequest.refundTransactionId, 200, refundTableTop + 80);
      }

      // Add footer
      doc.moveDown(4);
      this.addInvoiceFooter(doc);

      // Finalize PDF
      doc.end();

      // Wait for PDF to be generated
      const pdfBuffer = await pdfPromise;

      logger.info("Credit note generated successfully", {
        orderId: order._id,
        creditNoteNumber: creditNoteNumber,
        bufferSize: pdfBuffer.length,
      });

      return {
        creditNoteNumber: creditNoteNumber,
        buffer: pdfBuffer,
        fileName: `CreditNote-${creditNoteNumber}.pdf`,
        fileSize: pdfBuffer.length,
      };
    } catch (error) {
      logger.error("Credit note generation failed", {
        orderId: order._id,
        refundRequestId: refundRequest._id,
        error: error.message,
        stack: error.stack,
      });
      throw new APIError(500, "Failed to generate credit note");
    }
  }

  /**
   * Send invoice via email
   * @param {Object} invoiceData - Invoice details with buffer
   * @param {String} recipientEmail - Recipient email address
   * @param {String} recipientName - Recipient name
   * @param {String} type - Email type: 'invoice' or 'credit_note'
   */
  async sendInvoiceEmail(
    invoiceData,
    recipientEmail,
    recipientName,
    type = "invoice"
  ) {
    try {
      const identifier =
        invoiceData.invoiceNumber || invoiceData.creditNoteNumber;
      logger.info(`Sending ${type} email`, {
        identifier: identifier,
        recipientEmail: recipientEmail,
      });

      const subject =
        type === "credit_note"
          ? `Credit Note ${invoiceData.creditNoteNumber} - TableTop`
          : `Invoice ${invoiceData.invoiceNumber} - TableTop`;

      const emailOptions = {
        to: recipientEmail,
        subject: subject,
        html:
          type === "credit_note"
            ? this.getCreditNoteEmailTemplate(recipientName, identifier)
            : this.getInvoiceEmailTemplate(recipientName, identifier),
        attachments: [
          {
            filename: invoiceData.fileName,
            content: invoiceData.buffer,
          },
        ],
      };

      await sendEmail(emailOptions);

      logger.info(`${type} email sent successfully`, {
        identifier: identifier,
        recipientEmail: recipientEmail,
      });
    } catch (error) {
      logger.error(`Failed to send ${type} email`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   * @param {String} prefix - Invoice prefix (INV/SUB/CN)
   * @param {String} id - Order or subscription ID
   * @returns {String} Invoice number
   */
  generateInvoiceNumber(prefix, id) {
    const timestamp = Date.now();
    const shortId = id.toString().slice(-8).toUpperCase();
    return `${prefix}-${timestamp}-${shortId}`;
  }

  /**
   * Add CANCELLED watermark stamp to PDF
   */
  addCancelledStamp(doc) {
    // Save the current state
    doc.save();

    // Set opacity and color for watermark
    doc.opacity(0.3);
    doc.fillColor("red");

    // Rotate and add CANCELLED text across the page
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    doc.rotate(45, { origin: [pageWidth / 2, pageHeight / 2] });
    doc
      .fontSize(80)
      .font("Helvetica-Bold")
      .text("CANCELLED", pageWidth / 2 - 200, pageHeight / 2 - 40, {
        width: 400,
        align: "center",
      });

    // Restore the state
    doc.restore();
  }

  /**
   * Add invoice header to PDF (Receipt Style)
   */
  addInvoiceHeader(doc, data) {
    const pageWidth = doc.page.width;
    const centerX = pageWidth / 2;

    // Business name in bold, centered
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(data.sellerName || "BUSINESS NAME", 50, 50, {
        width: pageWidth - 100,
        align: "center",
      });

    // Address details centered
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(data.sellerBranch || "", 50, 72, {
        width: pageWidth - 100,
        align: "center",
      })
      .text(data.sellerAddress || "1234 Main Street", 50, 85, {
        width: pageWidth - 100,
        align: "center",
      })
      .text(data.sellerPhone || "123-456-7890", 50, 98, {
        width: pageWidth - 100,
        align: "center",
      });

    // Dotted line separator
    this.addDottedLine(doc, 115);

    // Invoice number and date centered
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(`Invoice: ${data.invoiceNumber}`, 50, 125, {
        width: pageWidth - 100,
        align: "center",
      })
      .text(`Date: ${new Date(data.date).toLocaleDateString()}`, 50, 138, {
        width: pageWidth - 100,
        align: "center",
      });

    // Customer name if provided
    if (data.customerName) {
      doc.text(`Customer: ${data.customerName}`, 50, 151, {
        width: pageWidth - 100,
        align: "center",
      });
    }

    // Dotted line separator
    this.addDottedLine(doc, data.customerName ? 168 : 155);
  }

  /**
   * Add seller/company information (Receipt Style)
   */
  addSellerInfo(doc, data) {
    // Not used in receipt style - integrated into header
  }

  /**
   * Add customer information (Receipt Style)
   */
  addCustomerInfo(doc, data) {
    // Not used in receipt style - integrated into header
  }

  /**
   * Add dotted line separator
   */
  addDottedLine(doc, y) {
    const startX = 50;
    const endX = doc.page.width - 50;
    const dashLength = 3;
    const gapLength = 3;

    doc.save();
    doc.strokeColor("#000000");
    doc.lineWidth(0.5);

    let currentX = startX;
    while (currentX < endX) {
      doc.moveTo(currentX, y).lineTo(Math.min(currentX + dashLength, endX), y);
      currentX += dashLength + gapLength;
    }
    doc.stroke();
    doc.restore();
  }

  /**
   * Add order items table (Receipt Style)
   */
  addOrderItemsTable(doc, order) {
    const pageWidth = doc.page.width;
    const leftMargin = 50;
    const rightMargin = 50;
    const contentWidth = pageWidth - leftMargin - rightMargin;
    const tableRight = pageWidth - rightMargin;
    const fontSize = 7;
    const headerFontSize = 7;
    const rowHeight = 14;
    const headerHeight = 26; // taller for 2-line headers

    let currentY = 185; // Start after header

    // --- Column positions (matching screenshot layout) ---
    // Particulars | Gross value | Discount | Net value | CGST (Rs) | CGST % | SGST (Rs) | SGST % | Total
    const cols = {
      particulars: leftMargin,
      gross: leftMargin + contentWidth * 0.3,
      discount: leftMargin + contentWidth * 0.4,
      net: leftMargin + contentWidth * 0.5,
      cgstRs: leftMargin + contentWidth * 0.6,
      cgstPct: leftMargin + contentWidth * 0.68,
      sgstRs: leftMargin + contentWidth * 0.76,
      sgstPct: leftMargin + contentWidth * 0.84,
      total: leftMargin + contentWidth * 0.92,
    };
    const colWidths = {
      particulars: cols.gross - cols.particulars - 2,
      gross: cols.discount - cols.gross - 2,
      discount: cols.net - cols.discount - 2,
      net: cols.cgstRs - cols.net - 2,
      cgstRs: cols.cgstPct - cols.cgstRs - 2,
      cgstPct: cols.sgstRs - cols.cgstPct - 2,
      sgstRs: cols.sgstPct - cols.sgstRs - 2,
      sgstPct: cols.total - cols.sgstPct - 2,
      total: tableRight - cols.total,
    };

    // Helper: draw a full-width horizontal line
    const drawLine = (y, width = 0.5) => {
      doc.moveTo(leftMargin, y).lineTo(tableRight, y).lineWidth(width).stroke();
    };

    // Helper: draw vertical column lines for a row
    const drawRowBorders = (y, h) => {
      doc.lineWidth(0.5);
      // Left border
      doc
        .moveTo(leftMargin, y)
        .lineTo(leftMargin, y + h)
        .stroke();
      // Column separators
      Object.values(cols).forEach((x) => {
        doc
          .moveTo(x, y)
          .lineTo(x, y + h)
          .stroke();
      });
      // Right border
      doc
        .moveTo(tableRight, y)
        .lineTo(tableRight, y + h)
        .stroke();
    };

    // Helper: write text in a cell
    const cell = (text, x, y, w, options = {}) => {
      doc.text(String(text), x + 2, y + 3, {
        width: w - 4,
        align: options.align || "right",
        ellipsis: true,
        lineBreak: false,
      });
    };

    // === TABLE HEADER ===
    drawLine(currentY, 0.8);
    doc.fontSize(headerFontSize).font("Helvetica-Bold");

    // Two-line headers
    cell("Particulars", cols.particulars, currentY, colWidths.particulars, {
      align: "left",
    });
    cell("Gross", cols.gross, currentY, colWidths.gross);
    cell("Discount", cols.discount, currentY, colWidths.discount);
    cell("Net", cols.net, currentY, colWidths.net);
    cell("CGST", cols.cgstRs, currentY, colWidths.cgstRs);
    cell("CGST", cols.cgstPct, currentY, colWidths.cgstPct);
    cell("SGST", cols.sgstRs, currentY, colWidths.sgstRs);
    cell("SGST", cols.sgstPct, currentY, colWidths.sgstPct);
    cell("Total", cols.total, currentY, colWidths.total);

    // Second line of headers
    const headerLine2Y = currentY + 11;
    cell("", cols.particulars, headerLine2Y, colWidths.particulars);
    cell("value", cols.gross, headerLine2Y, colWidths.gross);
    cell("", cols.discount, headerLine2Y, colWidths.discount);
    cell("value", cols.net, headerLine2Y, colWidths.net);
    cell("(Rs)", cols.cgstRs, headerLine2Y, colWidths.cgstRs);
    cell("(%)", cols.cgstPct, headerLine2Y, colWidths.cgstPct);
    cell("(Rs)", cols.sgstRs, headerLine2Y, colWidths.sgstRs);
    cell("(%)", cols.sgstPct, headerLine2Y, colWidths.sgstPct);
    cell("", cols.total, headerLine2Y, colWidths.total);

    drawRowBorders(currentY, headerHeight);
    currentY += headerHeight;
    drawLine(currentY, 0.8);

    // === ITEM ROWS ===
    doc.fontSize(fontSize).font("Helvetica");

    let sumGross = 0;
    let sumDiscount = 0;
    let sumNet = 0;
    let sumCgst = 0;
    let sumSgst = 0;
    let sumTotal = 0;

    order.items.forEach((item) => {
      const itemName =
        item.foodItemName || item.foodItem?.name || item.name || "Item";
      const quantity = item.quantity || 0;
      const price = item.price || 0;
      const grossValue = quantity * price;
      const discount = item.discount || 0;
      const netValue = grossValue - discount;
      const gstRate = item.gstRate ?? 0;
      const halfRate = gstRate / 2;
      const gstAmount = item.gstAmount ?? 0;
      const cgstAmt = gstAmount / 2;
      const sgstAmt = gstAmount / 2;
      const itemTotal = netValue + gstAmount;

      sumGross += grossValue;
      sumDiscount += discount;
      sumNet += netValue;
      sumCgst += cgstAmt;
      sumSgst += sgstAmt;
      sumTotal += itemTotal;

      // Check if we need a new page
      if (currentY > doc.page.height - 160) {
        doc.addPage();
        currentY = 50;
      }

      cell(
        `${quantity} x ${itemName}`,
        cols.particulars,
        currentY,
        colWidths.particulars,
        {
          align: "left",
        }
      );
      cell(grossValue.toFixed(2), cols.gross, currentY, colWidths.gross);
      cell(discount.toFixed(2), cols.discount, currentY, colWidths.discount);
      cell(netValue.toFixed(2), cols.net, currentY, colWidths.net);
      cell(cgstAmt.toFixed(2), cols.cgstRs, currentY, colWidths.cgstRs);
      cell(`${halfRate}`, cols.cgstPct, currentY, colWidths.cgstPct);
      cell(sgstAmt.toFixed(2), cols.sgstRs, currentY, colWidths.sgstRs);
      cell(`${halfRate}`, cols.sgstPct, currentY, colWidths.sgstPct);
      cell(itemTotal.toFixed(2), cols.total, currentY, colWidths.total);

      drawRowBorders(currentY, rowHeight);
      currentY += rowHeight;
    });

    drawLine(currentY, 0.8);

    // === ITEM(S) TOTAL ROW ===
    doc.fontSize(fontSize).font("Helvetica-Bold");

    cell("Item(s) Total", cols.particulars, currentY, colWidths.particulars, {
      align: "left",
    });
    cell(sumGross.toFixed(2), cols.gross, currentY, colWidths.gross);
    cell(sumDiscount.toFixed(2), cols.discount, currentY, colWidths.discount);
    cell(sumNet.toFixed(2), cols.net, currentY, colWidths.net);
    cell(sumCgst.toFixed(2), cols.cgstRs, currentY, colWidths.cgstRs);
    cell("", cols.cgstPct, currentY, colWidths.cgstPct);
    cell(sumSgst.toFixed(2), cols.sgstRs, currentY, colWidths.sgstRs);
    cell("", cols.sgstPct, currentY, colWidths.sgstPct);
    cell(sumTotal.toFixed(2), cols.total, currentY, colWidths.total);

    drawRowBorders(currentY, rowHeight);
    currentY += rowHeight;
    drawLine(currentY, 0.5);

    // === SERVICE CHARGE / PACKAGING ROW ===
    const serviceCharge = order.serviceCharge || 0;
    if (serviceCharge > 0) {
      doc.fontSize(fontSize).font("Helvetica");
      // Service charge may also have GST (5% standard for restaurant services)
      const scGstRate = 5;
      const scHalfRate = scGstRate / 2;
      const scNet = serviceCharge / (1 + scGstRate / 100);
      const scGst = serviceCharge - scNet;
      const scCgst = scGst / 2;
      const scSgst = scGst / 2;

      cell(
        "Restaurant Packaging Charge",
        cols.particulars,
        currentY,
        colWidths.particulars,
        {
          align: "left",
        }
      );
      cell(scNet.toFixed(2), cols.gross, currentY, colWidths.gross);
      cell("0", cols.discount, currentY, colWidths.discount);
      cell(scNet.toFixed(2), cols.net, currentY, colWidths.net);
      cell(scCgst.toFixed(2), cols.cgstRs, currentY, colWidths.cgstRs);
      cell(`${scHalfRate}`, cols.cgstPct, currentY, colWidths.cgstPct);
      cell(scSgst.toFixed(2), cols.sgstRs, currentY, colWidths.sgstRs);
      cell(`${scHalfRate}`, cols.sgstPct, currentY, colWidths.sgstPct);
      cell(serviceCharge.toFixed(2), cols.total, currentY, colWidths.total);

      drawRowBorders(currentY, rowHeight);
      currentY += rowHeight;
      drawLine(currentY, 0.5);
    }

    // === DISCOUNT ROWS (coin/offer) ===
    const coinDiscount = order.coinDiscount || 0;
    const offerDiscount = order.offerDiscount || 0;

    if (coinDiscount > 0) {
      doc.fontSize(fontSize).font("Helvetica");
      cell("Coin Discount", cols.particulars, currentY, colWidths.particulars, {
        align: "left",
      });
      cell(
        `-${coinDiscount.toFixed(2)}`,
        cols.total,
        currentY,
        colWidths.total
      );
      drawRowBorders(currentY, rowHeight);
      currentY += rowHeight;
      drawLine(currentY, 0.5);
    }

    if (offerDiscount > 0) {
      doc.fontSize(fontSize).font("Helvetica");
      cell(
        "Offer Discount",
        cols.particulars,
        currentY,
        colWidths.particulars,
        {
          align: "left",
        }
      );
      cell(
        `-${offerDiscount.toFixed(2)}`,
        cols.total,
        currentY,
        colWidths.total
      );
      drawRowBorders(currentY, rowHeight);
      currentY += rowHeight;
      drawLine(currentY, 0.5);
    }

    // === TOTAL VALUE ROW ===
    const totalPrice = order.totalPrice || 0;
    const taxes = order.taxes || 0;
    const totalCgst =
      sumCgst +
      (serviceCharge > 0 ? (serviceCharge - serviceCharge / 1.05) / 2 : 0);
    const totalSgst = totalCgst;

    doc.fontSize(fontSize).font("Helvetica-Bold");

    cell("Total Value", cols.particulars, currentY, colWidths.particulars, {
      align: "left",
    });
    cell(
      (sumGross + (serviceCharge > 0 ? serviceCharge / 1.05 : 0)).toFixed(2),
      cols.gross,
      currentY,
      colWidths.gross
    );
    cell(
      (sumDiscount + coinDiscount + offerDiscount).toFixed(2),
      cols.discount,
      currentY,
      colWidths.discount
    );
    cell(
      (
        sumNet +
        (serviceCharge > 0 ? serviceCharge / 1.05 : 0) -
        coinDiscount -
        offerDiscount
      ).toFixed(2),
      cols.net,
      currentY,
      colWidths.net
    );
    cell(totalCgst.toFixed(2), cols.cgstRs, currentY, colWidths.cgstRs);
    cell("", cols.cgstPct, currentY, colWidths.cgstPct);
    cell(totalSgst.toFixed(2), cols.sgstRs, currentY, colWidths.sgstRs);
    cell("", cols.sgstPct, currentY, colWidths.sgstPct);
    cell(totalPrice.toFixed(2), cols.total, currentY, colWidths.total);

    drawRowBorders(currentY, rowHeight);
    currentY += rowHeight;
    drawLine(currentY, 0.8);

    currentY += 8;

    // === AMOUNT IN WORDS ===
    const amountWords = this.numberToWords(totalPrice);
    doc.fontSize(8).font("Helvetica-Bold");
    doc.text(`Amount in words: `, leftMargin, currentY, { continued: true });
    doc.font("Helvetica-Oblique").text(amountWords);

    currentY += 18;

    // Dotted line separator
    this.addDottedLine(doc, currentY);
    currentY += 15;

    // --- Payment Breakdown (for supplementary orders) ---
    const labelX = leftMargin;
    const valueX = pageWidth - rightMargin - 80;
    const valueW = 80;

    const suppPayments = order.supplementaryPayments || [];
    const paidSuppPayments = suppPayments.filter(
      (sp) => sp.paymentStatus === "paid"
    );

    if (paidSuppPayments.length > 0) {
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Payment Breakdown", labelX, currentY);
      currentY += 16;

      doc.fontSize(9).font("Helvetica");

      // Original payment
      const originalAmount =
        totalPrice - paidSuppPayments.reduce((s, sp) => s + sp.amount, 0);
      doc.text("Payment 1 (original):", labelX + 10, currentY);
      doc.text(`₹${originalAmount.toFixed(2)}`, valueX, currentY, {
        width: valueW,
        align: "right",
      });
      currentY += 14;

      // Supplementary payments
      paidSuppPayments.forEach((sp, i) => {
        doc.text(
          `Payment ${i + 2} (batch ${sp.batch}):`,
          labelX + 10,
          currentY
        );
        doc.text(`₹${sp.amount.toFixed(2)}`, valueX, currentY, {
          width: valueW,
          align: "right",
        });
        currentY += 14;
      });

      // Total collected
      currentY += 4;
      doc
        .moveTo(labelX + 10, currentY)
        .lineTo(pageWidth - rightMargin, currentY)
        .lineWidth(0.5)
        .stroke();
      currentY += 6;

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Total Collected:", labelX + 10, currentY);
      const totalCollected =
        originalAmount + paidSuppPayments.reduce((s, sp) => s + sp.amount, 0);
      doc.text(`₹${totalCollected.toFixed(2)}`, valueX, currentY, {
        width: valueW,
        align: "right",
      });
      currentY += 20;

      // Dotted line separator
      this.addDottedLine(doc, currentY);
      currentY += 15;
    }

    // Coins earned
    if (order.rewardCoins > 0) {
      doc
        .fontSize(8)
        .font("Helvetica")
        .text(`Reward Coins Earned: ${order.rewardCoins}`, 50, currentY, {
          width: pageWidth - 100,
          align: "center",
        });
      currentY += 15;
    }

    return currentY;
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
   * Add payment information (Receipt Style)
   */
  addPaymentInfo(doc, data, currentY) {
    const pageWidth = doc.page.width;

    // Payment method
    doc.fontSize(9).font("Helvetica");
    doc.text("Paid By:", 50, currentY);
    doc.text(data.paymentMethod || "Online", pageWidth - 50 - 70, currentY, {
      width: 70,
      align: "right",
    });

    currentY += 20;

    // Transaction date and time
    if (data.paidAt) {
      const paidDate = new Date(data.paidAt);
      const dateStr = paidDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
      const timeStr = paidDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      doc.fontSize(8).font("Helvetica");
      doc.text(`${dateStr} ${timeStr}`, 50, currentY, {
        width: pageWidth - 100,
        align: "left",
      });
      currentY += 12;
    }

    // Transaction ID
    if (data.transactionId || data.razorpayPaymentId) {
      const txnId = data.transactionId || data.razorpayPaymentId || "N/A";
      doc.text(`Transaction ID: ${txnId.slice(0, 20)}`, 50, currentY, {
        width: pageWidth - 100,
        align: "left",
      });
      currentY += 12;
    }

    // Order ID
    if (data.orderId) {
      doc.text(`Order ID: ${data.orderId}`, 50, currentY, {
        width: pageWidth - 100,
        align: "left",
      });
      currentY += 12;
    }

    currentY += 10;

    // Dotted line separator
    this.addDottedLine(doc, currentY);

    return currentY + 15;
  }

  /**
   * Convert a number to words (Indian Rupees format)
   */
  numberToWords(num) {
    if (num === 0) return "Rupees Zero Only";

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const numToWords = (n) => {
      if (n === 0) return "";
      if (n < 20) return ones[n];
      if (n < 100)
        return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      if (n < 1000)
        return (
          ones[Math.floor(n / 100)] +
          " Hundred" +
          (n % 100 ? " and " + numToWords(n % 100) : "")
        );
      if (n < 100000)
        return (
          numToWords(Math.floor(n / 1000)) +
          " Thousand" +
          (n % 1000 ? " " + numToWords(n % 1000) : "")
        );
      if (n < 10000000)
        return (
          numToWords(Math.floor(n / 100000)) +
          " Lakh" +
          (n % 100000 ? " " + numToWords(n % 100000) : "")
        );
      return (
        numToWords(Math.floor(n / 10000000)) +
        " Crore" +
        (n % 10000000 ? " " + numToWords(n % 10000000) : "")
      );
    };

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    let result = "Rupees " + numToWords(rupees);
    if (paise > 0) {
      result += " and " + numToWords(paise) + " Paise";
    }
    result += " Only";
    return result;
  }

  /**
   * Add invoice footer (Receipt Style)
   */
  addInvoiceFooter(doc, currentY) {
    const pageWidth = doc.page.width;

    // Thank you message centered
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Thank You For Supporting", 50, currentY, {
      width: pageWidth - 100,
      align: "center",
    });

    currentY += 15;

    doc.text("Local Business!", 50, currentY, {
      width: pageWidth - 100,
      align: "center",
    });

    return currentY;
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
   * Get credit note email template
   */
  getCreditNoteEmailTemplate(recipientName, creditNoteNumber) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 10px 20px; background-color: #e74c3c; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Credit Note Generated</h1>
          </div>
          <div class="content">
            <p>Dear ${recipientName},</p>
            <p>Your credit note <strong>${creditNoteNumber}</strong> has been generated for your refund.</p>
            <p>Please find the credit note attached to this email for your records.</p>
            <p>The refund will be processed according to the original payment method.</p>
            <p>If you have any questions or concerns regarding this credit note, please don't hesitate to contact our support team.</p>
            <p>Thank you for your understanding!</p>
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
