import { User } from "../../models/User.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


// User Management
export const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    verified,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = {};

  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { username: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
    ];
  }

  if (verified !== undefined) {
    query.isEmailVerified = verified === "true";
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const users = await User.find(query)
    .select("-password -refreshToken -passwordResetToken")
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalUsers = await User.countDocuments(query);

  // Get user statistics
  const stats = {
    totalUsers: await User.countDocuments(),
    verifiedUsers: await User.countDocuments({ isEmailVerified: true }),
    oauthUsers: await User.countDocuments({ isOAuthUser: true }),
    activeUsers: await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
  };

  res.status(200).json(
    new APIResponse(
      200,
      {
        users,
        stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          hasNextPage: page < Math.ceil(totalUsers / limit),
          hasPrevPage: page > 1,
        },
      },
      "Users retrieved successfully"
    )
  );
  });

export const getUserById = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select(
    "-password -refreshToken -passwordResetToken"
  );

  if (!user) {
    return next(new APIError(404, "User not found"));
  }

  // Get user's order history count (you'll need to implement this based on your Order model)
  // const orderCount = await Order.countDocuments({ user: userId });

  res.status(200).json(
    new APIResponse(
      200,
      {
        user,
        // orderCount
      },
      "User details retrieved successfully"
    )
  );
  });

export const updateUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { name, username, phone, isEmailVerified, isPhoneVerified, coins } =
    req.body;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      ...(name && { name }),
      ...(username && { username }),
      ...(phone && { phone }),
      ...(isEmailVerified !== undefined && { isEmailVerified }),
      ...(isPhoneVerified !== undefined && { isPhoneVerified }),
      ...(coins !== undefined && { coins }),
    },
    { new: true, runValidators: true }
  ).select("-password -refreshToken -passwordResetToken");

  if (!user) {
    return next(new APIError(404, "User not found"));
  }

  res
    .status(200)
    .json(new APIResponse(200, { user }, "User updated successfully"));
  });

export const blockUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { reason } = req.body;

  // In a real implementation, you might want to add a 'blocked' field to User model
  // For now, we'll set isEmailVerified to false as a way to "block"
  const user = await User.findByIdAndUpdate(
    userId,
    {
      isEmailVerified: false,
      blockedAt: new Date(),
      blockReason: reason || "Blocked by admin",
    },
    { new: true }
  ).select("-password -refreshToken -passwordResetToken");

  if (!user) {
    return next(new APIError(404, "User not found"));
  }

  res
    .status(200)
    .json(new APIResponse(200, { user }, "User blocked successfully"));
  });

export const unblockUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      isEmailVerified: true,
      $unset: { blockedAt: 1, blockReason: 1 },
    },
    { new: true }
  ).select("-password -refreshToken -passwordResetToken");

  if (!user) {
    return next(new APIError(404, "User not found"));
  }

  res
    .status(200)
    .json(new APIResponse(200, { user }, "User unblocked successfully"));
  });

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findByIdAndDelete(userId);

  if (!user) {
    return next(new APIError(404, "User not found"));
  }

  // TODO: Handle cascading deletes (orders, reviews, etc.)

  res
    .status(200)
    .json(new APIResponse(200, null, "User deleted successfully"));
  });
