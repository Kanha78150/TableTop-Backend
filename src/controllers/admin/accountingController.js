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

/**
 * Get all transactions history with filters
 * GET /api/v1/admin/accounting/transactions
 * @access Admin
 */
export const getAllTransactions = async (req, res, next) => {
  try {
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

    // Build query for Order model (since that's where payment data is stored)
    const query = {};

    if (hotelId) query.hotel = new mongoose.Types.ObjectId(hotelId);
    if (branchId) query.branch = new mongoose.Types.ObjectId(branchId);

    // Map status from Transaction terms to Order payment status terms
    if (status) {
      const statusMapping = {
        completed: "paid",
        pending: "pending",
        failed: "failed",
      };
      query["payment.paymentStatus"] = statusMapping[status] || status;
    }

    if (paymentMethod) query["payment.paymentMethod"] = paymentMethod;

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Amount range filter (using totalPrice from orders)
    if (minAmount || maxAmount) {
      query.totalPrice = {};
      if (minAmount) query.totalPrice.$gte = parseFloat(minAmount);
      if (maxAmount) query.totalPrice.$lte = parseFloat(maxAmount);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate("hotel", "name hotelId location")
        .populate("branch", "name branchId location")
        .populate("user", "name email phone")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query),
    ]);

    // Transform orders to transaction-like format
    const transactions = orders.map((order) => ({
      _id: order._id,
      transactionId: order.payment?.transactionId || order._id.toString(),
      amount: order.totalPrice,
      paymentMethod: order.payment?.paymentMethod || "cash",
      status:
        order.payment?.paymentStatus === "paid"
          ? "completed"
          : order.payment?.paymentStatus === "pending"
          ? "pending"
          : "failed",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      hotel: order.hotel,
      branch: order.branch,
      user: order.user,
      order: {
        _id: order._id,
        orderId: order._id.toString(),
        totalPrice: order.totalPrice,
        items: order.items?.length || 0,
      },
    }));

    // Calculate summary statistics using aggregation
    const summaryPipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
          successfulTransactions: {
            $sum: {
              $cond: [{ $eq: ["$payment.paymentStatus", "paid"] }, 1, 0],
            },
          },
          failedTransactions: {
            $sum: {
              $cond: [{ $eq: ["$payment.paymentStatus", "failed"] }, 1, 0],
            },
          },
          pendingTransactions: {
            $sum: {
              $cond: [{ $eq: ["$payment.paymentStatus", "pending"] }, 1, 0],
            },
          },
          avgTransactionAmount: { $avg: "$totalPrice" },
        },
      },
    ];

    const [summaryStats] = await Order.aggregate(summaryPipeline);

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
  } catch (error) {
    logger.error("Error fetching transactions:", error);
    next(error);
  }
};

/**
 * Get hotel-wise accounting summary
 * GET /api/v1/admin/accounting/hotels
 * @access Admin
 */
