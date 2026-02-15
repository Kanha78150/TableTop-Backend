import QRCode from "qrcode";
import { APIError } from "../utils/APIError.js";

/**
 * QR Code Service for Table Management
 * Handles QR code generation, encoding, and URL creation
 */
class QRCodeService {
  constructor() {
    this.baseUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    this.qrOptions = {
      errorCorrectionLevel: "M",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      color: {
        dark: "#C13584",
        light: "#FFFFFF",
      },
      width: 256,
    };
  }

  /**
   * Generate scan URL for QR code
   * @param {string} hotelId - Hotel ID
   * @param {string} branchId - Branch ID (optional)
   * @param {string} tableNo - Table number
   * @returns {string} - Scan URL
   */
  generateScanUrl(hotelId, branchId, tableNo) {
    let url = `${
      this.baseUrl
    }/scan?hotelId=${hotelId}&tableNo=${encodeURIComponent(tableNo)}`;

    if (branchId && branchId !== "null" && branchId !== "undefined") {
      url += `&branchId=${branchId}`;
    }

    return url;
  }

  /**
   * Generate QR code data object
   * @param {string} hotelId - Hotel ID
   * @param {string} branchId - Branch ID (optional)
   * @param {string} tableNo - Table number
   * @returns {Object} - QR code data
   */
  generateQRData(hotelId, branchId, tableNo) {
    return {
      hotelId,
      branchId: branchId || null,
      tableNo,
      timestamp: new Date().toISOString(),
      type: "table_scan",
    };
  }

  /**
   * Generate QR code image (Base64)
   * @param {string} data - Data to encode in QR
   * @param {Object} options - QR code options (optional)
   * @returns {Promise<string>} - Base64 encoded QR code image
   */
  async generateQRImage(data, options = {}) {
    try {
      const qrOptions = { ...this.qrOptions, ...options };
      const qrCodeImage = await QRCode.toDataURL(data, qrOptions);
      return qrCodeImage;
    } catch (error) {
      throw new APIError(500, "Failed to generate QR code image", [
        error.message,
      ]);
    }
  }

  /**
   * Generate complete QR code object for table
   * @param {string} hotelId - Hotel ID
   * @param {string} branchId - Branch ID (optional)
   * @param {string} tableNo - Table number
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Complete QR code object
   */
  async generateTableQR(hotelId, branchId, tableNo, options = {}) {
    try {
      // Generate scan URL
      const scanUrl = this.generateScanUrl(hotelId, branchId, tableNo);

      // Generate QR data
      const qrData = this.generateQRData(hotelId, branchId, tableNo);

      // Generate QR code image
      const qrImage = await this.generateQRImage(scanUrl, options.qrOptions);

      return {
        data: JSON.stringify(qrData),
        image: qrImage,
        scanUrl,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to generate table QR code", [
        error.message,
      ]);
    }
  }

  /**
   * Generate multiple QR codes for bulk table creation
   * @param {string} hotelId - Hotel ID
   * @param {string} branchId - Branch ID (optional)
   * @param {number} totalTables - Number of tables to create
   * @param {number} startingNumber - Starting table number
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} - Array of QR code objects
   */
  async generateBulkTableQRs(
    hotelId,
    branchId,
    totalTables,
    startingNumber = 1,
    options = {}
  ) {
    try {
      const qrCodes = [];
      const batchSize = 10; // Process in batches to avoid overwhelming the system

      for (let i = 0; i < totalTables; i += batchSize) {
        const batch = [];
        const currentBatchSize = Math.min(batchSize, totalTables - i);

        // Create batch of promises
        for (let j = 0; j < currentBatchSize; j++) {
          const tableNumber = (startingNumber + i + j).toString();
          batch.push(
            this.generateTableQR(hotelId, branchId, tableNumber, options)
          );
        }

        // Wait for batch to complete
        const batchResults = await Promise.all(batch);
        qrCodes.push(...batchResults);

        // Add small delay between batches to prevent system overload
        if (i + batchSize < totalTables) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      return qrCodes;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to generate bulk QR codes", [
        error.message,
      ]);
    }
  }

  /**
   * Parse QR scan data from URL or QR code data
   * @param {string} data - QR code data or scan URL
   * @returns {Object} - Parsed scan data
   */
  parseQRScanData(data) {
    try {
      // Try to parse as JSON first (if it's QR data)
      try {
        const parsed = JSON.parse(data);
        if (parsed.hotelId && parsed.tableNo) {
          return {
            hotelId: parsed.hotelId,
            branchId: parsed.branchId,
            tableNo: parsed.tableNo,
            timestamp: parsed.timestamp,
            type: parsed.type || "table_scan",
          };
        }
      } catch (e) {
        // Not JSON, continue to URL parsing
      }

      // Parse as URL
      const url = new URL(data);
      const params = url.searchParams;

      const scanData = {
        hotelId: params.get("hotelId"),
        branchId: params.get("branchId"),
        tableNo: params.get("tableNo"),
        timestamp: new Date().toISOString(),
        type: "table_scan",
      };

      if (!scanData.hotelId || !scanData.tableNo) {
        throw new Error("Invalid QR code data: missing required parameters");
      }

      return scanData;
    } catch (error) {
      throw new APIError(400, "Invalid QR code data", [error.message]);
    }
  }

  /**
   * Validate QR code data
   * @param {Object} scanData - Parsed scan data
   * @returns {boolean} - Validation result
   */
  validateQRData(scanData) {
    return !!(
      scanData &&
      scanData.hotelId &&
      scanData.tableNo &&
      scanData.type === "table_scan"
    );
  }

  /**
   * Generate QR code for custom data (not just tables)
   * @param {Object|string} data - Data to encode
   * @param {Object} options - QR code options
   * @returns {Promise<string>} - Base64 encoded QR code
   */
  async generateCustomQR(data, options = {}) {
    try {
      const dataString = typeof data === "string" ? data : JSON.stringify(data);
      return await this.generateQRImage(dataString, options);
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to generate custom QR code", [
        error.message,
      ]);
    }
  }

  /**
   * Get QR code options for different use cases
   * @param {string} type - QR code type ('table', 'menu', 'payment', etc.)
   * @returns {Object} - QR code options
   */
  getQROptionsForType(type) {
    const baseOptions = { ...this.qrOptions };

    switch (type) {
      case "table":
        return {
          ...baseOptions,
          width: 256,
          color: {
            dark: "#2563EB", // Blue for table QRs
            light: "#FFFFFF",
          },
        };

      case "menu":
        return {
          ...baseOptions,
          width: 200,
          color: {
            dark: "#059669", // Green for menu QRs
            light: "#FFFFFF",
          },
        };

      case "payment":
        return {
          ...baseOptions,
          width: 300,
          color: {
            dark: "#DC2626", // Red for payment QRs
            light: "#FFFFFF",
          },
        };

      default:
        return baseOptions;
    }
  }
}

export default new QRCodeService();
