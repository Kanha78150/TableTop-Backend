import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./src/app.js";
import connectDB from "./src/config/database.js";

// Load env variables
dotenv.config({
  path: ".env",
});

// Connect DB
connectDB();

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
