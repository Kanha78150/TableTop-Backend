import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import assignmentSystemInit from "./src/services/assignmentSystemInit.js";
import { logger } from "./src/utils/logger.js";

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
