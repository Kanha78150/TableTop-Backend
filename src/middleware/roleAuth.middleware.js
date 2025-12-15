import jwt from "jsonwebtoken";
import { APIError } from "../utils/APIError.js";
import { Admin } from "../models/Admin.model.js";
import { Manager } from "../models/Manager.model.js";
import { Staff } from "../models/Staff.model.js";

// Generic authentication middleware that can handle all user types
export const authenticate = async (req, res, next) => {
  try {
    // Get token from header or cookies
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      return next(new APIError(401, "Access token is required"));
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
    );

    let user = null;
    let userType = null;

    // Determine user type from token and fetch from appropriate model
    if (decoded.role === "admin" || decoded.role === "super_admin") {
      user = await Admin.findById(decoded._id)
        .populate("assignedBranches", "name branchId location")
        .select("-password -refreshToken -passwordResetToken -twoFactorSecret");
      userType = "admin";
    } else if (decoded.role === "branch_manager") {
      user = await Manager.findById(decoded._id)
        .populate("branch", "name branchId location")
        .select("-password -refreshToken");
      userType = "manager";
    } else if (
      [
        "waiter",
        "kitchen_staff",
        "cleaning_staff",
        "cashier",
        "receptionist",
        "security",
      ].includes(decoded.role)
    ) {
      // Handle all staff roles (waiter, kitchen_staff, etc.)
      user = await Staff.findById(decoded._id)
        .populate("branch", "name branchId location")
        .populate("manager", "name email")
        .select("-password -refreshToken");
      userType = "staff";
    }

    if (!user) {
      return next(new APIError(401, "Invalid access token"));
    }

    // Check if account is active
    if (user.status !== "active") {
      return next(new APIError(403, `${userType} account is inactive`));
    }

    // Check if account is locked
    if (user.isLocked) {
      return next(new APIError(423, "Account is temporarily locked"));
    }

    // Add user to request object with type information
    req.user = user;
    req.userType = userType;
    req.userRole = user.role;

    // For backward compatibility, also set specific properties
    if (userType === "admin") req.admin = user;
    if (userType === "manager") req.manager = user;
    if (userType === "staff") req.staff = user;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new APIError(401, "Invalid access token"));
    }
    if (error.name === "TokenExpiredError") {
      return next(new APIError(401, "Access token expired"));
    }
    next(error);
  }
};

// Legacy admin-only authentication (for backward compatibility)
export const authenticateAdmin = async (req, res, next) => {
  try {
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      return next(new APIError(401, "Access token is required"));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
    );

    if (!["admin", "super_admin"].includes(decoded.role)) {
      return next(new APIError(403, "Admin access required"));
    }

    const admin = await Admin.findById(decoded._id)
      .populate("assignedBranches", "name branchId location")
      .select("-password -refreshToken -passwordResetToken -twoFactorSecret");

    if (!admin) {
      return next(new APIError(401, "Invalid access token"));
    }

    if (admin.status !== "active") {
      return next(new APIError(403, "Admin account is inactive"));
    }

    if (admin.isLocked) {
      return next(new APIError(423, "Account is temporarily locked"));
    }

    req.admin = admin;
    req.user = admin;
    req.userType = "admin";
    req.userRole = admin.role;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new APIError(401, "Invalid access token"));
    }
    if (error.name === "TokenExpiredError") {
      return next(new APIError(401, "Access token expired"));
    }
    next(error);
  }
};

// Role-based access control for the 3-tier structure
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Define all staff role types
    const staffRoles = [
      "waiter",
      "kitchen_staff",
      "cleaning_staff",
      "cashier",
      "receptionist",
      "security",
    ];

    // Check if "staff" is in allowedRoles and current user has any staff role
    const hasStaffAccess =
      allowedRoles.includes("staff") && staffRoles.includes(req.userRole);

    // Check if user's specific role is in allowedRoles
    const hasRoleAccess = allowedRoles.includes(req.userRole);

    if (!req.userRole || (!hasRoleAccess && !hasStaffAccess)) {
      return next(
        new APIError(403, `Required roles: ${allowedRoles.join(", ")}`)
      );
    }
    next();
  };
};

