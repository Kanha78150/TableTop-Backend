// src/controllers/admin/accountingController.js - Admin Accounting & Transactions Controller
import mongoose from "mongoose";
import { Transaction } from "../../models/Transaction.model.js";
import { Order } from "../../models/Order.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import fs from "fs";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


/**
 * Get all transactions history with filters
 * GET /api/v1/admin/accounting/transactions
 * @access Admin
 */
export const getAllTransactions = asyncHandler(async (req, res) => {
  // Use validated query parameters if available, otherwise fallback to req.query
  const queryParams = req.validatedQuery || req.query;

  const {
    page = 1,
    limit = 20,
    hotelId,
    branchId,
    status,
    paymentMethod,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = queryParams;

  // Build query for Transaction model
  const query = {};

  if (hotelId) query.hotel = new mongoose.Types.ObjectId(hotelId);
  if (branchId) query.branch = new mongoose.Types.ObjectId(branchId);
  if (status) query.status = status;
  if (paymentMethod) query.paymentMethod = paymentMethod;

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // Amount range filter
  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = parseFloat(minAmount);
    if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
  }

  // Execute query with pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const [transactions, totalCount] = await Promise.all([
    Transaction.find(query)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .populate("user", "name email phone")
      .populate("order", "totalPrice items")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Transaction.countDocuments(query),
  ]);

  // Calculate summary statistics using aggregation
  const summaryPipeline = [
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
        totalTransactions: { $sum: 1 },
        successfulTransactions: {
          $sum: {
            $cond: [{ $eq: ["$status", "success"] }, 1, 0],
          },
        },
        failedTransactions: {
          $sum: {
            $cond: [{ $eq: ["$status", "failed"] }, 1, 0],
          },
        },
        pendingTransactions: {
          $sum: {
            $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
          },
        },
        avgTransactionAmount: { $avg: "$amount" },
      },
    },
  ];

  const [summaryStats] = await Transaction.aggregate(summaryPipeline);

  const stats = summaryStats || {
    totalAmount: 0,
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    pendingTransactions: 0,
    avgTransactionAmount: 0,
  };

  res.status(200).json(
    new APIResponse(
      200,
      {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalTransactions: totalCount,
          hasNext: skip + parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1,
        },
        summary: {
          totalAmount: parseFloat(stats.totalAmount?.toFixed(2) || 0),
          totalTransactions: stats.totalTransactions || 0,
          successfulTransactions: stats.successfulTransactions || 0,
          failedTransactions: stats.failedTransactions || 0,
          pendingTransactions: stats.pendingTransactions || 0,
          avgTransactionAmount: parseFloat(
            stats.avgTransactionAmount?.toFixed(2) || 0
          ),
          successRate:
            stats.totalTransactions > 0
              ? parseFloat(
                  (
                    (stats.successfulTransactions / stats.totalTransactions) *
                    100
                  ).toFixed(2)
                )
              : 0,
        },
        filters: {
          hotelId,
          branchId,
          status,
          paymentMethod,
          startDate,
          endDate,
          minAmount,
          maxAmount,
        },
      },
      "Transactions retrieved successfully"
    )
  );
  });

/**
 * Get hotel-wise accounting summary
 * GET /api/v1/admin/accounting/hotels
 * @access Admin
 */
