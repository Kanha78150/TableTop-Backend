// src/middleware/socket.auth.middleware.js - Socket.IO Authentication Middleware

import jwt from "jsonwebtoken";
import { Staff } from "../models/Staff.model.js";
import { Manager } from "../models/Manager.model.js";
import { Admin } from "../models/Admin.model.js";
import { User } from "../models/User.model.js";
import { logger } from "../utils/logger.js";

/**
 * Socket.IO authentication middleware
 * Verifies JWT token and attaches user information to socket
 *
 * Usage in server.js:
 * io.use(socketAuthMiddleware);
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    // Extract token from handshake auth or query params
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      logger.warn(
        `Socket connection rejected: No token provided (${socket.id})`
      );
      return next(new Error("Authentication required: No token provided"));
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      logger.warn(`Socket connection rejected: Invalid token (${socket.id})`);
      if (jwtError.name === "TokenExpiredError") {
        return next(new Error("Authentication failed: Token expired"));
      }
      return next(new Error("Authentication failed: Invalid token"));
    }

    // Extract user ID and role from token
    const userId = decoded._id || decoded.id;
    const userRole = decoded.role;

    if (!userId) {
      logger.warn(
        `Socket connection rejected: No user ID in token (${socket.id})`
      );
      return next(new Error("Authentication failed: Invalid token payload"));
    }

    // Fetch user from database based on role
    let user = null;
    let userModel = null;

    switch (userRole) {
      case "staff":
      case "waiter":
      case "chef":
        user = await Staff.findById(userId).select("-password -refreshToken");
        userModel = "Staff";
        break;

      case "manager":
        user = await Manager.findById(userId).select("-password -refreshToken");
        userModel = "Manager";
        break;

      case "admin":
      case "superAdmin":
        user = await Admin.findById(userId).select("-password -refreshToken");
        userModel = "Admin";
        break;

      case "user":
      case "customer":
        user = await User.findById(userId).select("-password -refreshToken");
        userModel = "User";
        break;

      default:
        logger.warn(
          `Socket connection rejected: Unknown role ${userRole} (${socket.id})`
        );
        return next(
          new Error(`Authentication failed: Unknown role ${userRole}`)
        );
    }

    if (!user) {
      logger.warn(
        `Socket connection rejected: User not found ${userId} (${socket.id})`
      );
      return next(new Error("Authentication failed: User not found"));
    }

    // Check if user is active
    if (user.status && user.status !== "active") {
      logger.warn(
        `Socket connection rejected: User inactive ${userId} (${socket.id})`
      );
      return next(new Error("Authentication failed: User account is inactive"));
    }

    // Attach user information to socket
    socket.data.user = {
      id: user._id.toString(),
      role: userRole,
      name: user.name,
      email: user.email,
      staffId: user.staffId || user.managerId || user.adminId || user.userId,
      hotel: user.hotel?.toString(),
      branch: user.branch?.toString(),
      manager: user.manager?.toString(),
      userModel: userModel,
    };

    logger.info(
      `Socket authenticated: ${userModel} ${user.name} (${user._id}) - Socket: ${socket.id}`
    );

    // Continue to next middleware/connection handler
    next();
  } catch (error) {
    logger.error(`Socket authentication error: ${error.message}`, {
      socketId: socket.id,
      error: error.stack,
    });
    return next(new Error("Authentication failed: Internal server error"));
  }
};

/**
 * Helper function to verify socket has required role
 * Use in individual event handlers for additional authorization
 */
export const requireRole = (socket, allowedRoles) => {
  const userRole = socket.data.user?.role;

  if (!userRole) {
    return { authorized: false, error: "User not authenticated" };
  }

  if (!allowedRoles.includes(userRole)) {
    return {
      authorized: false,
      error: `Access denied: Role ${userRole} not allowed`,
    };
  }

  return { authorized: true };
};

/**
 * Helper function to verify socket user can only access their own resources
 * Prevents staff from joining other staff's rooms
 */
export const requireOwnership = (socket, resourceId) => {
  const userId = socket.data.user?.id;

  if (!userId) {
    return { authorized: false, error: "User not authenticated" };
  }

  if (userId !== resourceId.toString()) {
    return {
      authorized: false,
      error: "Access denied: Cannot access other user's resources",
    };
  }

  return { authorized: true };
};

export default socketAuthMiddleware;
