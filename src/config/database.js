// MongoDB connection
import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(`${process.env.MONGO_URI}/${DB_NAME}`, {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Connected !! DB HOST: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    throw error; // Re-throw to allow caller to handle
  }
};

export default connectDB;