export const getHotelWiseAccounting = asyncHandler(async (req, res) => {
  const queryParams = req.validatedQuery || req.query;
  const { startDate, endDate, status = "success" } = queryParams;

  // Build date filter
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateFilter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.createdAt.$lte = end;
    }
  }

  const pipeline = [
    {
      $match: {
        status: status,
        ...dateFilter,
      },
    },
    {
      $group: {
        _id: "$hotel",
        totalRevenue: { $sum: "$amount" },
        totalTransactions: { $sum: 1 },
        avgTransactionAmount: { $avg: "$amount" },
        paymentMethods: {
          $push: {
            method: "$paymentMethod",
            amount: "$amount",
          },
        },
      },
    },
    {
      $lookup: {
        from: "hotels",
        localField: "_id",
        foreignField: "_id",
        as: "hotelDetails",
      },
    },
    {
      $unwind: "$hotelDetails",
    },
    {
      $addFields: {
        paymentBreakdown: {
          $reduce: {
            input: "$paymentMethods",
            initialValue: {},
            in: {
              $mergeObjects: [
                "$$value",
                {
                  $arrayToObject: [
                    [
                      {
                        k: "$$this.method",
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                {
                                  $getField: {
                                    field: "$$this.method",
                                    input: "$$value",
                                  },
                                },
                                0,
                              ],
                            },
                            "$$this.amount",
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $sort: { totalRevenue: -1 },
    },
  ];

  const hotelAccounting = await Transaction.aggregate(pipeline);

  // Calculate overall totals
  const overallTotals = hotelAccounting.reduce(
    (acc, hotel) => ({
      totalRevenue: acc.totalRevenue + hotel.totalRevenue,
      totalTransactions: acc.totalTransactions + hotel.totalTransactions,
    }),
    { totalRevenue: 0, totalTransactions: 0 }
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        hotels: hotelAccounting.map((hotel) => ({
          hotelId: hotel._id,
          hotelName: hotel.hotelDetails.name,
          hotelCode: hotel.hotelDetails.hotelId,
          location: hotel.hotelDetails.location,
          totalRevenue: parseFloat(hotel.totalRevenue.toFixed(2)),
          totalTransactions: hotel.totalTransactions,
          avgTransactionAmount: parseFloat(
            hotel.avgTransactionAmount.toFixed(2)
          ),
          paymentBreakdown: hotel.paymentBreakdown,
          revenueShare: parseFloat(
            ((hotel.totalRevenue / overallTotals.totalRevenue) * 100).toFixed(
              2
            )
          ),
        })),
        summary: {
          totalRevenue: parseFloat(overallTotals.totalRevenue.toFixed(2)),
          totalTransactions: overallTotals.totalTransactions,
          totalHotels: hotelAccounting.length,
          avgRevenuePerHotel: parseFloat(
            (overallTotals.totalRevenue / hotelAccounting.length).toFixed(2)
          ),
        },
        filters: { startDate, endDate, status },
      },
      "Hotel-wise accounting retrieved successfully"
    )
  );
  });

/**
 * Get branch-wise accounting summary
 * GET /api/v1/admin/accounting/branches
 * @access Admin
 */
export const getBranchWiseAccounting = asyncHandler(async (req, res) => {
  const queryParams = req.validatedQuery || req.query;
  const { hotelId, startDate, endDate, status = "success" } = queryParams;

  // Build match filter
  const matchFilter = { status: status };
  if (hotelId) matchFilter.hotel = new mongoose.Types.ObjectId(hotelId);
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchFilter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchFilter.createdAt.$lte = end;
    }
  }

  const pipeline = [
    { $match: matchFilter },
    {
      $group: {
        _id: {
          branch: "$branch",
          hotel: "$hotel",
        },
        totalRevenue: { $sum: "$amount" },
        totalTransactions: { $sum: 1 },
        avgTransactionAmount: { $avg: "$amount" },
        dailyRevenue: {
          $push: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            amount: "$amount",
          },
        },
      },
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id.branch",
        foreignField: "_id",
        as: "branchDetails",
      },
    },
    {
      $lookup: {
        from: "hotels",
        localField: "_id.hotel",
        foreignField: "_id",
        as: "hotelDetails",
      },
    },
    {
      $unwind: "$branchDetails",
    },
    {
      $unwind: "$hotelDetails",
    },
    {
      $sort: { totalRevenue: -1 },
    },
  ];

  const branchAccounting = await Transaction.aggregate(pipeline);

  // Process daily revenue data
  const processedData = branchAccounting.map((branch) => {
    const dailyData = branch.dailyRevenue.reduce((acc, item) => {
      acc[item.date] = (acc[item.date] || 0) + item.amount;
      return acc;
    }, {});

    return {
      branchId: branch._id.branch,
      branchName: branch.branchDetails.name,
      branchCode: branch.branchDetails.branchId,
      hotelId: branch._id.hotel,
      hotelName: branch.hotelDetails.name,
      location: branch.branchDetails.location,
      totalRevenue: parseFloat(branch.totalRevenue.toFixed(2)),
      totalTransactions: branch.totalTransactions,
      avgTransactionAmount: parseFloat(
        branch.avgTransactionAmount.toFixed(2)
      ),
      dailyRevenue: dailyData,
    };
  });

  const summary = processedData.reduce(
    (acc, branch) => ({
      totalRevenue: acc.totalRevenue + branch.totalRevenue,
      totalTransactions: acc.totalTransactions + branch.totalTransactions,
    }),
    { totalRevenue: 0, totalTransactions: 0 }
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        branches: processedData,
        summary: {
          totalRevenue: parseFloat(summary.totalRevenue.toFixed(2)),
          totalTransactions: summary.totalTransactions,
          totalBranches: processedData.length,
          avgRevenuePerBranch: parseFloat(
            (summary.totalRevenue / processedData.length).toFixed(2)
          ),
        },
        filters: { hotelId, startDate, endDate, status },
      },
      "Branch-wise accounting retrieved successfully"
    )
  );
  });