// Super Admin only access
export const requireSuperAdmin = (req, res, next) => {
  if (req.userRole !== "super_admin") {
    return next(new APIError(403, "Super admin access required"));
  }
  next();
};

// Admin only access (excludes super_admin, only regular admins)
export const requireAdmin = (req, res, next) => {
  if (req.userRole !== "admin") {
    return next(new APIError(403, "Admin access required"));
  }
  next();
};

// Admin or Super Admin access (any admin level)
export const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!["admin", "super_admin"].includes(req.userRole)) {
    return next(new APIError(403, "Admin or Super Admin access required"));
  }
  next();
};

// Branch Manager or higher access (Super Admin + Branch Manager)
export const requireManagerOrHigher = (req, res, next) => {
  if (!["super_admin", "branch_manager"].includes(req.userRole)) {
    return next(new APIError(403, "Manager level access required"));
  }
  next();
};

// Any authenticated user access
export const requireAnyRole = (req, res, next) => {
  if (!["super_admin", "branch_manager", "staff"].includes(req.userRole)) {
    return next(new APIError(403, "Authentication required"));
  }
  next();
};

// Check specific permission (works for all user types)
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.hasPermission || !req.user.hasPermission(permission)) {
      // Fallback for users without hasPermission method
      if (req.user.permissions && !req.user.permissions[permission]) {
        return next(new APIError(403, `Permission required: ${permission}`));
      }
      if (!req.user.permissions) {
        return next(new APIError(403, `Permission required: ${permission}`));
      }
    }
    next();
  };
};

// Check multiple permissions (user must have ALL permissions)
export const requirePermissions = (permissions) => {
  return (req, res, next) => {
    const hasAllPermissions = permissions.every((permission) => {
      if (req.user.hasPermission) {
        return req.user.hasPermission(permission);
      }
      return req.user.permissions && req.user.permissions[permission];
    });

    if (!hasAllPermissions) {
      return next(
        new APIError(
          403,
          `Insufficient permissions. Required: ${permissions.join(", ")}`
        )
      );
    }
    next();
  };
};

// Check if user can access specific branch
export const requireBranchAccess = (req, res, next) => {
  const branchId =
    req.params.branchId || req.body.branchId || req.query.branchId;

  if (!branchId) {
    return next(new APIError(400, "Branch ID is required"));
  }

  // Super admin can access all branches
  if (req.userRole === "super_admin") {
    return next();
  }

  // Branch managers and staff can only access their own branch
  if (req.userRole === "branch_manager" || req.userRole === "staff") {
    const userBranchId =
      req.user.branch?._id?.toString() || req.user.branch?.toString();
    if (userBranchId !== branchId) {
      return next(new APIError(403, "Access denied for this branch"));
    }
    return next();
  }

  // For admin role with canAccessBranch method (backward compatibility)
  if (req.user.canAccessBranch && !req.user.canAccessBranch(branchId)) {
    return next(new APIError(403, "Access denied for this branch"));
  }

  next();
};

// Check if user can manage staff (Super Admin or Branch Manager)
export const requireStaffManagement = (req, res, next) => {
  if (req.userRole === "super_admin") {
    return next(); // Super admin can manage all staff
  }

  if (req.userRole === "branch_manager") {
    // Check if manager has staff management permission
    if (req.user.permissions && req.user.permissions.manageStaff) {
      return next();
    }
  }

  return next(new APIError(403, "Staff management permission required"));
};

// Check if user can view financial data
export const requireFinancialAccess = (req, res, next) => {
  if (req.userRole === "super_admin") {
    return next(); // Super admin has all access
  }

  // Check for hasPermission method or permissions object
  const hasPermission = req.user.hasPermission
    ? req.user.hasPermission("viewFinancials")
    : req.user.permissions && req.user.permissions.viewFinancials;

  if (!hasPermission) {
    return next(new APIError(403, "Financial data access denied"));
  }
  next();
};

