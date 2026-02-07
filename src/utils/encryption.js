import crypto from "crypto";

// Use 32-byte key from environment or generate one (for development only)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, "hex")
  : crypto.randomBytes(32);

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data using AES-256-CBC
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
export const encrypt = (text) => {
  if (!text) return "";

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Return IV and encrypted data separated by colon
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error.message);
    throw new Error("Failed to encrypt data");
  }
};

/**
 * Decrypt encrypted data
 * @param {string} text - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted plain text
 */
export const decrypt = (text) => {
  if (!text) return "";

  try {
    const parts = text.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw new Error("Failed to decrypt data");
  }
};

/**
 * Generate a random encryption key (run once and save to .env)
 * @returns {string} - 64 character hex string
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Log warning if using default key in production
if (!process.env.ENCRYPTION_KEY) {
  console.warn(
    "⚠️  WARNING: Using default encryption key. Set ENCRYPTION_KEY in .env for production!"
  );
  console.log(
    "💡 Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}