/**
 * Get settlement tracking & payout logs
 * GET /api/v1/admin/accounting/settlements
 * @access Admin
 */
export const getSettlements = asyncHandler(async (req, res) => {
  const queryParams = req.validatedQuery || req.query;
  const {
    page = 1,
    limit = 20,
    hotelId,
    branchId,
    status,
    startDate,
    endDate,
    payoutStatus = "all",
  } = queryParams;

  // Build match filter for Transaction model
  // Default to "success" for settlements, but allow override if specified
  const matchFilter = {};
  matchFilter.status = status || "success";
  if (hotelId) matchFilter.hotel = new mongoose.Types.ObjectId(hotelId);
  if (branchId) matchFilter.branch = new mongoose.Types.ObjectId(branchId);

  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchFilter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchFilter.createdAt.$lte = end;
    }
  }

  // Build aggregation pipeline for settlements
  const pipeline = [
    {
      $match: matchFilter,
    },
    {
      $addFields: {
        settlementDate: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
          },
        },
      },
    },
    {
      $group: {
        _id: {
          hotel: "$hotel",
          branch: "$branch",
          date: "$settlementDate",
        },
        totalAmount: { $sum: "$amount" },
        transactionCount: { $sum: 1 },
        transactions: {
          $push: {
            transactionId: "$transactionId",
            orderId: "$order",
            amount: "$amount",
            paymentMethod: "$paymentMethod",
            createdAt: "$createdAt",
          },
        },
      },
    },
    {
      $lookup: {
        from: "hotels",
        localField: "_id.hotel",
        foreignField: "_id",
        as: "hotelDetails",
      },
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id.branch",
        foreignField: "_id",
        as: "branchDetails",
      },
    },
    {
      $unwind: "$hotelDetails",
    },
    {
      $unwind: "$branchDetails",
    },
    {
      $addFields: {
        settlementStatus: {
          $switch: {
            branches: [
              {
                case: { $lt: [{ $dayOfMonth: new Date() }, 5] },
                then: "pending",
              },
              {
                case: {
                  $and: [
                    { $gte: [{ $dayOfMonth: new Date() }, 5] },
                    { $lt: [{ $dayOfMonth: new Date() }, 10] },
                  ],
                },
                then: "processing",
              },
            ],
            default: "settled",
          },
        },
        estimatedPayoutDate: {
          $dateAdd: {
            startDate: { $dateFromString: { dateString: "$_id.date" } },
            unit: "day",
            amount: 7,
          },
        },
      },
    },
    {
      $sort: { "_id.date": -1, totalAmount: -1 },
    },
  ];

  // Add pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: parseInt(limit) });

  const settlements = await Transaction.aggregate(pipeline);

  // Get total count for pagination
  const countPipeline = [...pipeline.slice(0, -2), { $count: "total" }];
  const [countResult] = await Transaction.aggregate(countPipeline);
  const totalCount = countResult?.total || 0;

  // Calculate settlement summary
  const summaryPipeline = [
    ...pipeline.slice(0, -3),
    {
      $group: {
        _id: null,
        totalSettlementAmount: { $sum: "$totalAmount" },
        totalSettlements: { $sum: 1 },
        pendingAmount: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "pending"] },
              "$totalAmount",
              0,
            ],
          },
        },
        processingAmount: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "processing"] },
              "$totalAmount",
              0,
            ],
          },
        },
        settledAmount: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "settled"] },
              "$totalAmount",
              0,
            ],
          },
        },
      },
    },
  ];

  const [settlementSummary] = await Transaction.aggregate(summaryPipeline);

  res.status(200).json(
    new APIResponse(
      200,
      {
        settlements: settlements.map((settlement) => ({
          settlementId: `SET-${settlement._id.date}-${settlement._id.hotel
            .toString()
            .slice(-6)}`,
          hotelId: settlement._id.hotel,
          hotelName: settlement.hotelDetails.name,
          branchId: settlement._id.branch,
          branchName: settlement.branchDetails.name,
          settlementDate: settlement._id.date,
          totalAmount: parseFloat(settlement.totalAmount.toFixed(2)),
          transactionCount: settlement.transactionCount,
          settlementStatus: settlement.settlementStatus,
          estimatedPayoutDate: settlement.estimatedPayoutDate,
          transactions: settlement.transactions,
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalSettlements: totalCount,
          hasNext: skip + parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1,
        },
        summary: {
          totalSettlementAmount: parseFloat(
            (settlementSummary?.totalSettlementAmount || 0).toFixed(2)
          ),
          totalSettlements: settlementSummary?.totalSettlements || 0,
          pendingAmount: parseFloat(
            (settlementSummary?.pendingAmount || 0).toFixed(2)
          ),
          processingAmount: parseFloat(
            (settlementSummary?.processingAmount || 0).toFixed(2)
          ),
          settledAmount: parseFloat(
            (settlementSummary?.settledAmount || 0).toFixed(2)
          ),
        },
      },
      "Settlements retrieved successfully"
    )
  );
  });

