import mongoose from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";

const paymentConfigSchema = new mongoose.Schema(
  {
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
      unique: true, // One payment configuration per hotel
    },

    // Payment provider
    provider: {
      type: String,
      enum: ["razorpay", "phonepe", "paytm", "none"],
      required: true,
      default: "none",
    },

    // Is this configuration active?
    isActive: {
      type: Boolean,
      default: false,
    },

    // Encrypted credentials (select: false for security)
    credentials: {
      // Razorpay specific
      keyId: { type: String, select: false },
      keySecret: { type: String, select: false },
      webhookSecret: { type: String, select: false },

      // PhonePe & Paytm common
      merchantId: { type: String, select: false },

      // PhonePe specific
      saltKey: { type: String, select: false },
      saltIndex: { type: Number, select: false },

      // Paytm specific
      merchantKey: { type: String, select: false },
      websiteName: { type: String, select: false, default: "DEFAULT" },

      // Environment flag
      isProduction: { type: Boolean, default: false },
    },

    // Webhook configuration
    webhookUrl: {
      type: String,
      trim: true,
    },
    callbackUrl: {
      type: String,
      trim: true,
    },

    // Verification status
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
    },
    verificationMethod: {
      type: String,
      enum: ["api_test", "test_payment", "manual", "pending"],
      default: "pending",
    },

    // Webhook health tracking
    lastWebhookReceivedAt: {
      type: Date,
    },
    webhookStatus: {
      type: String,
      enum: ["active", "inactive", "failed"],
      default: "inactive",
    },
    webhookFailureCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Settings
    autoRefundEnabled: {
      type: Boolean,
      default: true,
    },
    testMode: {
      type: Boolean,
      default: false,
    },

    // Production activation tracking (for security)
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    activatedAt: {
      type: Date,
    },
    activationIp: {
      type: String,
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    deactivatedAt: {
      type: Date,
    },
    deactivationReason: {
      type: String,
      maxlength: 500,
    },
    // Deactivation request (Admin can request, Super Admin approves)
    deactivationRequested: {
      type: Boolean,
      default: false,
    },
    deactivationRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    deactivationRequestedAt: {
      type: Date,
    },
    deactivationRequestReason: {
      type: String,
      maxlength: 500,
    },
    // Additional metadata
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
paymentConfigSchema.index({ hotel: 1, isActive: 1 });
paymentConfigSchema.index({ provider: 1 });
paymentConfigSchema.index({ webhookStatus: 1 });

// Pre-save middleware to encrypt credentials
paymentConfigSchema.pre("save", function (next) {
  if (this.isModified("credentials")) {
    const creds = this.credentials.toObject
      ? this.credentials.toObject()
      : this.credentials;

    // Encrypt each credential field if it exists and is not already encrypted
    if (creds.keyId && !creds.keyId.includes(":")) {
      this.credentials.keyId = encrypt(creds.keyId);
    }
    if (creds.keySecret && !creds.keySecret.includes(":")) {
      this.credentials.keySecret = encrypt(creds.keySecret);
    }
    if (creds.webhookSecret && !creds.webhookSecret.includes(":")) {
      this.credentials.webhookSecret = encrypt(creds.webhookSecret);
    }
    if (creds.merchantId && !creds.merchantId.includes(":")) {
      this.credentials.merchantId = encrypt(creds.merchantId);
    }
    if (creds.saltKey && !creds.saltKey.includes(":")) {
      this.credentials.saltKey = encrypt(creds.saltKey);
    }
    if (creds.saltIndex && !creds.saltIndex.includes(":")) {
      this.credentials.saltIndex = encrypt(creds.saltIndex.toString());
    }
    if (creds.merchantKey && !creds.merchantKey.includes(":")) {
      this.credentials.merchantKey = encrypt(creds.merchantKey);
    }
    if (creds.websiteName && !creds.websiteName.includes(":")) {
      this.credentials.websiteName = encrypt(creds.websiteName);
    }
  }
  next();
});

// Method to get decrypted credentials
paymentConfigSchema.methods.getDecryptedCredentials = function () {
  const creds = this.credentials.toObject
    ? this.credentials.toObject()
    : this.credentials;
  const decrypted = {};

  if (creds.keyId) decrypted.keyId = decrypt(creds.keyId);
  if (creds.keySecret) decrypted.keySecret = decrypt(creds.keySecret);
  if (creds.webhookSecret)
    decrypted.webhookSecret = decrypt(creds.webhookSecret);
  if (creds.merchantId) decrypted.merchantId = decrypt(creds.merchantId);
  if (creds.saltKey) decrypted.saltKey = decrypt(creds.saltKey);
  if (creds.saltIndex) decrypted.saltIndex = decrypt(creds.saltIndex);
  if (creds.merchantKey) decrypted.merchantKey = decrypt(creds.merchantKey);
  if (creds.websiteName) decrypted.websiteName = decrypt(creds.websiteName);
  decrypted.isProduction = creds.isProduction;

  return decrypted;
};

// Method to check if configuration is ready
paymentConfigSchema.methods.isReady = function () {
  return this.isActive && this.verified && this.webhookStatus === "active";
};

// Method to increment webhook failure count
paymentConfigSchema.methods.recordWebhookFailure = async function () {
  this.webhookFailureCount += 1;
  if (this.webhookFailureCount >= 5) {
    this.webhookStatus = "failed";
  }
  await this.save();
};

// Method to reset webhook health
paymentConfigSchema.methods.recordWebhookSuccess = async function () {
  this.lastWebhookReceivedAt = new Date();
  this.webhookStatus = "active";
  this.webhookFailureCount = 0;
  await this.save();
};

export const PaymentConfig = mongoose.model(
  "PaymentConfig",
  paymentConfigSchema
);
