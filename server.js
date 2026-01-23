// server.js
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";

import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import assignmentSystemInit from "./src/services/assignmentSystemInit.js";
import scheduledJobsService from "./src/services/scheduledJobs.js";
import { startAllJobs } from "./src/services/subscriptionJobs.js";
import { emailQueueService } from "./src/services/emailQueueService.js";
import { setupComplaintEvents } from "./src/socket/complaintEvents.js";
import { setupOrderEvents } from "./src/socket/socketHandler.js";
import socketAuthMiddleware from "./src/middleware/socket.auth.middleware.js";
import { setIO } from "./src/utils/socketService.js";
import { logger } from "./src/utils/logger.js";
import {
  validateEnvironment,
  printEnvironmentSummary,
} from "./src/utils/validateEnv.js";

/* ---------------- ENV SETUP ---------------- */
dotenv.config();
console.log("🔧 Starting Hotel Management Backend...");
console.log("📍 Node:", process.version);

/* ---------------- ENV VALIDATION ---------------- */
try {
  const valid = validateEnvironment();
  if (valid) printEnvironmentSummary();
} catch (err) {
  console.warn("⚠️ Env validation warning:", err.message);
}

/* ---------------- SERVER SETUP ---------------- */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

/* ---------------- SOCKET.IO ---------------- */
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
});

// Register socket authentication middleware
io.use(socketAuthMiddleware);
console.log("🔒 Socket authentication middleware registered");

// Setup socket event handlers
setupComplaintEvents(io);
setupOrderEvents(io);
console.log("📡 Socket event handlers initialized (complaints & orders)");

// Set global socket instance
setIO(io);

io.on("connection", (socket) => {
  const userData = socket.data.user;
  console.log(
    `⚡ Socket connected: ${socket.id} - ${userData?.userModel || "Unknown"} ${userData?.name || "N/A"}`
  );
  socket.on("disconnect", () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

/* ---------------- INITIALIZATION FLAGS ---------------- */
let isDbConnected = false;

/* ---------------- BACKGROUND INITIALIZATION ---------------- */
const initializeBackgroundServices = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database not connected");
    }

    await assignmentSystemInit.initialize({
      skipDataValidation: false,
      skipTimeTracker: false,
      autoRepairData: true,
    });
    logger.info("✅ Assignment system initialized");

    await scheduledJobsService.initialize();
    logger.info("✅ Scheduled jobs initialized");

    if (process.env.ENABLE_SUBSCRIPTION_JOBS !== "false") {
      startAllJobs();
      logger.info("✅ Subscription jobs started");
    }

    if (process.env.ENABLE_EMAIL_QUEUE !== "false") {
      emailQueueService.startQueueProcessor();
      logger.info("✅ Email queue started");
    }

    console.log("✅ ALL BACKGROUND SERVICES READY");
  } catch (error) {
    logger.error("❌ Background initialization failed:", error);
  }
};

/* ---------------- START SERVER (CORRECT WAY) ---------------- */
const startServer = async () => {
  try {
    // 🔴 THIS IS THE KEY FIX
    await connectDB();
    isDbConnected = true;

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health: http://localhost:${PORT}/health`);
    });

    // Start background services AFTER DB is ready
    initializeBackgroundServices();
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

/* ---------------- GRACEFUL SHUTDOWN ---------------- */
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down...");
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});