/**
 * Export transactions report
 * POST /api/v1/admin/accounting/export
 * @access Admin
 */
export const exportReport = asyncHandler(async (req, res, next) => {
  const {
    format = "csv", // csv, excel, pdf
    reportType = "transactions", // transactions, hotels, branches, settlements
    hotelId,
    branchId,
    startDate,
    endDate,
    status,
  } = req.body;

  // Validate format
  if (!["csv", "excel", "pdf"].includes(format)) {
    return next(
      new APIError(400, "Invalid export format. Supported: csv, excel, pdf")
    );
  }

  // Build query based on report type
  let data;
  let filename;
  let headers;

  switch (reportType) {
    case "transactions":
      data = await getTransactionsForExport({
        hotelId,
        branchId,
        startDate,
        endDate,
        status,
      });
      filename = `transactions_report_${
        new Date().toISOString().split("T")[0]
      }`;
      headers = [
        { id: "transactionId", title: "Transaction ID" },
        { id: "orderId", title: "Order ID" },
        { id: "hotelName", title: "Hotel" },
        { id: "branchName", title: "Branch" },
        { id: "customerName", title: "Customer" },
        { id: "amount", title: "Amount (₹)" },
        { id: "paymentMethod", title: "Payment Method" },
        { id: "status", title: "Status" },
        { id: "createdAt", title: "Date" },
      ];
      break;

    case "hotels":
      data = await getHotelsForExport({ startDate, endDate, status });
      filename = `hotels_accounting_${
        new Date().toISOString().split("T")[0]
      }`;
      headers = [
        { id: "hotelName", title: "Hotel Name" },
        { id: "hotelCode", title: "Hotel Code" },
        { id: "location", title: "Location" },
        { id: "totalRevenue", title: "Total Revenue (₹)" },
        { id: "totalTransactions", title: "Total Transactions" },
        { id: "avgTransactionAmount", title: "Avg Transaction (₹)" },
        { id: "revenueShare", title: "Revenue Share (%)" },
      ];
      break;

    case "branches":
      data = await getBranchesForExport({
        hotelId,
        startDate,
        endDate,
        status,
      });
      filename = `branches_accounting_${
        new Date().toISOString().split("T")[0]
      }`;
      headers = [
        { id: "hotelName", title: "Hotel" },
        { id: "branchName", title: "Branch Name" },
        { id: "branchCode", title: "Branch Code" },
        { id: "location", title: "Location" },
        { id: "totalRevenue", title: "Total Revenue (₹)" },
        { id: "totalTransactions", title: "Total Transactions" },
        { id: "avgTransactionAmount", title: "Avg Transaction (₹)" },
      ];
      break;

    case "settlements":
      data = await getSettlementsForExport({
        hotelId,
        branchId,
        startDate,
        endDate,
      });
      filename = `settlements_report_${
        new Date().toISOString().split("T")[0]
      }`;
      headers = [
        { id: "settlementId", title: "Settlement ID" },
        { id: "hotelName", title: "Hotel" },
        { id: "branchName", title: "Branch" },
        { id: "settlementDate", title: "Settlement Date" },
        { id: "totalAmount", title: "Amount (₹)" },
        { id: "transactionCount", title: "Transaction Count" },
        { id: "settlementStatus", title: "Status" },
        { id: "estimatedPayoutDate", title: "Estimated Payout" },
      ];
      break;

    default:
      return next(new APIError(400, "Invalid report type"));
  }

  // Validate data and headers
  if (!Array.isArray(data)) {
    return next(
      new APIError(500, "Invalid data format received from export function")
    );
  }
  if (!Array.isArray(headers)) {
    return next(new APIError(500, "Invalid headers format"));
  }

  // Generate file based on format
  let filePath;
  let contentType;

  switch (format) {
    case "csv":
      filePath = await generateCSV(data, headers, filename);
      contentType = "text/csv";
      break;

    case "excel":
      filePath = await generateExcel(data, headers, filename, reportType);
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      break;

    case "pdf":
      filePath = await generatePDF(data, headers, filename, reportType);
      contentType = "application/pdf";
      break;
  }

  // Send file
  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}.${format}"`
  );

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  // Clean up file after sending
  fileStream.on("end", () => {
    fs.unlink(filePath, (err) => {
      if (err) logger.error("Error deleting temp file:", err);
    });
  });
  });

