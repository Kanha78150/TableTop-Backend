// MongoDB connection
import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";

const connectDB = async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    console.log("📍 MONGO_URI present:", !!process.env.MONGO_URI);
    console.log("📍 DB_NAME:", DB_NAME);

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not set!");
    }

    const conn = await mongoose.connect(
      `${process.env.MONGO_URI}/${DB_NAME}?retryWrites=true&w=majority`,
      {
        serverSelectionTimeoutMS: 30000, // 30 seconds for Cloud Run
        socketTimeoutMS: 45000,
        family: 4, // Force IPv4 (Cloud Run compatibility)
        maxPoolSize: 10,
        minPoolSize: 1,
      }
    );
    console.log(`✅ MongoDB Connected !! DB HOST: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    console.error("❌ Full error:", error);
    throw error; // Re-throw to allow caller to handle
  }
};

export default connectDB;