export const getHotelWiseAccounting = async (req, res, next) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const { startDate, endDate, status = "completed" } = queryParams;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Map status from Transaction terms to Order payment status terms
    const paymentStatus = status === "completed" ? "paid" : status;

    const pipeline = [
      {
        $match: {
          "payment.paymentStatus": paymentStatus,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$hotel",
          totalRevenue: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$totalPrice" },
          paymentMethods: {
            $push: {
              method: "$payment.paymentMethod",
              amount: "$totalPrice",
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

    const hotelAccounting = await Order.aggregate(pipeline);

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
  } catch (error) {
    logger.error("Error fetching hotel-wise accounting:", error);
    next(error);
  }
};

/**
 * Get branch-wise accounting summary
 * GET /api/v1/admin/accounting/branches
 * @access Admin
 */
export const getBranchWiseAccounting = async (req, res, next) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const { hotelId, startDate, endDate, status = "completed" } = queryParams;

    // Build match filter
    const paymentStatus = status === "completed" ? "paid" : status;
    const matchFilter = { "payment.paymentStatus": paymentStatus };
    if (hotelId) matchFilter.hotel = new mongoose.Types.ObjectId(hotelId);
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
      if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: {
            branch: "$branch",
            hotel: "$hotel",
          },
          totalRevenue: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$totalPrice" },
          dailyRevenue: {
            $push: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              amount: "$totalPrice",
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

    const branchAccounting = await Order.aggregate(pipeline);

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
  } catch (error) {
    logger.error("Error fetching branch-wise accounting:", error);
    next(error);
  }
};

/**
 * Get settlement tracking & payout logs
 * GET /api/v1/admin/accounting/settlements
 * @access Admin
 */
export const getSettlements = async (req, res, next) => {
  try {
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

    // Build aggregation pipeline for settlements
    const pipeline = [
      {
        $match: {
          "payment.paymentStatus": "paid",
          ...(hotelId && { hotel: new mongoose.Types.ObjectId(hotelId) }),
          ...(branchId && { branch: new mongoose.Types.ObjectId(branchId) }),
          ...((startDate || endDate) && {
            createdAt: {
              ...(startDate && { $gte: new Date(startDate) }),
              ...(endDate && { $lte: new Date(endDate) }),
            },
          }),
        },
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
          totalAmount: { $sum: "$totalPrice" },
          transactionCount: { $sum: 1 },
          transactions: {
            $push: {
              transactionId: "$payment.transactionId",
              orderId: "$_id",
              amount: "$totalPrice",
              paymentMethod: "$payment.paymentMethod",
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

    const settlements = await Order.aggregate(pipeline);

    // Get total count for pagination
    const countPipeline = [...pipeline.slice(0, -2), { $count: "total" }];
    const [countResult] = await Order.aggregate(countPipeline);
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

    const [settlementSummary] = await Order.aggregate(summaryPipeline);

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
  } catch (error) {
    logger.error("Error fetching settlements:", error);
    next(error);
  }
};

/**
 * Export transactions report
 * POST /api/v1/admin/accounting/export
 * @access Admin
 */
export const exportReport = async (req, res, next) => {
  try {
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
  } catch (error) {
    logger.error("Error exporting report:", error);
    next(error);
  }
};

// Helper functions for data export
async function getTransactionsForExport(filters) {
  const query = {};
  if (filters.hotelId)
    query.hotel = new mongoose.Types.ObjectId(filters.hotelId);
  if (filters.branchId)
    query.branch = new mongoose.Types.ObjectId(filters.branchId);

  if (filters.status) {
    const statusMapping = {
      completed: "paid",
      pending: "pending",
      failed: "failed",
    };
    query["payment.paymentStatus"] =
      statusMapping[filters.status] || filters.status;
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  const orders = await Order.find(query)
    .populate("hotel", "name hotelId")
    .populate("branch", "name branchId")
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .limit(10000); // Limit for performance

  return orders.map((order) => ({
    transactionId: order.payment?.transactionId || order._id.toString(),
    orderId: order._id.toString(),
    hotelName: order.hotel?.name || "N/A",
    branchName: order.branch?.name || "N/A",
    customerName: order.user?.name || "N/A",
    amount: order.totalPrice,
    paymentMethod: order.payment?.paymentMethod || "cash",
    status:
      order.payment?.paymentStatus === "paid"
        ? "completed"
        : order.payment?.paymentStatus === "pending"
        ? "pending"
        : "failed",
    createdAt: order.createdAt.toISOString().split("T")[0],
  }));
}

async function getHotelsForExport(filters) {
  try {
    // Implementation similar to getHotelWiseAccounting but return flat data
    // This is a simplified version - you can expand based on needs
    const paymentStatus =
      filters.status === "completed" ? "paid" : filters.status || "paid";

    const pipeline = [
      {
        $match: {
          "payment.paymentStatus": paymentStatus,
          ...((filters.startDate || filters.endDate) && {
            createdAt: {
              ...(filters.startDate && { $gte: new Date(filters.startDate) }),
              ...(filters.endDate && { $lte: new Date(filters.endDate) }),
            },
          }),
        },
      },
      {
        $group: {
          _id: "$hotel",
          totalRevenue: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$totalPrice" },
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

    const result = await Order.aggregate(pipeline);
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
    const paymentStatus =
      filters.status === "completed" ? "paid" : filters.status || "paid";
    const matchFilter = { "payment.paymentStatus": paymentStatus };
    if (filters.hotelId)
      matchFilter.hotel = new mongoose.Types.ObjectId(filters.hotelId);

    if (filters.startDate || filters.endDate) {
      matchFilter.createdAt = {};
      if (filters.startDate)
        matchFilter.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate)
        matchFilter.createdAt.$lte = new Date(filters.endDate);
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: { branch: "$branch", hotel: "$hotel" },
          totalRevenue: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
          avgTransactionAmount: { $avg: "$totalPrice" },
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

    const result = await Order.aggregate(pipeline);

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
  // Similar to getSettlements but return flat data
  const pipeline = [
    {
      $match: {
        "payment.paymentStatus": "paid",
        ...(filters.hotelId && {
          hotel: new mongoose.Types.ObjectId(filters.hotelId),
        }),
        ...(filters.branchId && {
          branch: new mongoose.Types.ObjectId(filters.branchId),
        }),
        ...((filters.startDate || filters.endDate) && {
          createdAt: {
            ...(filters.startDate && { $gte: new Date(filters.startDate) }),
            ...(filters.endDate && { $lte: new Date(filters.endDate) }),
          },
        }),
      },
    },
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
        totalAmount: { $sum: "$totalPrice" },
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

  const result = await Order.aggregate(pipeline);

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