// Helper functions for data export
async function getTransactionsForExport(filters) {
  const query = {};
  if (filters.hotelId)
    query.hotel = new mongoose.Types.ObjectId(filters.hotelId);
  if (filters.branchId)
    query.branch = new mongoose.Types.ObjectId(filters.branchId);
  if (filters.status) query.status = filters.status;

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const transactions = await Transaction.find(query)
    .populate("hotel", "name hotelId")
    .populate("branch", "name branchId")
    .populate("user", "name email")
    .populate("order", "_id")
    .sort({ createdAt: -1 })
    .limit(10000); // Limit for performance

  return transactions.map((txn) => ({
    transactionId: txn.transactionId || txn._id.toString(),
    orderId: txn.order?._id?.toString() || "N/A",
    hotelName: txn.hotel?.name || "N/A",
    branchName: txn.branch?.name || "N/A",
    customerName: txn.user?.name || "N/A",
    amount: txn.amount,
    paymentMethod: txn.paymentMethod || "cash",
    status: txn.status,
    createdAt: txn.createdAt.toISOString().split("T")[0],
  }));
}

async function getHotelsForExport(filters) {
  try {
    // Build match filter
    const matchFilter = { status: filters.status || "success" };

    if (filters.startDate || filters.endDate) {
      matchFilter.createdAt = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        matchFilter.createdAt.$gte = start;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        matchFilter.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: "$hotel",
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
        },
      },
      {
        $lookup: {
          from: "hotels",
          localField: "_id",
          foreignField: "_id",
          as: "hotelDetails",
        },
      },
      { $unwind: "$hotelDetails" },
      { $sort: { totalRevenue: -1 } },
    ];

    const result = await Transaction.aggregate(pipeline);
    const totalRevenue = result.reduce(
      (sum, hotel) => sum + hotel.totalRevenue,
      0
    );

    return result.map((hotel) => ({
      hotelName: hotel.hotelDetails?.name || "Unknown Hotel",
      hotelCode: hotel.hotelDetails?.hotelId || "N/A",
      location:
        hotel.hotelDetails?.location?.city &&
        hotel.hotelDetails?.location?.state
          ? `${hotel.hotelDetails.location.city}, ${hotel.hotelDetails.location.state}`
          : hotel.hotelDetails?.location?.address || "Location not available",
      totalRevenue: parseFloat(hotel.totalRevenue.toFixed(2)),
      totalTransactions: hotel.totalTransactions,
      avgTransactionAmount: parseFloat(hotel.avgTransactionAmount.toFixed(2)),
      revenueShare: parseFloat(
        ((hotel.totalRevenue / totalRevenue) * 100).toFixed(2)
      ),
    }));
  } catch (error) {
    logger.error("Error in getHotelsForExport:", error);
    throw new APIError(
      500,
      `Failed to generate hotels export data: ${error.message}`
    );
  }
}

