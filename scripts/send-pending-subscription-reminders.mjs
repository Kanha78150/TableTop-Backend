/**
 * Migration Script: Send pending subscription renewal reminder emails
 *
 * Problem: The subscription renewal reminder cron job had a broken import path
 * and missing FRONTEND_URL fallback, so admins with expiring subscriptions
 * never received their 7-day, 3-day, or 1-day reminder emails.
 *
 * This script finds all active subscriptions expiring within the next 7 days
 * and sends the appropriate reminder email to each admin.
 *
 * Usage:
 *   node scripts/send-pending-subscription-reminders.mjs               # send reminders
 *   node scripts/send-pending-subscription-reminders.mjs --dry-run     # preview only
 *   node scripts/send-pending-subscription-reminders.mjs --delay=2000  # ms delay between emails
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
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
console.log(`⏱  Delay: ${DELAY_MS}ms between emails\n`);

// ── Import models & email function (after connection) ────────────────────────
// Register referenced models so .populate() works
await import("../src/models/Admin.model.js");
await import("../src/models/SubscriptionPlan.model.js");

const { AdminSubscription } =
  await import("../src/models/AdminSubscription.model.js");
const { sendSubscriptionRenewalReminderEmail } =
  await import("../src/utils/emailService.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Find active subscriptions expiring within the next 7 days ────────────────
const today = new Date();
today.setHours(0, 0, 0, 0);

const sevenDaysFromNow = new Date(today);
sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 8); // +8 to include day 7 fully

const expiringSubscriptions = await AdminSubscription.find({
  status: "active",
  endDate: {
    $gte: today,
    $lt: sevenDaysFromNow,
  },
}).populate("admin plan");

console.log(
  `📋 Found ${expiringSubscriptions.length} active subscriptions expiring within the next 7 days\n`
);

if (expiringSubscriptions.length === 0) {
  console.log("🎉 No subscriptions expiring soon — nothing to do!");
  await mongoose.disconnect();
  process.exit(0);
}

// ── Process each subscription ────────────────────────────────────────────────
let sent = 0;
let skipped = 0;
let failed = 0;

for (const subscription of expiringSubscriptions) {
  const adminEmail = subscription.admin?.email;
  const adminName = subscription.admin?.name;
  const planName = subscription.plan?.name;
  const endDate = subscription.endDate;
  const subId = subscription._id.toString();

  // Calculate days remaining
  const daysRemaining = Math.ceil(
    (endDate - new Date()) / (1000 * 60 * 60 * 24)
  );

  // Skip if admin has no email
  if (!adminEmail) {
    console.log(`  ⏭  Subscription ${subId} — no admin email, skipping`);
    skipped++;
    continue;
  }

  // Skip if plan is not populated
  if (!planName) {
    console.log(`  ⏭  Subscription ${subId} — plan not found, skipping`);
    skipped++;
    continue;
  }

  console.log(
    `  📧 ${adminEmail} — "${planName}" expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} (${endDate.toLocaleDateString()})`
  );

  if (DRY_RUN) {
    sent++;
    continue;
  }

  try {
    await sendSubscriptionRenewalReminderEmail(
      adminEmail,
      adminName,
      planName,
      endDate,
      daysRemaining
    );
    console.log(`     ✅ Reminder sent`);
    sent++;
  } catch (err) {
    console.error(`     ❌ Failed: ${err.message}`);
    failed++;
  }

  // Throttle to avoid overwhelming the SMTP server
  if (DELAY_MS > 0) {
    await sleep(DELAY_MS);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`Migration complete${DRY_RUN ? " (DRY RUN)" : ""}`);
console.log(`  Sent:    ${sent}`);
console.log(`  Skipped: ${skipped} (no email or plan missing)`);
console.log(`  Failed:  ${failed}`);
console.log(`${"═".repeat(60)}`);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
