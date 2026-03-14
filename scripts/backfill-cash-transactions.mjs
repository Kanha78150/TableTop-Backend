/**
 * Migration Script: Backfill Transaction records for cash orders
 *
 * Problem: Cash orders that were confirmed (paid) before the fix never got a
 * Transaction record created. This means they don't appear in the accounting
 * API when filtering by paymentMethod=cash.
 *
 * This script finds all paid cash orders without a matching Transaction record
 * and creates one for each.
 *
 * Usage:  node scripts/backfill-cash-transactions.mjs
 *         node scripts/backfill-cash-transactions.mjs --dry-run
 */

import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

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
console.log("✅ Connected to MongoDB");

if (DRY_RUN) {
  console.log("🔍 DRY RUN — no records will be created\n");
}

// ── Collections ──────────────────────────────────────────────────────────────
const ordersCol = mongoose.connection.collection("orders");
const txnCol = mongoose.connection.collection("transactions");

function generateTransactionId() {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `TXN-${year}-${randomHex}`;
}

// ── Find paid cash orders ────────────────────────────────────────────────────
const cashOrders = await ordersCol
  .find({
    "payment.paymentMethod": "cash",
    "payment.paymentStatus": "paid",
  })
  .project({
    _id: 1,
    user: 1,
    hotel: 1,
    branch: 1,
    totalPrice: 1,
    payment: 1,
    createdAt: 1,
  })
  .toArray();

console.log(`📋 Found ${cashOrders.length} paid cash orders total`);

// ── Check which already have a Transaction ───────────────────────────────────
const orderIds = cashOrders.map((o) => o._id);
const existingTxns = await txnCol
  .find({ order: { $in: orderIds } })
  .project({ order: 1 })
  .toArray();

const existingOrderIds = new Set(existingTxns.map((t) => t.order.toString()));

const missingOrders = cashOrders.filter(
  (o) => !existingOrderIds.has(o._id.toString())
);

console.log(
  `✅ ${existingTxns.length} already have Transaction records (skipped)`
);
console.log(`⚠️  ${missingOrders.length} need backfilling\n`);

if (missingOrders.length === 0) {
  console.log("🎉 Nothing to do — all cash orders already have transactions!");
  await mongoose.disconnect();
  process.exit(0);
}

// ── Create missing Transaction records ───────────────────────────────────────
let created = 0;
let failed = 0;

for (const order of missingOrders) {
  const txnData = {
    user: order.user,
    order: order._id,
    hotel: order.hotel,
    branch: order.branch,
    amount: order.totalPrice,
    paymentMethod: "cash",
    provider: "cash",
    status: "success",
    transactionId: order.payment?.transactionId || generateTransactionId(),
    createdAt:
      order.payment?.paidAt ||
      order.payment?.cashConfirmedAt ||
      order.createdAt,
    updatedAt:
      order.payment?.paidAt ||
      order.payment?.cashConfirmedAt ||
      order.createdAt,
  };

  if (DRY_RUN) {
    console.log(
      `  [DRY] Order ${order._id} → would create Transaction ₹${txnData.amount} (${txnData.transactionId})`
    );
    created++;
    continue;
  }

  try {
    await txnCol.insertOne(txnData);
    console.log(
      `  ✅ Order ${order._id} → Transaction created ₹${txnData.amount} (${txnData.transactionId})`
    );
    created++;
  } catch (err) {
    console.error(`  ❌ Order ${order._id} → Error: ${err.message}`);
    failed++;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`Migration complete${DRY_RUN ? " (DRY RUN)" : ""}`);
console.log(`  Created: ${created}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${existingTxns.length} (already existed)`);
console.log(`${"═".repeat(60)}`);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