async function getBranchesForExport(filters) {
  try {
    const matchFilter = { status: filters.status || "success" };
    if (filters.hotelId)
      matchFilter.hotel = new mongoose.Types.ObjectId(filters.hotelId);

    if (filters.startDate || filters.endDate) {
      matchFilter.createdAt = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        matchFilter.createdAt.$gte = start;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        matchFilter.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: { branch: "$branch", hotel: "$hotel" },
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$amount" },
        },
      },
      {
        $lookup: {
          from: "branches",
          localField: "_id.branch",
          foreignField: "_id",
          as: "branchDetails",
        },
      },
      {
        $lookup: {
          from: "hotels",
          localField: "_id.hotel",
          foreignField: "_id",
          as: "hotelDetails",
        },
      },
      { $unwind: "$branchDetails" },
      { $unwind: "$hotelDetails" },
      { $sort: { totalRevenue: -1 } },
    ];

    const result = await Transaction.aggregate(pipeline);

    return result.map((branch) => ({
      hotelName: branch.hotelDetails?.name || "Unknown Hotel",
      branchName: branch.branchDetails?.name || "Unknown Branch",
      branchCode: branch.branchDetails?.branchId || "N/A",
      location:
        branch.branchDetails?.location?.city &&
        branch.branchDetails?.location?.state
          ? `${branch.branchDetails.location.city}, ${branch.branchDetails.location.state}`
          : branch.branchDetails?.location?.address || "Location not available",
      totalRevenue: parseFloat(branch.totalRevenue.toFixed(2)),
      totalTransactions: branch.totalTransactions,
      avgTransactionAmount: parseFloat(branch.avgTransactionAmount.toFixed(2)),
    }));
  } catch (error) {
    logger.error("Error in getBranchesForExport:", error);
    throw new APIError(
      500,
      `Failed to generate branches export data: ${error.message}`
    );
  }
}

