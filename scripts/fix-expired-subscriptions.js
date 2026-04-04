/**
 * Migration Script: Fix Expired Subscriptions
 *
 * This script finds all subscriptions that have status "active" but their
 * endDate has already passed, and updates them to status "expired".
 *
 * Usage:
 *   node scripts/fix-expired-subscriptions.js
 *
 * Make sure your .env file has MONGO_URI set before running.
 */

import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set in environment variables.");
  process.exit(1);
}

async function run() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      family: 4,
      serverSelectionTimeoutMS: 30000,
    });
    console.log("✅ Connected to MongoDB.\n");

    const db = mongoose.connection.db;
    const collection = db.collection("adminsubscriptions");

    const now = new Date();

    // 1. Preview — find all affected documents
    const expiredDocs = await collection
      .find({ status: "active", endDate: { $lt: now } })
      .project({ _id: 1, admin: 1, status: 1, endDate: 1 })
      .toArray();

    if (expiredDocs.length === 0) {
      console.log("✅ No stale subscriptions found. Database is up to date.");
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(
      `⚠️  Found ${expiredDocs.length} subscription(s) with status "active" but endDate in the past:\n`
    );

    for (const doc of expiredDocs) {
      console.log(
        `   _id: ${doc._id}  |  admin: ${doc.admin}  |  endDate: ${doc.endDate.toISOString()}`
      );
    }

    console.log();

    // 2. Update all affected documents
    const result = await collection.updateMany(
      { status: "active", endDate: { $lt: now } },
      {
        $set: {
          status: "expired",
          lastUpdated: now,
        },
      }
    );

    console.log(
      `✅ Updated ${result.modifiedCount} subscription(s) from "active" → "expired".`
    );

    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
