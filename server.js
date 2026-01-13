import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import assignmentSystemInit from "./src/services/assignmentSystemInit.js";
import scheduledJobsService from "./src/services/scheduledJobs.js";
import { startAllJobs } from "./src/services/subscriptionJobs.js";
import { emailQueueService } from "./src/services/emailQueueService.js";
import { logger } from "./src/utils/logger.js";
import { setupComplaintEvents } from "./src/socket/complaintEvents.js";
import { setIO } from "./src/utils/socketService.js";
import {
  validateEnvironment,
  printEnvironmentSummary,
} from "./src/utils/validateEnv.js";

// Load env variables
dotenv.config({
  path: ".env",
});

// Validate environment variables first
if (!validateEnvironment()) {
  logger.error("❌ Environment validation failed. Exiting...");
  process.exit(1);
}

// Print environment summary
printEnvironmentSummary();

// Setup server
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// Setup socket.io
const io = new Server(server, {
  origin: process.env.CORS_ORIGIN, // 🔒
  credentials: true,
  methods: ["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"],
});

// Initialize complaint socket events
setupComplaintEvents(io);

// Set global Socket.IO instance for use in controllers
setIO(io);

// Basic socket handler
io.on("connection", (socket) => {
  console.log("⚡ A user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ A user disconnected:", socket.id);
  });
});

// Track initialization status
let isInitialized = false;
let initializationError = null;

// Connect DB and initialize assignment system
const initializeServer = async () => {
  try {
    logger.info("🔄 Starting background initialization...");

    // Connect to database first
    await connectDB();

    // Initialize assignment system after database connection
    await assignmentSystemInit.initialize({
      skipDataValidation: false,
      skipTimeTracker: false,
      autoRepairData: true,
    });

    // Initialize scheduled jobs
    await scheduledJobsService.initialize();

    // Initialize subscription background jobs
    if (process.env.ENABLE_SUBSCRIPTION_JOBS !== "false") {
      startAllJobs();
      logger.info("✅ Subscription background jobs started");
    } else {
      logger.info(
        "⚠️ Subscription jobs disabled (ENABLE_SUBSCRIPTION_JOBS=false)"
      );
    }

    // Initialize email queue processor
    if (process.env.ENABLE_EMAIL_QUEUE !== "false") {
      emailQueueService.startQueueProcessor();
      logger.info("✅ Email queue processor started");
    } else {
      logger.info(
        "⚠️ Email queue processor disabled (ENABLE_EMAIL_QUEUE=false)"
      );
    }

    isInitialized = true;
    logger.info("✅ All systems initialized successfully");
  } catch (error) {
    initializationError = error;
    logger.error("❌ Failed to initialize server:", error);
    // Don't exit - allow server to stay up for health checks
  }
};

// Start server immediately for Cloud Run
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Initialize services in background after server starts
  initializeServer();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  emailQueueService.stopQueueProcessor();
  server.close(() => {
    logger.info("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  emailQueueService.stopQueueProcessor();
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
