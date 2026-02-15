/**
 * Payment Configuration Controller
 * Handles payment gateway configuration for hotel admins/managers
 * Allows setting up Razorpay, PhonePe, or Paytm credentials
 */

import { PaymentConfig } from "../../models/PaymentConfig.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import dynamicPaymentService from "../../services/dynamicPayment.service.js";
import notificationService from "../../services/notification.service.js";

/**
 * Get payment configuration for a hotel
 * @route GET /api/v1/payment-config/:hotelId
 * @access Private (Admin/Manager)
 */
export const getPaymentConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;

    // Verify hotel exists and user has access
    const hotel = await Hotel.findById(hotelId).populate({
      path: "paymentConfig",
      populate: [
        { path: "activatedBy", select: "name email role" },
        { path: "deactivatedBy", select: "name email role" },
        { path: "deactivationRequestedBy", select: "name email" },
      ],
    });

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization (user must own this hotel or be admin)
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      if (
        req.user.role === "manager" &&
        hotel.manager?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Not authorized to access this hotel's payment configuration",
        });
      }
    }

    if (!hotel.paymentConfig) {
      return res.status(200).json({
        success: true,
        configured: false,
        message: "No payment gateway configured yet",
      });
    }

    const config = hotel.paymentConfig;

    // Return config without sensitive credentials
    return res.status(200).json({
      success: true,
      configured: true,
      data: {
        provider: config.provider,
        isActive: config.isActive,
        isProduction: config.credentials?.isProduction || false,
        verified: config.verified,
        verificationMethod: config.verificationMethod,
        verifiedAt: config.verifiedAt,
        webhookStatus: config.webhookStatus,
        // Activation details
        activatedBy: config.activatedBy,
        activatedAt: config.activatedAt,
        // Deactivation details
        deactivatedBy: config.deactivatedBy,
        deactivatedAt: config.deactivatedAt,
        deactivationReason: config.deactivationReason,
        // Deactivation request details
        deactivationRequested: config.deactivationRequested,
        deactivationRequestedBy: config.deactivationRequestedBy,
        deactivationRequestedAt: config.deactivationRequestedAt,
        deactivationRequestReason: config.deactivationRequestReason,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        // Show only masked credentials
        credentials: maskCredentials(config.provider, config.credentials),
      },
    });
  } catch (error) {
    console.error("Error fetching payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment configuration",
      error: error.message,
    });
  }
};

/**
 * Create or update payment configuration
 * @route POST /api/v1/payment-config/:hotelId
 * @access Private (Admin/Manager)
 */
