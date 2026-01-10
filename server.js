import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import assignmentSystemInit from "./src/services/assignmentSystemInit.js";
import scheduledJobsService from "./src/services/scheduledJobs.js";
import { startAllJobs } from "./src/services/subscriptionJobs.js";
import { logger } from "./src/utils/logger.js";
import { setupComplaintEvents } from "./src/socket/complaintEvents.js";
import { setIO } from "./src/utils/socketService.js";

// Load env variables
dotenv.config({
  path: ".env",
});

// Connect DB and initialize assignment system
const initializeServer = async () => {
  try {
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

    logger.info("✅ All systems initialized successfully");
  } catch (error) {
    logger.error("❌ Failed to initialize server:", error);
    process.exit(1);
  }
};

// Initialize everything
initializeServer();

// Setup server
const PORT = process.env.PORT || 8000;
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

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
