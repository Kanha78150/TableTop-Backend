# Staff Rating Tracking System

## Overview

The review system now automatically tracks individual staff performance based on customer ratings. When customers submit reviews for their orders, the staff member who served them receives a rating that is aggregated and displayed in their performance metrics.

## How It Works

### 1. Review Creation

- When a user submits a review, the system automatically copies the staff reference from the order
- The review includes a `staff` field that links to the staff member who served the order
- Staff rating (1-5 stars) is part of the review data

### 2. Rating Calculation

When an admin **approves** a review:

- The system recalculates ratings for Hotel, Branch, AND Staff
- Only **approved** reviews are counted in staff ratings
- Staff ratings are aggregated from all approved reviews where the staff member was assigned

### 3. Staff Model Updates

Staff performance is tracked in `assignmentStats`:

```javascript
assignmentStats: {
  totalAssignments: Number,        // Total orders assigned
  completedOrders: Number,         // Successfully completed orders
  averageCompletionTime: Number,   // Average time to complete orders (minutes)
  customerRating: Number,          // Average rating from customer reviews (0-5)
  totalReviews: Number,            // Total number of reviews received
  lastStatsUpdate: Date            // Last time stats were updated
}
```

## API Endpoints

### View Staff Performance (Existing Endpoint)

```
GET /api/v1/manager/staff/:staffId/performance?days=30
```

**Response includes:**

```json
{
  "success": true,
  "data": {
    "staff": {
      "id": "staff_id",
      "name": "John Doe",
      "role": "waiter",
      "department": "service"
    },
    "period": "30 days",
    "performance": {
      "totalOrders": 45,
      "completedOrders": 42,
      "completionRate": "93.33",
      "avgCustomerRating": 4.5, // From review system
      "assignmentStats": {
        "customerRating": 4.5,
        "totalReviews": 15 // Number of reviews received
      }
    }
  }
}
```

## Workflow

### When Customer Submits Review

1. User submits review with ratings (food, hotel, branch, staff)
2. System validates order eligibility
3. Review is created with `status: "pending"`
4. Staff reference is copied from `order.staff` to `review.staff`
5. Review waits for admin moderation

### When Admin Approves Review

1. Admin changes review status to `"approved"`
2. System recalculates ratings for:
   - Hotel (average of all 4 ratings)
   - Branch (average of all 4 ratings)
   - **Staff** (average of staff rating field only)
3. Staff's `assignmentStats.customerRating` is updated
4. Staff's `assignmentStats.totalReviews` is incremented

### When Admin Rejects Previously Approved Review

1. If review was previously approved, ratings are recalculated
2. Rejected reviews are excluded from all rating calculations
3. Staff rating is updated to reflect only approved reviews

## Benefits

### For Management

- Track individual staff performance objectively
- Identify top performers for recognition/rewards
- Identify underperformers for additional training
- Make data-driven staffing decisions

### For Staff

- Clear, objective performance metrics
- Direct feedback from customers
- Transparency in performance evaluation
- Motivation to provide excellent service

### For Customers

- Their feedback directly impacts service quality
- Staff accountability for service standards
- Better overall dining experience

## Example Scenario

**Customer Experience:**

1. Customer places order (orderId: ORD-12345, staff: waiter_john)
2. Order is completed and paid
3. Customer receives review invitation email
4. Customer submits review:
   - Food Rating: 5 stars
   - Hotel Rating: 4 stars
   - Branch Rating: 4 stars
   - **Staff Rating: 5 stars**
   - Comment: "John was very attentive and helpful!"

**Admin Review:**

1. Admin sees pending review in moderation dashboard
2. Admin approves review
3. System recalculates:
   - Hotel overall rating
   - Branch overall rating
   - **John's customer rating** (now includes this 5-star review)

**Manager View:**

1. Manager checks John's performance
2. Sees `assignmentStats.customerRating: 4.8` (average of all reviews)
3. Sees `assignmentStats.totalReviews: 12` (number of reviews received)
4. Can compare John's rating with other waiters

## Database Changes

### Review Model

```javascript
staff: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Staff",
  index: true,
  // Populated from order.staff if order was served by staff
}
```

### Staff Model

```javascript
assignmentStats: {
  // ... existing fields
  totalReviews: { type: Number, default: 0 }  // NEW FIELD
}
```

## Implementation Details

### Files Modified

1. `src/models/Review.model.js` - Added staff field
2. `src/models/Staff.model.js` - Added totalReviews field
3. `src/services/reviewService.js` - Extended recalculateEntityRatings for staff
4. `src/controllers/admin/reviewModerationController.js` - Added staff recalculation on approve/reject

### Aggregation Logic

```javascript
// Calculate staff rating from approved reviews
const stats = await Review.aggregate([
  {
    $match: {
      staff: staffId,
      status: "approved", // Only approved reviews count
    },
  },
  {
    $group: {
      _id: null,
      totalReviews: { $sum: 1 },
      avgStaffRating: { $avg: "$staffRating" },
    },
  },
]);

// Update staff model
await Staff.findByIdAndUpdate(staffId, {
  "assignmentStats.customerRating": avgStaffRating,
  "assignmentStats.totalReviews": totalReviews,
  "assignmentStats.lastStatsUpdate": new Date(),
});
```

## Notes

- Staff ratings are calculated **only from approved reviews**
- If a staff member has no approved reviews, rating is 0
- Staff must be assigned to an order for their rating to be tracked
- Ratings are automatically recalculated when review status changes
- The `getStaffPerformance` endpoint automatically includes these ratings

## Future Enhancements (Optional)

1. **Trending Analysis**: Track rating changes over time
2. **Leaderboard**: Rank staff by customer ratings
3. **Automated Alerts**: Notify managers when staff rating drops below threshold
4. **Review Count Badges**: Display badge on staff profiles (e.g., "100+ 5-star reviews")
5. **Customer Favorites**: Allow customers to request specific staff members
6. **Incentive Programs**: Link ratings to bonus/commission structures
