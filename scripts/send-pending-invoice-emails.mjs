/**
 * Migration Script: Send pending invoice emails for completed & paid orders
 *
 * Problem: Orders that were completed and paid before the invoice-on-completion
 * fix never received an invoice email. Their invoiceEmailStatus is either
 * "pending", "failed", or "generation_failed".
 *
 * This script finds all such orders, generates the invoice PDF, and sends
 * the email to the user. Failed sends are queued in EmailQueue for retry.
 *
 * Usage:
 *   node scripts/send-pending-invoice-emails.mjs                 # send all pending
 *   node scripts/send-pending-invoice-emails.mjs --dry-run       # preview only
 *   node scripts/send-pending-invoice-emails.mjs --batch=50      # custom batch size
 *   node scripts/send-pending-invoice-emails.mjs --delay=2000    # ms delay between emails
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = parseInt(
  process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] || "50",
  10
);
const DELAY_MS = parseInt(
  process.argv.find((a) => a.startsWith("--delay="))?.split("=")[1] || "1000",
  10
);

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env");
  process.exit(1);
}

// ── Connect ──────────────────────────────────────────────────────────────────
await mongoose.connect(MONGO_URI, {
  family: 4,
  serverSelectionTimeoutMS: 30000,
});
console.log("✅ Connected to MongoDB\n");

if (DRY_RUN) {
  console.log("🔍 DRY RUN — no emails will be sent\n");
}
console.log(`📦 Batch size: ${BATCH_SIZE}  |  ⏱  Delay: ${DELAY_MS}ms\n`);

// ── Import models & services (after connection) ─────────────────────────────
// Register referenced models so .populate() works
await import("../src/models/User.model.js");
await import("../src/models/Hotel.model.js");
await import("../src/models/Branch.model.js");
await import("../src/models/FoodItem.model.js");

const { Order } = await import("../src/models/Order.model.js");
const { EmailQueue } = await import("../src/models/EmailQueue.model.js");
const { invoiceService } = await import("../src/services/invoice.service.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Find eligible orders ─────────────────────────────────────────────────────
// Orders that are completed + paid but have no successful invoice email
const pendingOrders = await Order.find({
  status: "completed",
  "payment.paymentStatus": "paid",
  invoiceEmailStatus: { $in: ["pending", "failed", "generation_failed"] },
})
  .populate("user", "name email phone")
  .populate("hotel", "name email contactNumber gstin")
  .populate("branch", "name email contactNumber address")
  .populate("items.foodItem", "name price")
  .sort({ createdAt: -1 })
  .limit(BATCH_SIZE)
  .lean(false); // need full mongoose docs for .save()

console.log(
  `📋 Found ${pendingOrders.length} completed+paid orders with pending invoice emails\n`
);

if (pendingOrders.length === 0) {
  console.log(
    "🎉 Nothing to do — all eligible orders already have invoice emails sent!"
  );
  await mongoose.disconnect();
  process.exit(0);
}

// ── Process each order ───────────────────────────────────────────────────────
let sent = 0;
let queued = 0;
let skipped = 0;
let failed = 0;

for (const order of pendingOrders) {
  const orderId = order._id.toString();
  const userEmail = order.user?.email;

  // Skip orders without a user email
  if (!userEmail) {
    console.log(`  ⏭  Order ${orderId} — no user email, marking as no_email`);
    if (!DRY_RUN) {
      order.invoiceEmailStatus = "no_email";
      await order.save();
    }
    skipped++;
    continue;
  }

  console.log(`  📧 Order ${orderId} → ${userEmail} (₹${order.totalPrice})`);

  if (DRY_RUN) {
    sent++;
    continue;
  }

  try {
    // Generate invoice number if missing
    if (!order.invoiceNumber) {
      const invoiceNumber = `INV-${Date.now()}-${orderId.slice(-8).toUpperCase()}`;
      order.invoiceNumber = invoiceNumber;
      order.invoiceGeneratedAt = new Date();
      order.invoiceSnapshot = {
        hotelName: order.hotel?.name || "Hotel Name",
        hotelEmail: order.hotel?.email || "",
        hotelPhone: order.hotel?.contactNumber || "",
        hotelGSTIN: order.hotel?.gstin || "",
        branchName: order.branch?.name || "Branch Name",
        branchAddress: order.branch?.address || "",
        branchPhone: order.branch?.contactNumber || "",
        branchEmail: order.branch?.email || "",
        customerName: order.user?.name || "Guest",
        customerEmail: order.user?.email || "",
        customerPhone: order.user?.phone || "",
        tableNumber: order.tableNumber || "",
      };
    }

    // Generate invoice PDF
    const invoice = await invoiceService.generateOrderInvoice(order, {
      showCancelledStamp: false,
    });

    // Send email
    try {
      await invoiceService.sendInvoiceEmail(
        invoice,
        userEmail,
        order.user.name,
        "invoice"
      );
      order.invoiceEmailStatus = "sent";
      await order.save();
      console.log(`     ✅ Sent (${order.invoiceNumber})`);
      sent++;
    } catch (emailError) {
      console.log(
        `     ⚠️  Email send failed, queuing for retry: ${emailError.message}`
      );

      // Queue for retry via EmailQueue
      await EmailQueue.create({
        type: "invoice",
        orderId: order._id,
        recipientEmail: userEmail,
        recipientName: order.user.name,
        status: "pending",
        emailData: {
          subject: `Invoice ${order.invoiceNumber} - TableTop`,
          invoiceNumber: order.invoiceNumber,
          amount: order.totalPrice,
        },
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
      });

      order.invoiceEmailStatus = "failed";
      order.invoiceEmailAttempts = (order.invoiceEmailAttempts || 0) + 1;
      await order.save();
      queued++;
    }
  } catch (err) {
    console.error(`     ❌ Failed: ${err.message}`);
    failed++;
  }

  // Throttle to avoid overwhelming the SMTP server
  if (DELAY_MS > 0) {
    await sleep(DELAY_MS);
  }
}

// ── Also check existing EmailQueue for stuck entries ─────────────────────────
const stuckQueueCount = await EmailQueue.countDocuments({
  type: "invoice",
  status: { $in: ["pending", "failed"] },
  attempts: { $lt: 3 },
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`Migration complete${DRY_RUN ? " (DRY RUN)" : ""}`);
console.log(`  Sent:    ${sent}`);
console.log(`  Queued:  ${queued} (failed to send, added to EmailQueue)`);
console.log(`  Skipped: ${skipped} (no email on user)`);
console.log(`  Failed:  ${failed} (invoice generation error)`);
if (stuckQueueCount > 0) {
  console.log(
    `  📬 ${stuckQueueCount} invoice emails still pending in EmailQueue (will be retried automatically)`
  );
}
console.log(`${"═".repeat(60)}`);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
