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

console.log("🔧 Starting Hotel Management Backend...");
console.log("📍 Node Version:", process.version);
console.log("📍 PORT:", process.env.PORT || 8080);

// Load env variables
dotenv.config({
  path: ".env",
});

console.log("✅ Environment variables loaded");

console.log("✅ Environment variables loaded");

// Validate environment variables (warn but don't exit for Cloud Run)
try {
  const envValidation = validateEnvironment();
  if (!envValidation) {
    console.warn(
      "⚠️ Environment validation failed. Server will start but may have issues."
    );
  } else {
    printEnvironmentSummary();
  }
} catch (error) {
  console.warn("⚠️ Environment validation error:", error.message);
}

console.log("✅ Setting up Express server...");

console.log("✅ Setting up Express server...");

// Setup server
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

console.log("✅ HTTP server created");
console.log("✅ Configuring Socket.IO...");

// Setup socket.io with error handling
let io;
try {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
      methods: ["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"],
    },
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

  logger.info("✅ Socket.IO configured successfully");
} catch (error) {
  logger.error("❌ Socket.IO configuration error:", error.message);
  // Continue without socket.io if it fails
}

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
console.log(`🚀 Starting server on port ${PORT}...`);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅✅✅ Server running on port ${PORT} ✅✅✅`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log("🔄 Initializing background services...");
  // Initialize services in background after server starts
  initializeServer().catch((err) => {
    console.error("Background initialization error:", err);
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  try {
    if (emailQueueService && emailQueueService.stopQueueProcessor) {
      emailQueueService.stopQueueProcessor();
    }
  } catch (error) {
    logger.error("Error stopping email queue:", error.message);
  }
  server.close(() => {
    logger.info("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  try {
    if (emailQueueService && emailQueueService.stopQueueProcessor) {
      emailQueueService.stopQueueProcessor();
    }
  } catch (error) {
    logger.error("Error stopping email queue:", error.message);
  }
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
