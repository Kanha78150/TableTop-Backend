import jwt from "jsonwebtoken";
import { APIError } from "../utils/APIError.js";
import { User } from "../models/User.model.js";
import { Admin } from "../models/Admin.model.js";
import { Manager } from "../models/Manager.model.js";
import { Staff } from "../models/Staff.model.js";

export const authenticateUser = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      throw new APIError(401, "Access token is required");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    );
    if (!user) {
      throw new APIError(401, "Invalid access token");
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new APIError(403, "Email verification required");
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      throw new APIError(401, "Invalid access token");
    }
    if (error.name === "TokenExpiredError") {
      throw new APIError(401, "Access token expired");
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during authentication");
  }
};

// Middleware for OAuth users (allows unverified users for profile completion)
export const authenticateOAuthUser = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      throw new APIError(401, "Access token is required");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    );
    if (!user) {
      throw new APIError(401, "Invalid access token");
    }

    // OAuth users can access profile completion even without email verification
    if (!user.isOAuthUser) {
      throw new APIError(403, "This endpoint is only for OAuth users");
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      throw new APIError(401, "Invalid access token");
    }
    if (error.name === "TokenExpiredError") {
      throw new APIError(401, "Access token expired");
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, "Internal server error during authentication");
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      return next(); // Continue without authentication
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    );
    if (user && user.isEmailVerified) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Manager authentication middleware
export const authenticateManager = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      throw new APIError(401, "Access token is required");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get manager from database using the correct field (id, not _id)
    const manager = await Manager.findById(decoded.id)
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .select("-password -refreshToken");

    if (!manager) {
      throw new APIError(401, "Invalid access token");
    }

    // Check if manager is active
    if (manager.status !== "active") {
      throw new APIError(403, "Manager account is inactive");
    }

    // Attach manager to request object
    req.manager = manager;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new APIError(401, "Invalid access token"));
    }
    if (error.name === "TokenExpiredError") {
      return next(new APIError(401, "Access token has expired"));
    }
    next(error);
  }
};

// Staff authentication middleware
export const authenticateStaff = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      throw new APIError(401, "Access token is required");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get staff from database using the correct field (id, not _id)
    const staff = await Staff.findById(decoded.id)
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId location")
      .populate("manager", "name employeeId")
      .select("-password -refreshToken");

    if (!staff) {
      throw new APIError(401, "Invalid access token");
    }

    // Check if staff is active
    if (staff.status !== "active") {
      throw new APIError(403, "Staff account is inactive");
    }

    // Attach staff to request object
    req.staff = staff;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new APIError(401, "Invalid access token"));
    }
    if (error.name === "TokenExpiredError") {
      return next(new APIError(401, "Access token has expired"));
    }
    next(error);
  }
};
