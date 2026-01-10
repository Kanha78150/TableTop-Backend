// src/utils/socketService.js - Global Socket.IO Service

/**
 * Global Socket.IO service for accessing io instance across the application
 * This allows controllers and services to emit socket events without passing io as a parameter
 */

let ioInstance = null;

/**
 * Set the Socket.IO instance
 * This should be called once during server initialization
 * @param {Object} io - Socket.IO server instance
 */
export const setIO = (io) => {
  if (ioInstance) {
    console.warn("⚠️ Socket.IO instance is already set. Overwriting...");
  }
  ioInstance = io;
  console.log("✅ Socket.IO instance registered in global service");
};

/**
 * Get the Socket.IO instance
 * @returns {Object} Socket.IO server instance
 * @throws {Error} If Socket.IO is not initialized
 */
export const getIO = () => {
  if (!ioInstance) {
    throw new Error(
      "Socket.IO not initialized. Call setIO(io) first in server.js"
    );
  }
  return ioInstance;
};

/**
 * Check if Socket.IO is initialized
 * @returns {Boolean} True if initialized, false otherwise
 */
export const isIOInitialized = () => {
  return ioInstance !== null;
};

export default {
  setIO,
  getIO,
  isIOInitialized,
};