// Advanced RBAC middleware factory for the 3-tier system
export const rbac = (options = {}) => {
  return (req, res, next) => {
    const {
      roles = [],
      permissions = [],
      requireAll = false,
      branchAccess = false,
      ownResourceOnly = false,
    } = options;

    // Check role requirements
    if (roles.length > 0 && !roles.includes(req.userRole)) {
      return next(new APIError(403, `Required roles: ${roles.join(", ")}`));
    }

    // Check permission requirements
    if (permissions.length > 0) {
      const hasPermissions = requireAll
        ? permissions.every((permission) => {
            if (req.user.hasPermission) {
              return req.user.hasPermission(permission);
            }
            return req.user.permissions && req.user.permissions[permission];
          })
        : permissions.some((permission) => {
            if (req.user.hasPermission) {
              return req.user.hasPermission(permission);
            }
            return req.user.permissions && req.user.permissions[permission];
          });

      if (!hasPermissions) {
        return next(
          new APIError(403, `Required permissions: ${permissions.join(", ")}`)
        );
      }
    }

    // Check branch access if required
    if (branchAccess) {
      const branchId =
        req.params.branchId || req.body.branchId || req.query.branchId;

      if (branchId) {
        // Super admin can access all branches
        if (req.userRole !== "super_admin") {
          const userBranchId =
            req.user.branch?._id?.toString() || req.user.branch?.toString();
          if (userBranchId !== branchId) {
            return next(new APIError(403, "Access denied for this branch"));
          }
        }
      }
    }

    // Check if user can only access their own resources
    if (ownResourceOnly) {
      const resourceUserId =
        req.params.userId || req.params.managerId || req.params.staffId;
      if (resourceUserId && req.user._id.toString() !== resourceUserId) {
        // Allow super admin to access any resource
        if (req.userRole !== "super_admin") {
          return next(
            new APIError(403, "You can only access your own resources")
          );
        }
      }
    }

    next();
  };
};

// Department-based access control
export const requireDepartment = (departments) => {
  return (req, res, next) => {
    if (!req.user.department || !departments.includes(req.user.department)) {
      return next(
        new APIError(
          403,
          `Department access required: ${departments.join(", ")}`
        )
      );
    }
    next();
  };
};

// Self or super admin access (for profile operations)
export const requireSelfOrSuperAdmin = (req, res, next) => {
  const targetUserId =
    req.params.userId ||
    req.params.managerId ||
    req.params.staffId ||
    req.params.id;

  if (
    req.userRole === "super_admin" ||
    req.user._id.toString() === targetUserId
  ) {
    return next();
  }

  return next(
    new APIError(
      403,
      "You can only access your own profile or you need super admin privileges"
    )
  );
};

// Check if user has verified email
export const requireEmailVerification = (req, res, next) => {
  if (!req.user.emailVerified) {
    return next(new APIError(403, "Email verification required"));
  }
  next();
};

// Rate limiting for sensitive operations
export const rateLimitSensitiveOps = (req, res, next) => {
  // For public routes (like bootstrap), use IP address for rate limiting
  // For authenticated routes, use user ID
  const identifier = req.user
    ? req.user._id
    : req.ip || req.connection.remoteAddress;
  const key = `rate_limit_${identifier}`;
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = req.user ? 5 : 3; // Stricter limit for public routes

  // In production, you would use Redis to store this data
  if (!req.app.locals.rateLimits) {
    req.app.locals.rateLimits = new Map();
  }

  const userAttempts = req.app.locals.rateLimits.get(key) || [];
  const recentAttempts = userAttempts.filter(
    (timestamp) => now - timestamp < window
  );

  if (recentAttempts.length >= maxAttempts) {
    return next(
      new APIError(429, "Too many attempts. Please try again later.")
    );
  }

  recentAttempts.push(now);
  req.app.locals.rateLimits.set(key, recentAttempts);

  next();
};

// Hierarchy-based access control
export const requireHierarchyAccess = (req, res, next) => {
  const targetRole = req.params.role || req.body.role;
  const currentRole = req.userRole;

  // Define hierarchy levels
  const hierarchy = {
    super_admin: 3,
    branch_manager: 2,
    staff: 1,
  };

  const currentLevel = hierarchy[currentRole] || 0;
  const targetLevel = hierarchy[targetRole] || 0;

  // Users can only manage users at a lower level than themselves
  if (currentLevel <= targetLevel) {
    return next(
      new APIError(403, "Insufficient hierarchy level for this operation")
    );
  }

  next();
};
