/**
 * Service Status Helper Utilities
 * Provides functions to add service status information to hotel, branch, manager, and staff objects
 */

/**
 * Add service status information to a hotel object
 * @param {Object} hotel - Hotel object
 * @returns {Object} Hotel object with service status information
 */
export const addServiceStatus = (hotel) => {
  const hotelObj = hotel.toObject ? hotel.toObject() : hotel;

  let serviceStatus = {
    available: true,
    message: "Services available",
    statusCode: "ACTIVE",
  };

  switch (hotelObj.status) {
    case "inactive":
      serviceStatus = {
        available: false,
        message: "No services provided by hotel",
        statusCode: "INACTIVE",
        reason: "Hotel is currently offline",
      };
      break;
    case "maintenance":
      serviceStatus = {
        available: false,
        message: "Services temporarily unavailable",
        statusCode: "MAINTENANCE",
        reason: "Hotel is under maintenance",
      };
      break;
    case "active":
    default:
      serviceStatus = {
        available: true,
        message: "Services available",
        statusCode: "ACTIVE",
      };
      break;
  }

  return {
    ...hotelObj,
    serviceStatus,
  };
};

/**
 * Add service status information to multiple hotels
 * @param {Array} hotels - Array of hotel objects
 * @returns {Array} Array of hotel objects with service status information
 */
export const addServiceStatusToHotels = (hotels) => {
  return hotels.map((hotel) => addServiceStatus(hotel));
};

/**
 * Add service status information to branch objects based on their hotel status
 * @param {Object} branch - Branch object with populated hotel
 * @returns {Object} Branch object with service status information
 */
export const addBranchServiceStatus = (branch) => {
  const branchObj = branch.toObject ? branch.toObject() : branch;

  let serviceStatus = {
    available: true,
    message: "Services available",
    statusCode: "ACTIVE",
  };

  // Check both branch and hotel status
  if (
    branchObj.status === "inactive" ||
    (branchObj.hotel && branchObj.hotel.status === "inactive")
  ) {
    serviceStatus = {
      available: false,
      message: "No services provided by this branch",
      statusCode: "INACTIVE",
      reason: "Branch or hotel is currently offline",
    };
  } else if (
    branchObj.status === "maintenance" ||
    (branchObj.hotel && branchObj.hotel.status === "maintenance")
  ) {
    serviceStatus = {
      available: false,
      message: "Services temporarily unavailable",
      statusCode: "MAINTENANCE",
      reason: "Branch or hotel is under maintenance",
    };
  }

  return {
    ...branchObj,
    serviceStatus,
  };
};

/**
 * Add service status information to multiple branches
 * @param {Array} branches - Array of branch objects
 * @returns {Array} Array of branch objects with service status information
 */
export const addServiceStatusToBranches = (branches) => {
  return branches.map((branch) => addBranchServiceStatus(branch));
};

/**
 * Add service status information to manager objects
 * @param {Object} manager - Manager object with populated hotel/branch
 * @returns {Object} Manager object with service status information
 */
export const addManagerServiceStatus = (manager) => {
  const managerObj = manager.toObject ? manager.toObject() : manager;

  let serviceStatus = {
    available: true,
    message: "Services available",
    statusCode: "ACTIVE",
  };

  // Check manager, branch, and hotel status
  if (
    managerObj.status === "inactive" ||
    (managerObj.branch && managerObj.branch.status === "inactive") ||
    (managerObj.hotel && managerObj.hotel.status === "inactive")
  ) {
    serviceStatus = {
      available: false,
      message: "No services provided by this manager",
      statusCode: "INACTIVE",
      reason: "Manager, branch, or hotel is currently offline",
    };
  } else if (
    managerObj.status === "maintenance" ||
    (managerObj.branch && managerObj.branch.status === "maintenance") ||
    (managerObj.hotel && managerObj.hotel.status === "maintenance")
  ) {
    serviceStatus = {
      available: false,
      message: "Services temporarily unavailable",
      statusCode: "MAINTENANCE",
      reason: "Manager, branch, or hotel is under maintenance",
    };
  }

  return {
    ...managerObj,
    serviceStatus,
  };
};

/**
 * Add service status information to multiple managers
 * @param {Array} managers - Array of manager objects
 * @returns {Array} Array of manager objects with service status information
 */
export const addServiceStatusToManagers = (managers) => {
  return managers.map((manager) => addManagerServiceStatus(manager));
};

/**
 * Add service status information to staff objects
 * @param {Object} staff - Staff object with populated branch/hotel
 * @returns {Object} Staff object with service status information
 */
export const addStaffServiceStatus = (staff) => {
  const staffObj = staff.toObject ? staff.toObject() : staff;

  let serviceStatus = {
    available: true,
    message: "Services available",
    statusCode: "ACTIVE",
  };

  // Check staff, branch, and hotel status
  if (
    staffObj.status === "inactive" ||
    (staffObj.branch && staffObj.branch.status === "inactive") ||
    (staffObj.hotel && staffObj.hotel.status === "inactive")
  ) {
    serviceStatus = {
      available: false,
      message: "No services provided by this staff member",
      statusCode: "INACTIVE",
      reason: "Staff, branch, or hotel is currently offline",
    };
  } else if (
    staffObj.status === "maintenance" ||
    (staffObj.branch && staffObj.branch.status === "maintenance") ||
    (staffObj.hotel && staffObj.hotel.status === "maintenance")
  ) {
    serviceStatus = {
      available: false,
      message: "Services temporarily unavailable",
      statusCode: "MAINTENANCE",
      reason: "Staff, branch, or hotel is under maintenance",
    };
  }

  return {
    ...staffObj,
    serviceStatus,
  };
};

/**
 * Add service status information to multiple staff members
 * @param {Array} staff - Array of staff objects
 * @returns {Array} Array of staff objects with service status information
 */
export const addServiceStatusToStaff = (staff) => {
  return staff.map((staffMember) => addStaffServiceStatus(staffMember));
};

/**
 * Filter and categorize hotels by service status
 * @param {Array} hotels - Array of hotel objects
 * @returns {Object} Categorized hotels object
 */
export const categorizeHotelsByStatus = (hotels) => {
  const active = [];
  const inactive = [];
  const maintenance = [];

  hotels.forEach((hotel) => {
    switch (hotel.status) {
      case "active":
        active.push(hotel);
        break;
      case "inactive":
        inactive.push(hotel);
        break;
      case "maintenance":
        maintenance.push(hotel);
        break;
      default:
        active.push(hotel);
    }
  });

  return {
    active,
    inactive,
    maintenance,
    total: hotels.length,
    serviceAvailable: active.length,
    serviceUnavailable: inactive.length + maintenance.length,
  };
};