async function getSettlementsForExport(filters) {
  // Build match filter
  const matchFilter = { status: "success" };
  if (filters.hotelId)
    matchFilter.hotel = new mongoose.Types.ObjectId(filters.hotelId);
  if (filters.branchId)
    matchFilter.branch = new mongoose.Types.ObjectId(filters.branchId);

  if (filters.startDate || filters.endDate) {
    matchFilter.createdAt = {};
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      matchFilter.createdAt.$gte = start;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      matchFilter.createdAt.$lte = end;
    }
  }

  const pipeline = [
    { $match: matchFilter },
    {
      $addFields: {
        settlementDate: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
      },
    },
    {
      $group: {
        _id: { hotel: "$hotel", branch: "$branch", date: "$settlementDate" },
        totalAmount: { $sum: "$amount" },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "hotels",
        localField: "_id.hotel",
        foreignField: "_id",
        as: "hotelDetails",
      },
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id.branch",
        foreignField: "_id",
        as: "branchDetails",
      },
    },
    { $unwind: "$hotelDetails" },
    { $unwind: "$branchDetails" },
    { $sort: { "_id.date": -1 } },
  ];

  const result = await Transaction.aggregate(pipeline);

  return result.map((settlement) => {
    const settDate = new Date(settlement._id.date);
    const payoutDate = new Date(settDate);
    payoutDate.setDate(payoutDate.getDate() + 7);

    return {
      settlementId: `SET-${settlement._id.date}-${settlement._id.hotel
        .toString()
        .slice(-6)}`,
      hotelName: settlement.hotelDetails.name,
      branchName: settlement.branchDetails.name,
      settlementDate: settlement._id.date,
      totalAmount: parseFloat(settlement.totalAmount.toFixed(2)),
      transactionCount: settlement.transactionCount,
      settlementStatus:
        settDate < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          ? "settled"
          : "pending",
      estimatedPayoutDate: payoutDate.toISOString().split("T")[0],
    };
  });
}

// File generation functions
async function generateCSV(data, headers, filename) {
  const filePath = path.join(process.cwd(), "temp", `${filename}.csv`);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: headers,
  });

  await csvWriter.writeRecords(data);
  return filePath;
}

async function generateExcel(data, headers, filename, reportType) {
  try {
    const filePath = path.join(process.cwd(), "temp", `${filename}.xlsx`);

    // Ensure temp directory exists
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Validate inputs
    if (!Array.isArray(data)) {
      throw new Error("Data must be an array");
    }
    if (!Array.isArray(headers)) {
      throw new Error("Headers must be an array");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      reportType.charAt(0).toUpperCase() + reportType.slice(1)
    );

    // Add headers
    const headerRow = worksheet.addRow(
      headers.map((h) => h.title || "Unknown")
    );
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add data
    if (data.length > 0) {
      data.forEach((row) => {
        const rowData = headers.map((header) => row[header.id] || "");
        worksheet.addRow(rowData);
      });
    } else {
      // Add empty row if no data
      worksheet.addRow(headers.map(() => "No data available"));
    }

    // Auto-size columns
    worksheet.columns.forEach((column, index) => {
      const headerLength = headers[index]?.title?.length || 10;
      column.width = Math.max(headerLength + 2, 15);
    });

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  } catch (error) {
    logger.error("Error generating Excel file:", error);
    throw new APIError(500, `Failed to generate Excel file: ${error.message}`);
  }
}

async function generatePDF(data, headers, filename, reportType) {
  const filePath = path.join(process.cwd(), "temp", `${filename}.pdf`);

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const doc = new PDFDocument({ margin: 30 });
  doc.pipe(fs.createWriteStream(filePath));

  // Add title
  doc
    .fontSize(20)
    .text(
      `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
      50,
      50
    );
  doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, 50, 80);

  // Add table headers
  let y = 120;
  const columnWidth = 70;
  const startX = 50;

  headers.forEach((header, index) => {
    doc.text(header.title, startX + index * columnWidth, y, {
      width: columnWidth - 5,
    });
  });

  y += 25;

  // Add data rows (limit to first 50 for PDF)
  data.slice(0, 50).forEach((row) => {
    headers.forEach((header, index) => {
      const value = row[header.id]?.toString() || "";
      doc.text(value.substring(0, 10), startX + index * columnWidth, y, {
        width: columnWidth - 5,
      });
    });
    y += 20;

    // Add new page if needed
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
  });

  if (data.length > 50) {
    doc.text(`... and ${data.length - 50} more records`, 50, y + 20);
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(filePath));
  });
}

export default {
  getAllTransactions,
  getHotelWiseAccounting,
  getBranchWiseAccounting,
  getSettlements,
  exportReport,
};
