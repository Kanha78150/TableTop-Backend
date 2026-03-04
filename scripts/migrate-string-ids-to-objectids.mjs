/**
 * Migration Script: Convert string hotel/branch IDs to MongoDB ObjectIds
 *
 * Problem: Some FoodCategory and FoodItem documents have `hotel` and `branch`
 * fields stored as strings (e.g. "HTL-2025-00001", "BRN-HTL001-00001") instead
 * of MongoDB ObjectIds. This happens when updateCategory / updateFoodItem use
 * findByIdAndUpdate() which bypasses mongoose pre-validate hooks.
 *
 * This script finds all such documents and converts them to proper ObjectIds.
 *
 * Usage:  node scripts/migrate-string-ids-to-objectids.mjs
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

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

const db = mongoose.connection.db;

// ── Helper: check if a value is NOT already an ObjectId ──────────────────────
const isStringId = (val) =>
  typeof val === "string" && !mongoose.Types.ObjectId.isValid(val);

const isNonObjectId = (val) =>
  val && typeof val === "string" && !/^[0-9a-fA-F]{24}$/.test(val);

// ── Build lookup maps ────────────────────────────────────────────────────────
console.log("\n📋 Building Hotel & Branch lookup maps...");

const hotels = await db
  .collection("hotels")
  .find({}, { projection: { _id: 1, hotelId: 1 } })
  .toArray();
const hotelMap = new Map(); // "HTL-2025-00001" → ObjectId
for (const h of hotels) {
  if (h.hotelId) hotelMap.set(h.hotelId, h._id);
}
console.log(`   Hotels loaded: ${hotelMap.size}`);

const branches = await db
  .collection("branches")
  .find({}, { projection: { _id: 1, branchId: 1 } })
  .toArray();
const branchMap = new Map(); // "BRN-HTL001-00001" → ObjectId
for (const b of branches) {
  if (b.branchId) branchMap.set(b.branchId, b._id);
}
console.log(`   Branches loaded: ${branchMap.size}`);

// ── Migrate a collection ─────────────────────────────────────────────────────
async function migrateCollection(collectionName) {
  const col = db.collection(collectionName);

  // Find documents where hotel or branch is a string that looks like an
  // auto-generated ID (not a 24-char hex ObjectId string).
  const docs = await col
    .find({
      $or: [{ hotel: { $type: "string" } }, { branch: { $type: "string" } }],
    })
    .toArray();

  if (docs.length === 0) {
    console.log(`   ✅ ${collectionName}: No documents need migration`);
    return { total: 0, fixed: 0, failed: 0 };
  }

  console.log(
    `   🔍 ${collectionName}: ${docs.length} documents with string IDs`
  );

  let fixed = 0;
  let failed = 0;

  for (const doc of docs) {
    const updates = {};
    const issues = [];

    // ── hotel field ──
    if (doc.hotel && typeof doc.hotel === "string") {
      if (/^[0-9a-fA-F]{24}$/.test(doc.hotel)) {
        // Already a valid ObjectId string — just cast it
        updates.hotel = new mongoose.Types.ObjectId(doc.hotel);
      } else if (hotelMap.has(doc.hotel)) {
        updates.hotel = hotelMap.get(doc.hotel);
      } else {
        issues.push(`hotel "${doc.hotel}" not found in hotels collection`);
      }
    }

    // ── branch field ──
    if (doc.branch && typeof doc.branch === "string") {
      if (/^[0-9a-fA-F]{24}$/.test(doc.branch)) {
        updates.branch = new mongoose.Types.ObjectId(doc.branch);
      } else if (branchMap.has(doc.branch)) {
        updates.branch = branchMap.get(doc.branch);
      } else {
        issues.push(`branch "${doc.branch}" not found in branches collection`);
      }
    }

    if (issues.length > 0) {
      console.log(
        `   ⚠️  ${collectionName} doc ${doc._id}: ${issues.join(", ")}`
      );
      failed++;
      continue;
    }

    if (Object.keys(updates).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: updates });
      fixed++;
    }
  }

  console.log(
    `   ✅ ${collectionName}: ${fixed} fixed, ${failed} failed out of ${docs.length}`
  );
  return { total: docs.length, fixed, failed };
}

// ── Run migrations ───────────────────────────────────────────────────────────
console.log("\n🚀 Starting migration...\n");

const categoryResult = await migrateCollection("foodcategories");
const foodItemResult = await migrateCollection("fooditems");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════");
console.log("  Migration Summary");
console.log("═══════════════════════════════════════════");
console.log(
  `  FoodCategories : ${categoryResult.fixed}/${categoryResult.total} fixed`
);
console.log(
  `  FoodItems      : ${foodItemResult.fixed}/${foodItemResult.total} fixed`
);
const totalFailed = categoryResult.failed + foodItemResult.failed;
if (totalFailed > 0) {
  console.log(
    `  ⚠️  ${totalFailed} documents could not be resolved — review warnings above`
  );
}
console.log("═══════════════════════════════════════════\n");

await mongoose.disconnect();
console.log("✅ Disconnected from MongoDB. Done!");
process.exit(0);
