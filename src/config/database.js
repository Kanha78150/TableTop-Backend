// src/config/database.js
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("❌ MONGO_URI is not set");
    }

    console.log("🔌 Connecting to MongoDB...");

    const conn = await mongoose.connect(
      `${process.env.MONGO_URI}?retryWrites=true&w=majority`,
      {
        maxPoolSize: 5,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 20000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 20000,
        heartbeatFrequencyMS: 10000,
      }
    );

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    throw error;
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
