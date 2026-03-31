# TableTop Admin Dashboard - Design Guide

## 📊 Dashboard Overview

The TableTop Admin Dashboard provides comprehensive insights into restaurant operations, including real-time order tracking, revenue analytics, booking management, customer engagement, and staff performance metrics. The dashboard is built with React, Next.js, TypeScript, and Recharts for visualizations.

---

## 🎯 Key Features & Metrics

### 1. **Key Performance Indicators (KPIs) - Summary Cards**

#### Card 1: Total Revenue (Current Month)
- **Metric**: Monthly Revenue Amount
- **Icon**: 💰 DollarSign
- **Color**: Green (#10B981)
- **Example Data**: ₹ 4,85,325
- **Trend**: +12% from last month

#### Card 2: Total Orders (Current Month)
- **Metric**: Number of Orders
- **Icon**: 📦 ShoppingCart
- **Color**: Blue (#3B82F6)
- **Example Data**: 1,245 orders
- **Trend**: +8% from last month

#### Card 3: Active Bookings
- **Metric**: Current Active Reservations
- **Icon**: 📅 Calendar
- **Color**: Purple (#A855F7)
- **Example Data**: 42 bookings
- **Average Party Size**: 4.2 persons

#### Card 4: Total Users
- **Metric**: Active Customer Base
- **Icon**: 👥 Users
- **Color**: Orange (#F97316)
- **Example Data**: 8,234 users
- **New Users This Month**: +156

#### Card 5: Table Utilization
- **Metric**: Average Table Occupancy Rate
- **Icon**: 🪑 Table
- **Color**: Cyan (#06B6D4)
- **Example Data**: 78%
- **Peak Hour Occupancy**: 94%

#### Card 6: Average Rating
- **Metric**: Overall Customer Satisfaction
- **Icon**: ⭐ Star
- **Color**: Yellow (#FBBF24)
- **Example Data**: 4.6/5.0
- **Review Count**: 3,456 reviews

---

## 📈 Dashboard Graphs & Visualizations

### Graph 1: **Revenue Trend Chart** (Line Chart)
**Purpose**: Track revenue patterns over time for financial forecasting and performance analysis

**Graph Type**: `LineChart` from Recharts
**Time Period**: Last 30 days
**Data Points**: Daily revenue

```json
{
  "data": [
    { "date": "2026-03-01", "revenue": 12500, "target": 15000 },
    { "date": "2026-03-02", "revenue": 14200, "target": 15000 },
    { "date": "2026-03-03", "revenue": 16800, "target": 15000 },
    { "date": "2026-03-04", "revenue": 13500, "target": 15000 },
    { "date": "2026-03-05", "revenue": 18900, "target": 15000 },
    { "date": "2026-03-06", "revenue": 21200, "target": 15000 },
    { "date": "2026-03-07", "revenue": 19800, "target": 15000 },
    { "date": "2026-03-08", "revenue": 17600, "target": 15000 },
    { "date": "2026-03-09", "revenue": 20100, "target": 15000 },
    { "date": "2026-03-10", "revenue": 22500, "target": 15000 },
    { "date": "2026-03-11", "revenue": 19300, "target": 15000 },
    { "date": "2026-03-12", "revenue": 23400, "target": 15000 },
    { "date": "2026-03-13", "revenue": 25600, "target": 15000 },
    { "date": "2026-03-14", "revenue": 28900, "target": 15000 },
    { "date": "2026-03-15", "revenue": 31200, "target": 15000 },
    { "date": "2026-03-16", "revenue": 29800, "target": 15000 },
    { "date": "2026-03-17", "revenue": 26500, "target": 15000 },
    { "date": "2026-03-18", "revenue": 24100, "target": 15000 },
    { "date": "2026-03-19", "revenue": 27800, "target": 15000 },
    { "date": "2026-03-20", "revenue": 30200, "target": 15000 },
    { "date": "2026-03-21", "revenue": 32100, "target": 15000 },
    { "date": "2026-03-22", "revenue": 28600, "target": 15000 },
    { "date": "2026-03-23", "revenue": 33400, "target": 15000 },
    { "date": "2026-03-24", "revenue": 35700, "target": 15000 },
    { "date": "2026-03-25", "revenue": 38200, "target": 15000 },
    { "date": "2026-03-26", "revenue": 36800, "target": 15000 },
    { "date": "2026-03-27", "revenue": 34100, "target": 15000 },
    { "date": "2026-03-28", "revenue": 37600, "target": 15000 },
    { "date": "2026-03-29", "revenue": 40100, "target": 15000 },
    { "date": "2026-03-30", "revenue": 42300, "target": 15000 }
  ],
  "chartConfig": {
    "type": "LineChart",
    "dataKey": "revenue",
    "stroke": "#3B82F6",
    "strokeWidth": 2,
    "yAxisLabel": "Revenue (₹)"
  }
}
```

---

### Graph 2: **Order Status Distribution** (Pie/Donut Chart)
**Purpose**: Quick visual overview of order workflow bottlenecks and processing status

**Graph Type**: `PieChart` from Recharts
**Categories**: Order Status Distribution

```json
{
  "data": [
    { "name": "Completed", "value": 648, "color": "#10B981" },
    { "name": "Preparing", "value": 234, "color": "#F59E0B" },
    { "name": "Served", "value": 198, "color": "#8B5CF6" },
    { "name": "Pending", "value": 87, "color": "#EF4444" },
    { "name": "Cancelled", "value": 12, "color": "#6B7280" }
  ],
  "total": 1179,
  "chartConfig": {
    "type": "PieChart",
    "dataKey": "value",
    "nameKey": "name",
    "colors": ["#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#6B7280"]
  }
}
```

---

### Graph 3: **Top Categories by Sales** (Bar Chart)
**Purpose**: Identify best-performing food categories for inventory and menu optimization

**Graph Type**: `BarChart` from Recharts
**Axis**: Food Categories vs Revenue

```json
{
  "data": [
    { "category": "North Indian", "sales": 89200, "orders": 234 },
    { "category": "Chinese", "sales": 76500, "orders": 189 },
    { "category": "Desserts", "sales": 65400, "orders": 345 },
    { "category": "Beverages", "sales": 54300, "orders": 412 },
    { "category": "South Indian", "sales": 48900, "orders": 167 },
    { "category": "Appetizers", "sales": 42100, "orders": 289 },
    { "category": "Continental", "sales": 35600, "orders": 112 },
    { "category": "Breads", "sales": 28400, "orders": 203 }
  ],
  "chartConfig": {
    "type": "BarChart",
    "dataKey": "sales",
    "nameKey": "category",
    "stackId": null,
    "fill": "#3B82F6"
  }
}
```

---

### Graph 4: **Customer Rating Distribution** (Horizontal Bar Chart)
**Purpose**: Analyze customer satisfaction across different rating scales

**Graph Type**: `BarChart` (Horizontal) from Recharts
**Axis**: Rating Scale (1-5 stars) vs Count

```json
{
  "data": [
    { "rating": "⭐⭐⭐⭐⭐ (5 Stars)", "count": 2156, "percentage": 62.4 },
    { "rating": "⭐⭐⭐⭐ (4 Stars)", "count": 956, "percentage": 27.7 },
    { "rating": "⭐⭐⭐ (3 Stars)", "count": 198, "percentage": 5.7 },
    { "rating": "⭐⭐ (2 Stars)", "count": 78, "percentage": 2.3 },
    { "rating": "⭐ (1 Star)", "count": 42, "percentage": 1.2 }
  ],
  "chartConfig": {
    "type": "BarChart",
    "layout": "vertical",
    "dataKey": "count",
    "fill": "#FBBF24"
  }
}
```

---

### Graph 5: **Table Utilization Analysis** (Area Chart)
**Purpose**: Track table capacity usage patterns to optimize seating and staffing

**Graph Type**: `AreaChart` from Recharts
**Time Period**: 24-hour hourly breakdown

```json
{
  "data": [
    { "hour": "10 AM", "occupied": 2, "available": 28, "occupancy": "7%" },
    { "hour": "11 AM", "occupied": 5, "available": 25, "occupancy": "17%" },
    { "hour": "12 PM", "occupied": 18, "available": 12, "occupancy": "60%" },
    { "hour": "1 PM", "occupied": 28, "available": 2, "occupancy": "93%" },
    { "hour": "2 PM", "occupied": 25, "available": 5, "occupancy": "83%" },
    { "hour": "3 PM", "occupied": 12, "available": 18, "occupancy": "40%" },
    { "hour": "4 PM", "occupied": 8, "available": 22, "occupancy": "27%" },
    { "hour": "5 PM", "occupied": 6, "available": 24, "occupancy": "20%" },
    { "hour": "6 PM", "occupied": 15, "available": 15, "occupancy": "50%" },
    { "hour": "7 PM", "occupied": 26, "available": 4, "occupancy": "87%" },
    { "hour": "8 PM", "occupied": 29, "available": 1, "occupancy": "97%" },
    { "hour": "9 PM", "occupied": 27, "available": 3, "occupancy": "90%" },
    { "hour": "10 PM", "occupied": 18, "available": 12, "occupancy": "60%" },
    { "hour": "11 PM", "occupied": 8, "available": 22, "occupancy": "27%" }
  ],
  "chartConfig": {
    "type": "AreaChart",
    "dataKey": "occupied",
    "fillOpacity": 0.3,
    "stroke": "#3B82F6"
  }
}
```

---

### Graph 6: **Payment Method Distribution** (Pie Chart)
**Purpose**: Understand customer payment preferences for digital transformation initiatives

**Graph Type**: `PieChart` from Recharts
**Categories**: Payment Methods

```json
{
  "data": [
    { "method": "Cash", "value": 445, "percentage": 35.7, "color": "#6B7280" },
    { "method": "Razorpay", "value": 389, "percentage": 31.2, "color": "#3B82F6" },
    { "method": "PhonePe", "value": 198, "percentage": 15.9, "color": "#7C3AED" },
    { "method": "Card", "value": 145, "percentage": 11.6, "color": "#EC4899" },
    { "method": "Wallet", "value": 68, "percentage": 5.5, "color": "#F59E0B" }
  ],
  "total": 1245,
  "chartConfig": {
    "type": "PieChart",
    "dataKey": "value"
  }
}
```

---

### Graph 7: **Weekly Booking Comparison** (Line Chart)
**Purpose**: Monitor booking trends for capacity planning and staff scheduling

**Graph Type**: `LineChart` from Recharts
**Comparison**: Current Week vs Previous Week vs Target

```json
{
  "data": [
    {
      "day": "Monday",
      "current": 12,
      "previous": 10,
      "target": 15,
      "date": "2026-03-24"
    },
    {
      "day": "Tuesday",
      "current": 14,
      "previous": 11,
      "target": 15,
      "date": "2026-03-25"
    },
    {
      "day": "Wednesday",
      "current": 11,
      "previous": 9,
      "target": 15,
      "date": "2026-03-26"
    },
    {
      "day": "Thursday",
      "current": 16,
      "previous": 13,
      "target": 15,
      "date": "2026-03-27"
    },
    {
      "day": "Friday",
      "current": 28,
      "previous": 24,
      "target": 25,
      "date": "2026-03-28"
    },
    {
      "day": "Saturday",
      "current": 35,
      "previous": 32,
      "target": 30,
      "date": "2026-03-29"
    },
    {
      "day": "Sunday",
      "current": 31,
      "previous": 29,
      "target": 30,
      "date": "2026-03-30"
    }
  ],
  "chartConfig": {
    "type": "LineChart",
    "lines": [
      { "dataKey": "current", "stroke": "#3B82F6", "label": "This Week" },
      { "dataKey": "previous", "stroke": "#9CA3AF", "label": "Last Week" },
      { "dataKey": "target", "stroke": "#10B981", "label": "Target", "strokeDasharray": "5 5" }
    ]
  }
}
```

---

### Graph 8: **Staff Performance** (Composite Bar Chart)
**Purpose**: Track individual staff member performance metrics

**Graph Type**: `ComposedChart` (Bar + Line) from Recharts
**Metrics**: Orders handled, Average rating, Total sales

```json
{
  "data": [
    {
      "name": "Raj Kumar",
      "ordersHandled": 156,
      "averageRating": 4.8,
      "totalSales": 38900
    },
    {
      "name": "Priya Singh",
      "ordersHandled": 142,
      "averageRating": 4.6,
      "totalSales": 35600
    },
    {
      "name": "Amit Patel",
      "ordersHandled": 128,
      "averageRating": 4.4,
      "totalSales": 32100
    },
    {
      "name": "Sarah Johnson",
      "ordersHandled": 115,
      "averageRating": 4.7,
      "totalSales": 28900
    },
    {
      "name": "Vikram Desai",
      "ordersHandled": 98,
      "averageRating": 4.3,
      "totalSales": 24600
    }
  ],
  "chartConfig": {
    "type": "ComposedChart",
    "bars": [{ "dataKey": "ordersHandled", "fill": "#3B82F6" }],
    "lines": [{ "dataKey": "averageRating", "stroke": "#FBBF24" }]
  }
}
```

---

## 📋 Complete Dashboard Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD HEADER                   │
│  [Logo] TableTop Admin  [Date Range Selector] [User Menu]   │
└─────────────────────────────────────────────────────────────┘

┌──────────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ Revenue  │ Orders    │ Bookings │ Users    │ Table    │ Rating   │
│ ₹4.85L   │ 1,245     │ 42       │ 8,234    │ Util 78% │ 4.6/5.0  │
│ +12%     │ +8%       │ +5%      │ +2%      │ +3%      │ +0.2     │
└──────────┴───────────┴──────────┴──────────┴──────────┴──────────┘

┌─────────────────────────────────────────────────────────────┐
│              REVENUE TREND (Last 30 Days)                   │
│  [Line Chart showing daily revenue with ₹42,300 peak]       │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────┬──────────────────────────┐
│   ORDER STATUS           │   PAYMENT METHODS        │
│  Completed: 648          │  Cash: 35.7% (445)       │
│  Preparing: 234          │  Razorpay: 31.2% (389)   │
│  Served: 198             │  PhonePe: 15.9% (198)    │
│  Pending: 87             │  Card: 11.6% (145)       │
│  Cancelled: 12           │  Wallet: 5.5% (68)       │
│  [Pie Chart]             │  [Pie Chart]             │
└──────────────────────────┴──────────────────────────┘

┌──────────────────────────┬──────────────────────────┐
│ TOP CATEGORIES (Sales)   │  TABLE UTILIZATION       │
│ North Indian: ₹89.2K     │  24-Hour Occupancy       │
│ Chinese: ₹76.5K          │  Peak: 8-9 PM (97%)      │
│ Desserts: ₹65.4K         │  Low: 4-5 PM (20%)       │
│ Beverages: ₹54.3K        │  [Area Chart]            │
│ [Bar Chart]              │                          │
└──────────────────────────┴──────────────────────────┘

┌──────────────────────────┬──────────────────────────┐
│  CUSTOMER RATINGS        │  WEEKLY BOOKINGS         │
│  ⭐⭐⭐⭐⭐: 2,156 (62.4%)   │  Current Week: 147 total │
│  ⭐⭐⭐⭐: 956 (27.7%)    │  Prev Week: 128 total    │
│  ⭐⭐⭐: 198 (5.7%)      │  [Line Chart Comparison] │
│  ⭐⭐: 78 (2.3%)        │                          │
│  ⭐: 42 (1.2%)         │                          │
│  [Horizontal Bar]        │                          │
└──────────────────────────┴──────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              STAFF PERFORMANCE LEADERBOARD                  │
│  [Composite Chart: Orders & Rating by Staff Member]         │
│  1. Raj Kumar - 156 orders, 4.8★, ₹38.9K sales             │
│  2. Priya Singh - 142 orders, 4.6★, ₹35.6K sales           │
│  3. Amit Patel - 128 orders, 4.4★, ₹32.1K sales            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Component Structure

```
src/components/dashboard/
├── DashboardLayout.tsx              (Main container)
├── KPICards.tsx                     (6 KPI summary cards)
├── RevenueChart.tsx                 (Graph 1: Line chart)
├── OrderStatusChart.tsx             (Graph 2: Pie chart)
├── TopCategoriesChart.tsx           (Graph 3: Bar chart)
├── RatingsChart.tsx                 (Graph 4: Horizontal bar)
├── TableUtilizationChart.tsx        (Graph 5: Area chart)
├── PaymentMethodsChart.tsx          (Graph 6: Pie chart)
├── BookingTrendsChart.tsx           (Graph 7: Line chart)
├── StaffPerformanceChart.tsx        (Graph 8: Composite chart)
├── DateRangeSelector.tsx            (Filter component)
├── ChartHeader.tsx                  (Reusable chart header)
└── LoadingSkeletons.tsx             (Loading states)
```

---

## 🔧 API Endpoints Required

### Backend Endpoints (TableTop-Backend)

```javascript
// superAdmin Dashboard APIs
GET /api/superAdmin/dashboard/summary
  Response: { revenue, totalOrders, activeBookings, totalUsers, tableUtilization, avgRating }

GET /api/superAdmin/dashboard/revenue-trend?period=30days
  Response: [{ date, revenue, target }]

GET /api/superAdmin/dashboard/order-status
  Response: [{ status, count, percentage }]

GET /api/superAdmin/dashboard/top-categories
  Response: [{ category, sales, orders }]

GET /api/superAdmin/dashboard/customer-ratings
  Response: [{ rating, count, percentage }]

GET /api/superAdmin/dashboard/table-utilization?date=2026-03-30
  Response: [{ hour, occupied, available, occupancy }]

GET /api/superAdmin/dashboard/payment-methods
  Response: [{ method, count, percentage }]

GET /api/superAdmin/dashboard/booking-trends?start=2026-03-24&end=2026-03-30
  Response: [{ day, current, previous, target }]

GET /api/superAdmin/dashboard/staff-performance
  Response: [{ staffId, name, ordersHandled, avgRating, totalSales }]

// Manager/Admin Dashboard APIs
GET /api/admin/dashboard/summary?hotelId={id}
  Response: Same structure as above but for specific hotel

GET /api/manager/dashboard/summary?branchId={id}
  Response: Same structure as above but for specific branch
```

---

## 💾 Example Data Models

### Dashboard Summary Response
```json
{
  "period": "2026-03-01 to 2026-03-30",
  "summary": {
    "revenue": {
      "current": 485325,
      "previous": 433125,
      "changePercent": 12,
      "currency": "INR"
    },
    "orders": {
      "total": 1245,
      "pending": 87,
      "completed": 648,
      "cancelled": 12,
      "changePercent": 8
    },
    "bookings": {
      "active": 42,
      "avgPartySize": 4.2,
      "changePercent": 5
    },
    "users": {
      "total": 8234,
      "new": 156,
      "active": 7456,
      "changePercent": 2
    },
    "tables": {
      "total": 30,
      "occupied": 23,
      "available": 7,
      "utilization": 78,
      "peakUtilization": 94,
      "peakHour": "8-9 PM"
    },
    "ratings": {
      "average": 4.6,
      "totalReviews": 3456,
      "distribution": {
        "5Stars": 2156,
        "4Stars": 956,
        "3Stars": 198,
        "2Stars": 78,
        "1Star": 42
      }
    }
  }
}
```

---

## 🎨 Design Specifications

### Color Scheme
- **Primary**: #3B82F6 (Blue) - Main metrics, actionable items
- **Success**: #10B981 (Green) - Positive trends, completed orders
- **Warning**: #F59E0B (Amber) - Warnings, preparing items
- **Danger**: #EF4444 (Red) - Critical issues, cancelled orders
- **Info**: #7C3AED (Purple) - Informational, bookings
- **Secondary**: #8B5CF6 (Violet) - Additional metrics
- **Neutral**: #6B7280 (Gray) - Inactive, neutral status
- **Background**: #F9FAFB (Light Gray) - Dashboard bg
- **Card**: #FFFFFF (White) - Card backgrounds

### Typography
- **Headers**: Geist (Next.js default)
- **Body**: Geist, 14px, weight 400
- **Metrics**: Geist, 24px, weight 600
- **Labels**: Geist, 12px, weight 500, uppercase

### Spacing
- **Card Padding**: 16px
- **Section Margin**: 24px
- **Grid Gap**: 16px
- **Border Radius**: 8px (cards), 4px (buttons)

### Responsive Breakpoints
- **Mobile** (< 640px): 1 column layout
- **Tablet** (640px - 1024px): 2 column layout
- **Desktop** (> 1024px): 3-4 column layout, full charts

---

## 🚀 Implementation Steps

### Phase 1: Setup
1. Install required dependencies (recharts already in package.json)
2. Create API endpoints in backend
3. Setup data fetching hooks with axios

### Phase 2: Components
1. Create KPI cards component
2. Implement each chart component
3. Build dashboard layout with routing

### Phase 3: Features
1. Add date range selector
2. Implement real-time updates with Socket.io
3. Add drill-down capabilities
4. Export to PDF/CSV functionality

### Phase 4: Optimization
1. Implement data caching
2. Add loading states and skeletons
3. Setup error handling
4. Performance optimization

---

## 📱 Mobile Responsive Design

- **KPI Cards**: Stack vertically on mobile
- **Charts**: Single column, auto-height adjustment
- **Date Selector**: Full-width dropdown
- **Touch-friendly**: Minimum 44px tap targets
- **Performance**: Lazy load charts below fold

---

## 🔐 Security Considerations

- Verify user role (superAdmin/admin/manager)
- Filter data based on user permissions
- Sanitize date range inputs
- Rate limit API calls
- Validate numeric inputs

---

## 📊 Graph Usage Summary

| Graph # | Name | Type | Purpose | Time Period |
|---------|------|------|---------|-------------|
| 1 | Revenue Trend | Line | Track revenue over time | 30 days |
| 2 | Order Status | Pie | Distribution of order states | Current |
| 3 | Top Categories | Bar | Best-performing items | Current month |
| 4 | Customer Ratings | Horizontal Bar | Satisfaction levels | All-time |
| 5 | Table Utilization | Area | Occupancy patterns | 24 hours |
| 6 | Payment Methods | Pie | Payment preference distribution | Current month |
| 7 | Weekly Bookings | Line | Booking trends | 7 days |
| 8 | Staff Performance | Composite | Individual performance metrics | Current month |

---

## ✅ Checklist for Implementation

- [ ] Create API endpoints in backend
- [ ] Setup Recharts library (already installed)
- [ ] Create dashboard layout component
- [ ] Implement KPI cards
- [ ] Implement Graph 1-8 as separate components
- [ ] Add date range selector
- [ ] Setup loading states
- [ ] Add error handling
- [ ] Implement real-time Socket.io updates
- [ ] Test responsive design
- [ ] Setup drill-down navigation
- [ ] Add accessibility features (ARIA labels)
- [ ] Performance optimization

---

## 🎯 Future Enhancements

1. **Custom Dashboards**: Allow users to customize visible widgets
2. **Alerts**: Real-time alerts for critical metrics
3. **Forecasting**: Predictive analytics using ML
4. **Export**: PDF/Excel report generation
5. **Drill-down**: Click metrics to see detailed breakdown
6. **Comparisons**: Month-over-month, Year-over-year analysis
7. **Goals**: Set and track targets
8. **Notifications**: Push notifications for important events

---

## 📞 Support

For questions or issues with dashboard implementation:
1. Check the example data JSON structures
2. Verify API endpoint responses match expected format
3. Ensure Recharts components are properly configured
4. Check console for errors and Socket.io connection status

---

**Dashboard Building Guide - TableTop Admin v1.0**
*Last Updated: 2026-03-30*
