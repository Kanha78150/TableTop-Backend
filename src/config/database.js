// src/config/database.js
import mongoose from "mongoose";

const connectDB = async (retries = 5) => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("❌ MONGO_URI is not set");
    }

    console.log("🔌 Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI, {
      family: 4, // 🔑 IMPORTANT for Windows
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 60000, // ⬅️ increase to 60s
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
    });

    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);

    if (retries <= 0) {
      console.error("❌ No retries left. Exiting.");
      throw error;
    }

    console.log(`🔁 Retrying MongoDB connection (${retries})...`);
    await new Promise((res) => setTimeout(res, 5000));
    return connectDB(retries - 1);
  }
};

/* 🔁 MongoDB lifecycle logs */
mongoose.connection.on("connected", () => {
  console.log("🟢 MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("🔴 MongoDB error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("🟠 MongoDB disconnected");
});

/* 🔚 Graceful shutdown */
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🔴 MongoDB connection closed (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("🔴 MongoDB connection closed (SIGTERM)");
  process.exit(0);
});

export default connectDB;
