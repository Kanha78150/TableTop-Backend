import mongoose from "mongoose";
import { APIError } from "../utils/APIError.js";

/**
 * Middleware to check if database is connected before processing requests
 */
export const ensureDbReady = (req, res, next) => {
  const dbStatus = mongoose.connection.readyState;

  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (dbStatus !== 1) {
    return res.status(503).json({
      success: false,
      message:
        "Service temporarily unavailable. Database is still initializing. Please try again in a few seconds.",
      error: {
        code: "DB_NOT_READY",
        status: dbStatus === 2 ? "connecting" : "disconnected",
      },
    });
  }

  next();
};
