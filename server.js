// server.js
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";

import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import assignmentSystemInit from "./src/services/assignmentSystemInit.service.js";
import scheduledJobsService from "./src/services/scheduledJobs.service.js";
import { startAllJobs } from "./src/services/subscriptionJobs.service.js";
import { emailQueueService } from "./src/services/emailQueue.service.js";
import { setupComplaintEvents } from "./src/socket/complaintEvents.js";
import { setupOrderEvents } from "./src/socket/socketHandler.js";
import socketAuthMiddleware from "./src/middleware/socket.auth.middleware.js";
import { setIO } from "./src/utils/socketService.js";
import { setSocketIO } from "./src/services/notification.service.js";
import { logger } from "./src/utils/logger.js";
import {
  validateEnvironment,
  printEnvironmentSummary,
} from "./src/utils/validateEnv.js";

/* ---------------- ENV SETUP ---------------- */
dotenv.config();
logger.info("Beanrow Server starting...");
logger.info("Node Version:", process.version);

/* ---------------- ENV VALIDATION ---------------- */
try {
  const valid = validateEnvironment();
  if (valid) printEnvironmentSummary();
} catch (err) {
  logger.warn("Env validation warning:", err.message);
}

/* ---------------- SERVER SETUP ---------------- */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

/* ---------------- SOCKET.IO ---------------- */
const io = new Server(server, {
  cors: {
    origin:
      process.env.CORS_ORIGIN ||
      "https://beanrow-user-panel.vercel.app,https://beanrow-admin.vercel.app,http://localhost:3001,http://localhost:3000,https://www.beanrow.com",
    credentials: true,
  },
});

// Register socket authentication middleware
io.use(socketAuthMiddleware);
logger.info("Socket authentication middleware registered");

// Setup socket event handlers
setupComplaintEvents(io);
setupOrderEvents(io);

// Set global socket instance for socketService and notificationService
setIO(io);
setSocketIO(io);
logger.info("Socket instances registered in services");

io.on("connection", (socket) => {
  const userData = socket.data.user;
  logger.info(
    `Socket connected: ${socket.id} - ${userData?.userModel || "Unknown"} ${userData?.name || "N/A"}`
  );

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id}`);
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
    logger.info("Assignment system initialized");

    await scheduledJobsService.initialize();
    logger.info("Scheduled jobs initialized");

    if (process.env.ENABLE_SUBSCRIPTION_JOBS !== "false") {
      startAllJobs();
      logger.info("Subscription jobs started");
    }

    if (process.env.ENABLE_EMAIL_QUEUE !== "false") {
      emailQueueService.startQueueProcessor();
      logger.info("Email queue started");
    }

    logger.info("ALL BACKGROUND SERVICES READY");
  } catch (error) {
    logger.error("Background initialization failed:", error);
  }
};

/* ---------------- START SERVER ---------------- */
const startServer = async () => {
  try {
    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on port http://localhost:${PORT}`);
    });

    // Connect to DB AFTER server is listening
    await connectDB();
    isDbConnected = true;

    // Start background services AFTER DB is ready
    initializeBackgroundServices();
  } catch (error) {
    logger.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

/* ---------------- GRACEFUL SERVER SHUTDOWN ---------------- */
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down...");
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down...");
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});
