// MongoDB connection
import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is not set!");
    }

    const conn = await mongoose.connect(`${process.env.MONGO_URI}/${DB_NAME}`, {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000,
    });
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    console.error("❌ Full error:", error);
    throw error; // Re-throw to allow caller to handle
  }
};

export default connectDB;