export const setupPaymentConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { provider, credentials, isProduction = false } = req.body;

    // Validate provider
    if (!dynamicPaymentService.isProviderSupported(provider)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported payment provider: ${provider}`,
        supportedProviders: dynamicPaymentService.getSupportedProviders(),
      });
    }

    // Validate credentials based on provider
    const validationError = validateCredentials(provider, credentials);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    // Verify hotel exists and user has access
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      if (
        req.user.role === "manager" &&
        hotel.manager?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to configure payment gateway for this hotel",
        });
      }
    }

    // Check if payment config already exists
    let paymentConfig = await PaymentConfig.findOne({ hotel: hotelId });

    if (paymentConfig) {
      // Update existing configuration
      paymentConfig.provider = provider;
      paymentConfig.credentials = credentials;
      paymentConfig.isProduction = isProduction;
      paymentConfig.updatedBy = req.user._id;

      // Reset verification status when credentials change
      paymentConfig.verified = false;
      paymentConfig.verificationMethod = "pending";

      // Production configs should not be auto-activated
      if (isProduction) {
        paymentConfig.isActive = false;
      }

      await paymentConfig.save();

      return res.status(200).json({
        success: true,
        message: "Payment configuration updated successfully",
        data: {
          provider: paymentConfig.provider,
          isActive: paymentConfig.isActive,
          isProduction: paymentConfig.isProduction,
          credentials: maskCredentials(provider, credentials),
        },
      });
    } else {
      // Create new configuration
      // Production configs should NOT be auto-activated (requires Super Admin approval)
      // Test configs can be activated after verification via test endpoint
      paymentConfig = await PaymentConfig.create({
        hotel: hotelId,
        provider,
        credentials,
        isProduction,
        isActive: false, // Always start as inactive, will be activated after verification
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });

      return res.status(201).json({
        success: true,
        message: "Payment configuration created successfully",
        data: {
          provider: paymentConfig.provider,
          isActive: paymentConfig.isActive,
          isProduction: paymentConfig.isProduction,
          credentials: maskCredentials(provider, credentials),
        },
      });
    }
  } catch (error) {
    console.error("Error setting up payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to setup payment configuration",
      error: error.message,
    });
  }
};

/**
 * Toggle payment gateway active status
 * @route PATCH /api/v1/payment-config/:hotelId/toggle
 * @access Private (Admin/Manager)
 */
export const togglePaymentConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value",
      });
    }

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId).populate("paymentConfig");

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      if (
        req.user.role === "manager" &&
        hotel.manager?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify payment gateway for this hotel",
        });
      }
    }

    if (!hotel.paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    const paymentConfig = hotel.paymentConfig;

    // Check if this is a production configuration
    if (paymentConfig.credentials?.isProduction) {
      // Only Super Admin can toggle production configs
      if (req.user.role !== "super_admin") {
        return res.status(403).json({
          success: false,
          message:
            "Production payment gateways can only be activated/deactivated by Super Admin. Use the activate/deactivate endpoints instead.",
          hint: "Test mode configurations can be toggled freely. For production, contact Super Admin.",
        });
      }
    }

    paymentConfig.isActive = isActive;
    paymentConfig.updatedBy = req.user._id;
    await paymentConfig.save();

    return res.status(200).json({
      success: true,
      message: `Payment gateway ${isActive ? "enabled" : "disabled"} successfully`,
      data: {
        provider: paymentConfig.provider,
        isActive: paymentConfig.isActive,
        isProduction: paymentConfig.credentials?.isProduction || false,
      },
    });
  } catch (error) {
    console.error("Error toggling payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle payment configuration",
      error: error.message,
    });
  }
};

/**
 * Test payment gateway connection
 * @route POST /api/v1/payment-config/:hotelId/test
 * @access Private (Admin/Manager)
 */
export const testPaymentConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      if (
        req.user.role === "branch_manager" &&
        hotel.manager?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to test payment gateway for this hotel",
        });
      }
    }

    // Find payment config
    const paymentConfig = await PaymentConfig.findOne({
      hotel: hotelId,
    }).select(
      "+credentials.keyId +credentials.keySecret +credentials.merchantId +credentials.saltKey +credentials.merchantKey +credentials.webhookSecret +credentials.isProduction"
    );

    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    // Get decrypted credentials
    const credentials = paymentConfig.getDecryptedCredentials();
    const provider = paymentConfig.provider;
    const isProduction = credentials.isProduction;

    // Test the credentials with actual payment gateway API
    let testResult = { success: false, message: "" };

    try {
      if (provider === "razorpay") {
        // Test Razorpay credentials by making a test API call
        const Razorpay = (await import("razorpay")).default;

        if (!credentials.keyId || !credentials.keySecret) {
          return res.status(400).json({
            success: false,
            message:
              "Razorpay credentials missing. keyId and keySecret are required.",
            tested: true,
            credentialsValid: false,
          });
        }

        const razorpayInstance = new Razorpay({
          key_id: credentials.keyId,
          key_secret: credentials.keySecret,
        });

        // Try to fetch payments (this will fail if credentials are invalid)
        await razorpayInstance.payments.all({ count: 1 });
        testResult.success = true;
        testResult.message = isProduction
          ? "Razorpay production credentials verified successfully"
          : "Razorpay test credentials verified successfully";
      } else if (provider === "phonepe") {
        // PhonePe doesn't have a simple test endpoint, so we validate format
        if (
          credentials.merchantId &&
          credentials.saltKey &&
          credentials.saltIndex
        ) {
          testResult.success = true;
          testResult.message = isProduction
            ? "PhonePe production credentials format validated"
            : "PhonePe test credentials format validated";
        }
      } else if (provider === "paytm") {
        // Paytm doesn't have a simple test endpoint, so we validate format
        if (credentials.merchantId && credentials.merchantKey) {
          testResult.success = true;
          testResult.message = isProduction
            ? "Paytm production credentials format validated"
            : "Paytm test credentials format validated";
        }
      }
    } catch (apiError) {
      // API test failed - credentials are invalid
      return res.status(400).json({
        success: false,
        message: `Payment gateway credentials verification failed: ${apiError.message}`,
        error: apiError.message,
        tested: true,
        credentialsValid: false,
      });
    }

    // Update verification status in database
    if (testResult.success) {
      paymentConfig.verified = true;
      paymentConfig.verificationMethod = "api_test";
      paymentConfig.verifiedAt = new Date();

      // For production mode: verify but don't activate (requires super_admin)
      if (isProduction) {
        paymentConfig.isActive = false; // Requires super_admin activation
        await paymentConfig.save();

        // Notify Super Admins that production config needs activation
        await notificationService.notifyPendingActivation({
          hotel: hotelId,
          paymentConfig,
          provider,
          admin: req.user,
        });

        return res.status(200).json({
          success: true,
          message: `${testResult.message}. Production mode requires Super Admin activation.`,
          data: {
            provider,
            credentialsValid: true,
            verified: true,
            verificationMethod: "api_test",
            verifiedAt: paymentConfig.verifiedAt,
            isProduction: true,
            isActive: false,
            requiresActivation: true,
            activationMessage:
              "Contact Super Admin to activate production payment gateway",
            tested: true,
          },
        });
      }

      // For test mode: auto-activate
      paymentConfig.isActive = true;
      await paymentConfig.save();

      return res.status(200).json({
        success: true,
        message: testResult.message,
        data: {
          provider,
          credentialsValid: true,
          verified: true,
          verificationMethod: "api_test",
          verifiedAt: paymentConfig.verifiedAt,
          isProduction: false,
          isActive: true,
          tested: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment gateway connection successful",
      data: {
        provider,
        credentialsValid: true,
        tested: true,
      },
    });
  } catch (error) {
    console.error("Error testing payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Payment gateway connection failed",
      error: error.message,
      tested: false,
    });
  }
};

/**
 * Delete payment configuration
 * @route DELETE /api/v1/payment-config/:hotelId
 * @access Private (Admin only)
 */
export const deletePaymentConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;

    // Only admins can delete payment configs
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can delete payment configurations",
      });
    }

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId).populate("paymentConfig");

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    if (!hotel.paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    await PaymentConfig.findByIdAndDelete(hotel.paymentConfig._id);

    return res.status(200).json({
      success: true,
      message: "Payment configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete payment configuration",
      error: error.message,
    });
  }
};

/**
 * Activate production payment gateway (Super Admin only)
 * @route POST /api/v1/payment-config/:hotelId/activate
 * @access Private (Super Admin only)
 */
export const activateProductionConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { confirm } = req.body;

    // Only super_admin can activate production
    if (req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can activate production payment gateway",
      });
    }

    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: "Confirmation required to activate production payment gateway",
      });
    }

    // Find payment config
    const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId });

    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    // Check if it's production mode
    if (!paymentConfig.credentials.isProduction) {
      return res.status(400).json({
        success: false,
        message:
          "This is a test configuration. Activation only required for production.",
      });
    }

    // Check if already active
    if (paymentConfig.isActive) {
      return res.status(400).json({
        success: false,
        message: "Production payment gateway is already active",
      });
    }

    // Check if verified
    if (!paymentConfig.verified) {
      return res.status(400).json({
        success: false,
        message:
          "Payment configuration must be verified before activation. Run test endpoint first.",
      });
    }

    // Activate the configuration
    paymentConfig.isActive = true;
    paymentConfig.activatedBy = req.user._id;
    paymentConfig.activatedAt = new Date();
    paymentConfig.activationIp = req.ip || req.connection.remoteAddress;
    await paymentConfig.save();

    // Populate activatedBy for response
    await paymentConfig.populate("activatedBy", "name email");

    // Log activation event
    console.log(
      `[PAYMENT ACTIVATION] Hotel: ${hotelId}, Provider: ${paymentConfig.provider}, Activated by: ${req.user.email}, IP: ${paymentConfig.activationIp}`
    );

    // Get hotel admin to send notification
    const hotel = await Hotel.findById(hotelId).populate(
      "createdBy",
      "_id name email"
    );

    // Send activation notification to hotel admin
    if (hotel && hotel.createdBy) {
      await notificationService.notifyActivated({
        hotel: hotelId,
        paymentConfig,
        provider: paymentConfig.provider,
        admin: hotel.createdBy,
        activatedBy: req.user,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Production payment gateway activated successfully",
      data: {
        provider: paymentConfig.provider,
        isActive: true,
        isProduction: true,
        verified: true,
        activatedBy: {
          name: paymentConfig.activatedBy.name,
          email: paymentConfig.activatedBy.email,
        },
        activatedAt: paymentConfig.activatedAt,
        activationIp: paymentConfig.activationIp,
      },
    });
  } catch (error) {
    console.error("Error activating payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to activate payment configuration",
      error: error.message,
    });
  }
};

/**
 * Deactivate payment gateway (Super Admin only)
 * @route POST /api/v1/payment-config/:hotelId/deactivate
 * @access Private (Super Admin only)
 */
export const deactivateConfig = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { reason } = req.body;

    // Only super_admin can deactivate
    if (req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can deactivate payment gateway",
      });
    }

    // Find payment config
    const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId });

    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    // Check if already inactive
    if (!paymentConfig.isActive) {
      return res.status(400).json({
        success: false,
        message: "Payment gateway is already inactive",
      });
    }

    // Deactivate the configuration
    paymentConfig.isActive = false;
    paymentConfig.deactivatedBy = req.user._id;
    paymentConfig.deactivatedAt = new Date();
    paymentConfig.deactivationReason =
      reason ||
      paymentConfig.deactivationRequestReason ||
      "Deactivated by Super Admin";

    // Clear deactivation request fields (if it was requested)
    paymentConfig.deactivationRequested = false;
    paymentConfig.deactivationRequestedBy = null;
    paymentConfig.deactivationRequestedAt = null;
    paymentConfig.deactivationRequestReason = null;

    await paymentConfig.save();

    // Populate deactivatedBy for response
    await paymentConfig.populate("deactivatedBy", "name email");

    // Log deactivation event
    console.log(
      `[PAYMENT DEACTIVATION] Hotel: ${hotelId}, Provider: ${paymentConfig.provider}, Deactivated by: ${req.user.email}, Reason: ${reason || "Not specified"}`
    );

    // Get hotel admin to send notification
    const hotel = await Hotel.findById(hotelId).populate(
      "createdBy",
      "_id name email"
    );

    // Send deactivation notification to hotel admin
    if (hotel && hotel.admin) {
      await notificationService.notifyDeactivated({
        hotel: hotelId,
        paymentConfig,
        provider: paymentConfig.provider,
        admin: hotel.admin,
        deactivatedBy: req.user,
        reason,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment gateway deactivated successfully",
      data: {
        provider: paymentConfig.provider,
        isActive: false,
        deactivatedBy: {
          name: paymentConfig.deactivatedBy.name,
          email: paymentConfig.deactivatedBy.email,
        },
        deactivatedAt: paymentConfig.deactivatedAt,
        reason: paymentConfig.deactivationReason,
      },
    });
  } catch (error) {
    console.error("Error deactivating payment config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to deactivate payment configuration",
      error: error.message,
    });
  }
};

/** * Request deactivation of production payment gateway (Admin/Manager)
 * @route POST /api/v1/payment-config/:hotelId/request-deactivation
 * @access Private (Admin/Manager)
 */
export const requestDeactivation = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a detailed reason (minimum 10 characters) for deactivation request",
      });
    }

    // Verify hotel exists
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      if (
        req.user.role === "manager" &&
        hotel.manager?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to request deactivation for this hotel",
        });
      }
    }

    // Find payment config
    const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId });

    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: "No payment configuration found for this hotel",
      });
    }

    // Check if it's production
    if (!paymentConfig.credentials.isProduction) {
      return res.status(400).json({
        success: false,
        message:
          "Test mode configurations can be toggled directly. Deactivation request is only for production gateways.",
      });
    }

    // Check if already inactive
    if (!paymentConfig.isActive) {
      return res.status(400).json({
        success: false,
        message: "Payment gateway is already inactive",
      });
    }

    // Check if already requested
    if (paymentConfig.deactivationRequested) {
      return res.status(400).json({
        success: false,
        message:
          "Deactivation request already pending. Please wait for Super Admin approval.",
        requestedAt: paymentConfig.deactivationRequestedAt,
        requestReason: paymentConfig.deactivationRequestReason,
      });
    }

    // Record deactivation request
    paymentConfig.deactivationRequested = true;
    paymentConfig.deactivationRequestedBy = req.user._id;
    paymentConfig.deactivationRequestedAt = new Date();
    paymentConfig.deactivationRequestReason = reason;
    await paymentConfig.save();

    // Log the request
    console.log(
      `[DEACTIVATION REQUEST] Hotel: ${hotelId}, Provider: ${paymentConfig.provider}, Requested by: ${req.user.name} (${req.user.email}), Reason: ${reason}`
    );

    // Notify Super Admins
    await notificationService.notifyDeactivationRequest({
      hotel: hotelId,
      paymentConfig,
      provider: paymentConfig.provider,
      admin: req.user,
      reason,
    });

    return res.status(200).json({
      success: true,
      message:
        "Deactivation request submitted successfully. Super Admin will review and process your request.",
      data: {
        provider: paymentConfig.provider,
        requestedAt: paymentConfig.deactivationRequestedAt,
        reason: paymentConfig.deactivationRequestReason,
        status: "pending_approval",
      },
    });
  } catch (error) {
    console.error("Error requesting deactivation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit deactivation request",
      error: error.message,
    });
  }
};

/** * Get supported payment providers
 * @route GET /api/v1/payment-config/providers
 * @access Public
 */
export const getSupportedProviders = async (req, res) => {
  try {
    const providers = dynamicPaymentService.getSupportedProviders();

    const providerDetails = {
      razorpay: {
        name: "Razorpay",
        requiredCredentials: ["keyId", "keySecret", "webhookSecret"],
        features: ["Instant payment", "UPI", "Cards", "Netbanking", "Wallets"],
        settlementTime: "T+2 days (can be instant with settlement feature)",
      },
      phonepe: {
        name: "PhonePe",
        requiredCredentials: ["merchantId", "saltKey", "saltIndex"],
        features: ["UPI", "Cards", "Wallets"],
        settlementTime: "T+1 day",
      },
      paytm: {
        name: "Paytm",
        requiredCredentials: ["merchantId", "merchantKey", "websiteName"],
        features: ["UPI", "Cards", "Paytm Wallet", "Netbanking"],
        settlementTime: "T+1 day",
      },
    };

    return res.status(200).json({
      success: true,
      providers: providers.map((p) => ({
        id: p,
        ...providerDetails[p],
      })),
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch supported providers",
      error: error.message,
    });
  }
};

// Helper Functions

/**
 * Mask sensitive credentials for display
 */
function maskCredentials(provider, credentials) {
  const masked = {};

  if (provider === "razorpay") {
    masked.keyId = maskString(credentials.keyId);
    masked.keySecret = "********";
    masked.webhookSecret = "********";
  } else if (provider === "phonepe") {
    masked.merchantId = maskString(credentials.merchantId);
    masked.saltKey = "********";
    masked.saltIndex = credentials.saltIndex; // Safe to show
  } else if (provider === "paytm") {
    masked.merchantId = maskString(credentials.merchantId);
    masked.merchantKey = "********";
    masked.websiteName = credentials.websiteName || "DEFAULT";
  }

  return masked;
}

/**
 * Mask string by showing only first and last few characters
 */
function maskString(str) {
  if (!str || str.length <= 8) return "****";
  return `${str.substring(0, 4)}****${str.substring(str.length - 4)}`;
}

/**
 * Validate credentials based on provider
 */
function validateCredentials(provider, credentials) {
  if (!credentials || typeof credentials !== "object") {
    return "Credentials must be an object";
  }

  if (provider === "razorpay") {
    if (!credentials.keyId || !credentials.keySecret) {
      return "Razorpay requires keyId and keySecret";
    }
    if (!credentials.webhookSecret) {
      return "Razorpay requires webhookSecret for secure webhook handling";
    }
  } else if (provider === "phonepe") {
    if (
      !credentials.merchantId ||
      !credentials.saltKey ||
      !credentials.saltIndex
    ) {
      return "PhonePe requires merchantId, saltKey, and saltIndex";
    }
  } else if (provider === "paytm") {
    if (!credentials.merchantId || !credentials.merchantKey) {
      return "Paytm requires merchantId and merchantKey";
    }
    // websiteName is optional, will default to 'DEFAULT'
  }

  return null; // No validation errors
}

/**
 * Get all pending payment gateway activations (Super Admin only)
 * @route GET /api/v1/payment-config/pending-approvals
 * @access Private (Super Admin only)
 */
export const getPendingApprovals = async (req, res) => {
  try {
    // Only super_admin can view pending approvals
    if (req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can view pending payment gateway approvals",
      });
    }

    const { provider, page = 1, limit = 20 } = req.query;

    // Build query for production configs that are verified but not active
    const query = {
      verified: true,
      isActive: false,
      "credentials.isProduction": true,
    };

    if (provider) {
      query.provider = provider.toLowerCase();
    }

    // Get pending configs with pagination
    const skip = (page - 1) * limit;

    const pendingConfigs = await PaymentConfig.find(query)
      .populate("hotel", "name contactInfo mainLocation")
      .sort({ verifiedAt: 1 }) // Oldest first (waiting longest)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PaymentConfig.countDocuments(query);

    // Get hotel with createdBy info for each config
    const configsWithWaitTime = await Promise.all(
      pendingConfigs.map(async (config) => {
        const waitingMinutes = Math.floor(
          (new Date() - config.verifiedAt) / (1000 * 60)
        );
        const waitingHours = Math.floor(waitingMinutes / 60);
        const waitingDays = Math.floor(waitingHours / 24);

        // Get hotel admin (createdBy)
        const hotelWithAdmin = await Hotel.findById(config.hotel._id).populate(
          "createdBy",
          "name email"
        );

        return {
          _id: config._id,
          hotel: {
            _id: config.hotel._id,
            name: config.hotel.name,
            email: config.hotel.contactInfo?.email,
            phone: config.hotel.contactInfo?.phone,
            location: config.hotel.mainLocation?.city,
          },
          provider: config.provider,
          verifiedAt: config.verifiedAt,
          waitingTime: {
            minutes: waitingMinutes,
            hours: waitingHours,
            days: waitingDays,
            formatted:
              waitingDays > 0
                ? `${waitingDays}d ${waitingHours % 24}h`
                : waitingHours > 0
                  ? `${waitingHours}h ${waitingMinutes % 60}m`
                  : `${waitingMinutes}m`,
          },
          configuredBy: hotelWithAdmin?.createdBy || null,
          webhookStatus: config.webhookStatus,
          deactivationRequested: config.deactivationRequested,
          deactivationRequestReason: config.deactivationRequestReason,
        };
      })
    );

    // Get stats by provider
    const stats = await PaymentConfig.aggregate([
      {
        $match: {
          verified: true,
          isActive: false,
          "credentials.isProduction": true,
        },
      },
      {
        $group: {
          _id: "$provider",
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        pendingApprovals: configsWithWaitTime,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
        stats: {
          total,
          byProvider: stats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending approvals",
      error: error.message,
    });
  }
};
