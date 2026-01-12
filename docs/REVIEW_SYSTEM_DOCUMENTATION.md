# Review and Rating System - Implementation Documentation

## Overview

A comprehensive order review and rating system for the Hotel Management Backend where users can rate completed paid orders across 4 categories with admin moderation, helpful voting, and admin responses with email notifications.

---

## Table of Contents

1. [Features](#features)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Email Notifications](#email-notifications)
6. [Admin Analytics](#admin-analytics)
7. [Business Rules](#business-rules)
8. [Testing Guide](#testing-guide)

---

## Features

### Core Features

- ✅ **4-Category Rating System**: Food, Hotel, Branch, and Staff ratings (1-5 stars each)
- ✅ **Admin Moderation**: All reviews require admin approval before going public
- ✅ **One Review Per Order**: Users can submit only one review per completed order
- ✅ **30-Day Review Window**: Reviews must be submitted within 30 days of order completion
- ✅ **Helpful Voting**: Users can mark reviews as helpful (toggle on/off)
- ✅ **Admin Responses**: Admins can respond to approved reviews with email notifications
- ✅ **Branch Isolation**: Branch admins can only moderate reviews for their assigned branches
- ✅ **Email Invitations**: Automatic review invitation emails sent when orders are completed
- ✅ **Analytics Dashboard**: Comprehensive statistics for admin decision-making

### What's NOT Included (Per Requirements)

- ❌ No image uploads in reviews
- ❌ No edit after approval
- ❌ No rejection notifications to users
- ❌ No user replies to admin responses

---

## System Architecture

### Component Structure

```
Review System
├── Models
│   ├── Review.model.js (Core review schema with validations)
│   └── Order.model.js (Extended with review tracking fields)
│
├── Services
│   ├── reviewService.js (Business logic layer)
│   └── reviewAnalyticsService.js (Analytics and statistics)
│
├── Controllers
│   ├── user/reviewController.js (User-facing endpoints)
│   └── admin/reviewModerationController.js (Admin moderation)
│
├── Routes
│   ├── user.route.js (Public + protected user routes)
│   └── admin/review.route.js (Admin moderation routes)
│
├── Utils
│   └── emailService.js (Email templates for invitations and responses)
│
└── Triggers
    ├── staff/orderController.js (Email on order completion)
    └── manager/orderController.js (Email on order completion)
```

---

## Database Schema

### Review Model

```javascript
{
  reviewId: String (auto-generated: REV-YYYYMMDD-00001),
  user: ObjectId (ref: User),
  order: ObjectId (ref: Order),
  hotel: ObjectId (ref: Hotel),
  branch: ObjectId (ref: Branch, optional),

  // Ratings (1-5, all required)
  foodRating: Number,
  hotelRating: Number,
  branchRating: Number,
  staffRating: Number,

  // Overall rating (virtual, average of 4 ratings)
  overallRating: Number (calculated),

  // Review content
  comment: String (max 1000 chars, optional),

  // Moderation
  status: Enum ['pending', 'approved', 'rejected'],
  moderatedBy: ObjectId (ref: Admin, optional),
  moderatedAt: Date (optional),
  rejectionReason: String (required if rejected),

  // Admin response
  response: {
    message: String (max 1000 chars),
    respondedBy: ObjectId (ref: Admin),
    respondedAt: Date,
    updatedAt: Date
  },

  // Engagement
  helpfulVotes: [{
    user: ObjectId (ref: User),
    helpful: Boolean,
    votedAt: Date
  }],
  helpfulCount: Number (default: 0),

  // Metadata
  createdAt: Date,
  updatedAt: Date
}

// Indexes
- Compound unique: (user, order) - prevents duplicate reviews
- Single: user, order, hotel, branch, status, createdAt, helpfulCount
```

### Order Model Extensions

```javascript
Order Schema additions:
{
  reviewInviteSentAt: Date, // Tracks when review email was sent
  hasReview: Boolean (default: false), // Quick lookup for reviewed orders
  reviewId: ObjectId (ref: Review) // Reference to submitted review
}
```

---

## API Endpoints

### User Endpoints (Public)

#### 1. Get Hotel Reviews

```
GET /api/v1/user/reviews/hotel/:hotelId
Query Params:
  - page (default: 1)
  - limit (default: 10)
  - sortBy (newest/highest/helpful)

Response:
{
  success: true,
  data: {
    reviews: [...],
    statistics: {
      totalReviews, averageRating, ratingCounts, helpfulReviewsCount
    },
    distribution: { 1-5 star counts },
    mostHelpful: [...top 3],
    pagination: {...}
  }
}
```

#### 2. Get Branch Reviews

```
GET /api/v1/user/reviews/branch/:branchId
Query Params: Same as hotel reviews
Response: Same structure as hotel reviews
```

#### 3. Get Review Details

```
GET /api/v1/user/reviews/:reviewId
Response:
{
  success: true,
  data: {
    review: {
      ...review details with populated user, order, hotel, branch, response
    }
  }
}
```

### User Endpoints (Authenticated)

#### 4. Submit Review

```
POST /api/v1/user/reviews
Headers: Authorization: Bearer <token>
Body:
{
  orderId: "ObjectId",
  foodRating: 4,
  hotelRating: 5,
  branchRating: 4,
  staffRating: 5,
  comment: "Great experience!" (optional)
}

Response: 201 Created
{
  success: true,
  data: { review: {...} },
  message: "Review submitted successfully. It will be visible after admin approval."
}
```

#### 5. Get My Reviews

```
GET /api/v1/user/reviews/my-reviews
Query Params:
  - status (all/pending/approved/rejected)
  - page, limit

Response:
{
  success: true,
  data: {
    reviews: [...],
    summary: {
      total, pending, approved, rejected
    },
    pagination: {...}
  }
}
```

#### 6. Update Review

```
PUT /api/v1/user/reviews/:reviewId
Body: Same as submit review
Note: Only allowed if status is 'pending'
```

#### 7. Check Eligibility

```
GET /api/v1/user/reviews/eligibility/:orderId
Response:
{
  success: true,
  data: {
    canReview: true/false,
    reason: "explanation if false",
    order: {...basic order info}
  }
}
```

#### 8. Mark Review Helpful

```
POST /api/v1/user/reviews/:reviewId/helpful
Body: { helpful: true } // true to mark helpful, false to remove
Response: Updated review with new helpfulCount
```

### Admin Endpoints

All admin endpoints require:

- Authentication: `authenticateAdmin`
- Role: `requireAdmin`
- Permission: `rbac("handleComplaints")`

#### 1. Get All Reviews

```
GET /api/v1/admin/reviews
Query Params:
  - status (all/pending/approved/rejected)
  - hotelId, branchId
  - startDate, endDate
  - page, limit

Note: Branch admins see only their assigned branches
Response: Paginated reviews with statistics
```

#### 2. Get Pending Reviews

```
GET /api/v1/admin/reviews/pending
Query Params: hotelId, branchId, page, limit
Response: Oldest pending reviews first (moderation queue)
```

#### 3. Approve Review

```
PUT /api/v1/admin/reviews/:reviewId/approve
Response:
- Recalculates hotel and branch average ratings
- Returns approved review
```

#### 4. Reject Review

```
PUT /api/v1/admin/reviews/:reviewId/reject
Body: { rejectionReason: "explanation" }
Note: User is NOT notified (per requirements)
```

#### 5. Add Admin Response

```
POST /api/v1/admin/reviews/:reviewId/response
Body: { message: "Thank you for your feedback!" }
Note:
- Only for approved reviews
- Sends email to user with review summary and response
- Response includes admin name
```

#### 6. Update Admin Response

```
PUT /api/v1/admin/reviews/:reviewId/response
Body: { message: "updated message" }
```

#### 7. Delete Admin Response

```
DELETE /api/v1/admin/reviews/:reviewId/response
```

#### 8. Get Review Analytics

```
GET /api/v1/admin/reviews/analytics
Query Params: hotelId, branchId, startDate, endDate

Response:
{
  success: true,
  data: {
    overview: {
      totalReviews,
      statusCounts: { pending, approved, rejected },
      approvalRate,
      avgModerationTime (in hours)
    },
    ratings: {
      avgFoodRating,
      avgHotelRating,
      avgBranchRating,
      avgStaffRating,
      avgOverallRating
    },
    distribution: {
      stars1-5: counts
    },
    engagement: {
      totalHelpfulVotes,
      avgHelpfulVotes,
      responseRate
    },
    breakdown: {
      byHotel: [top 10 hotels with review counts and avg ratings],
      byBranch: [top 10 branches with review counts and avg ratings]
    },
    trends: {
      monthly: [last 6 months with count and avgRating per month]
    }
  }
}
```

---

## Email Notifications

### 1. Review Invitation Email

**Trigger:** Automatically sent when order status is updated to "completed" AND payment status is "paid"

**Sent From:**

- `src/controllers/staff/orderController.js` (when staff marks order complete)
- `src/controllers/manager/orderController.js` (when manager marks order complete)

**Email Template:** `sendReviewInvitationEmail(order, user)`

**Content:**

- Personalized greeting with user name
- Order summary (Order ID, date, items count, total)
- Hotel and branch name
- Explanation of 4 rating categories (Food, Hotel, Branch, Staff)
- CTA button: "Write a Review" linking to `${FRONTEND_URL}/reviews/create?orderId=${orderId}`
- 30-day deadline reminder
- Professional hotel-branded footer

**Tracking:**

- Sets `order.reviewInviteSentAt` to prevent duplicate emails
- Email failures are logged but don't block order completion

### 2. Admin Response Email

**Trigger:** When admin adds a response to an approved review

**Sent From:** `src/controllers/admin/reviewModerationController.js` (addResponse endpoint)

**Email Template:** `sendReviewResponseEmail(review, user, admin, message)`

**Content:**

- Notification that hotel has responded
- User's review summary with all 4 ratings
- User's comment (if provided)
- Admin's response message with admin name
- CTA button: "View Full Review" linking to `${FRONTEND_URL}/reviews/${reviewId}`
- Encouragement to mark review as helpful

---

## Admin Analytics

### Dashboard Overview

The analytics endpoint provides comprehensive insights:

1. **Overview Metrics**

   - Total reviews count
   - Status breakdown (pending/approved/rejected)
   - Approval rate percentage
   - Average moderation time (pending → approved/rejected)

2. **Rating Analysis**

   - Average ratings for each category (Food, Hotel, Branch, Staff)
   - Overall average rating
   - Rating distribution (1-5 stars breakdown)

3. **Engagement Metrics**

   - Total helpful votes across all reviews
   - Average helpful votes per review
   - Admin response rate (% of approved reviews with responses)

4. **Performance Breakdown**

   - Top 10 hotels by review count and average rating
   - Top 10 branches by review count and average rating

5. **Trends**
   - Monthly review count and average rating for last 6 months
   - Helps identify seasonal patterns and service improvements

### Branch Admin Isolation

- Branch admins see analytics only for their assigned branches
- Hotel admins see all branches they created
- Super admins see all data

---

## Business Rules

### Review Eligibility

A user can submit a review for an order ONLY if:

1. ✅ Order status is "completed"
2. ✅ Payment status is "paid"
3. ✅ Order was completed within last 30 days
4. ✅ User has not already submitted a review for this order

### Review Lifecycle

```
1. User submits review → Status: PENDING
2. Admin reviews → Approves OR Rejects
   - If APPROVED:
     * Becomes publicly visible
     * Recalculates hotel/branch average ratings
     * User can no longer edit
     * Admin can add response (triggers email)
   - If REJECTED:
     * Not visible publicly
     * User NOT notified (per requirements)
     * User cannot edit or resubmit
3. If PENDING:
   * User can edit ratings and comment
   * Admin sees in moderation queue (oldest first)
```

### Rating Calculation

- **Overall Rating**: Average of 4 ratings (equal 25% weight each)
  ```javascript
  overallRating = (foodRating + hotelRating + branchRating + staffRating) / 4;
  ```
- **Hotel Average Rating**: Recalculated from all approved reviews for that hotel
- **Branch Average Rating**: Recalculated from all approved reviews for that branch

### Helpful Voting

- Any authenticated user can vote
- Toggle behavior: Click again to remove vote
- User can change helpful=true to helpful=false and vice versa
- Vote count increments/decrements accordingly
- Users can see if they've already voted

### Admin Responses

- Only on APPROVED reviews
- Sends email notification to review author
- Can be updated or deleted later
- Response includes admin's name
- Email shows full review summary + admin message

---

## Testing Guide

### Prerequisites

1. Ensure MongoDB is running
2. Have a user account with completed paid orders
3. Have an admin account with `handleComplaints` permission
4. Configure email service in `.env`:
   ```
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=your-app-password
   FRONTEND_URL=http://localhost:3000
   ```

### Test Scenarios

#### Scenario 1: Complete Review Submission Flow

1. **Mark Order as Completed**

   ```bash
   PUT /api/v1/staff/orders/:orderId/status
   Body: { status: "completed" }
   ```

   - ✅ Check: Email sent to user if payment is paid
   - ✅ Check: `order.reviewInviteSentAt` is set

2. **Check Review Eligibility**

   ```bash
   GET /api/v1/user/reviews/eligibility/:orderId
   ```

   - ✅ Should return `canReview: true` if within 30 days and paid

3. **Submit Review**

   ```bash
   POST /api/v1/user/reviews
   Body: {
     orderId: "...",
     foodRating: 5,
     hotelRating: 4,
     branchRating: 5,
     staffRating: 4,
     comment: "Excellent service!"
   }
   ```

   - ✅ Should return 201 with status: "pending"
   - ✅ Should update `order.hasReview = true`

4. **Try Duplicate Submission**
   - ✅ Should fail with "You have already reviewed this order"

#### Scenario 2: Admin Moderation Flow

1. **Get Pending Reviews**

   ```bash
   GET /api/v1/admin/reviews/pending
   ```

   - ✅ Should show newly submitted review (oldest first)

2. **Approve Review**

   ```bash
   PUT /api/v1/admin/reviews/:reviewId/approve
   ```

   - ✅ Review status becomes "approved"
   - ✅ Hotel and branch `averageRating` updated
   - ✅ Review visible in public endpoints

3. **Add Admin Response**
   ```bash
   POST /api/v1/admin/reviews/:reviewId/response
   Body: { message: "Thank you for your valuable feedback!" }
   ```
   - ✅ Email sent to user with review summary and response
   - ✅ Response visible in review details

#### Scenario 3: Public Review Browsing

1. **Get Hotel Reviews**

   ```bash
   GET /api/v1/user/reviews/hotel/:hotelId?sortBy=helpful
   ```

   - ✅ Returns only APPROVED reviews
   - ✅ Shows statistics and distribution
   - ✅ Most helpful reviews highlighted

2. **Mark Review Helpful**

   ```bash
   POST /api/v1/user/reviews/:reviewId/helpful
   Body: { helpful: true }
   ```

   - ✅ Increments `helpfulCount`
   - ✅ Adds user to `helpfulVotes` array

3. **Toggle Helpful Vote**
   ```bash
   POST /api/v1/user/reviews/:reviewId/helpful
   Body: { helpful: false }
   ```
   - ✅ Decrements `helpfulCount`
   - ✅ Updates vote in `helpfulVotes` array

#### Scenario 4: Analytics Dashboard

1. **Get Comprehensive Analytics**
   ```bash
   GET /api/v1/admin/reviews/analytics?startDate=2024-01-01&endDate=2024-12-31
   ```
   - ✅ Returns overview, ratings, distribution, engagement, breakdown, trends
   - ✅ Branch admins see only their branches

#### Scenario 5: Edge Cases

1. **Review Too Late**

   - Create order, wait 31 days, try to review
   - ✅ Should fail: "Review period has expired"

2. **Unpaid Order**

   - Complete order without payment
   - ✅ Should fail: "Order must be paid to submit a review"

3. **Edit After Approval**

   - Submit review, admin approves, try to edit
   - ✅ Should fail: "Cannot update review after approval"

4. **Reject Review**

   ```bash
   PUT /api/v1/admin/reviews/:reviewId/reject
   Body: { rejectionReason: "Inappropriate language" }
   ```

   - ✅ Status becomes "rejected"
   - ✅ User NOT notified (per requirements)
   - ✅ Not visible publicly

5. **Branch Admin Isolation**
   - Login as branch admin for Branch A
   - Try to moderate review for Branch B
   - ✅ Should NOT see Branch B reviews in list

---

## Configuration

### Environment Variables

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/hotel-management
```

### Frontend Routes Expected

- `/reviews/create?orderId=:orderId` - Review submission form
- `/reviews/:reviewId` - Review details page

---

## Security Considerations

1. **Input Validation**

   - All ratings validated (1-5 range)
   - Comment length limited (1000 chars)
   - MongoDB injection prevention via Mongoose

2. **Authorization**

   - User can only update/view their own reviews
   - Admin can only moderate reviews for assigned branches
   - RBAC enforced on all admin endpoints

3. **Data Integrity**

   - Compound unique index prevents duplicate reviews
   - Atomic operations for rating recalculations
   - Transaction-safe helpful vote toggles

4. **Privacy**
   - User email not exposed in public review listings
   - Only user name and basic info shown
   - Rejected reviews hidden from public view

---

## Performance Optimizations

1. **Database Indexes**

   - Compound index on (user, order) for duplicate prevention
   - Individual indexes on status, createdAt, helpfulCount for sorting
   - Covers all common query patterns

2. **Pagination**

   - All list endpoints support pagination (default limit: 10)
   - Prevents memory overflow on large datasets

3. **Aggregation Pipelines**

   - Efficient statistics calculation using MongoDB aggregation
   - Single query for complex analytics
   - $facet for parallel processing

4. **Caching Opportunities** (Future Enhancement)
   - Hotel/branch average ratings (update only on approve)
   - Public review lists (invalidate on approve)
   - Analytics dashboard (refresh every 15 minutes)

---

## Future Enhancements (Not Implemented)

1. **Image Uploads**: Allow users to add photos to reviews
2. **User Replies**: Let users respond to admin responses
3. **Review Editing History**: Track all changes to reviews
4. **Sentiment Analysis**: Auto-categorize reviews (positive/neutral/negative)
5. **Review Reminders**: Send follow-up if user didn't review after 7 days
6. **Staff-Specific Reviews**: Track individual waiter performance
7. **Review Verification**: "Verified Order" badge for legitimate reviews
8. **Bulk Moderation**: Approve/reject multiple reviews at once

---

## Troubleshooting

### Common Issues

**Issue 1: Email Not Sending**

- Check `EMAIL_USER` and `EMAIL_PASS` in `.env`
- Enable "Less secure app access" or use App Password for Gmail
- Check spam folder
- Review logs: `logger.error("Failed to send review invitation email...")`

**Issue 2: Duplicate Review Error**

- Verify order doesn't already have a review
- Check `order.hasReview` and `order.reviewId`
- Look for existing review in database: `db.reviews.findOne({order: orderId})`

**Issue 3: Branch Admin Can't See Reviews**

- Verify admin has `handleComplaints` permission
- Check admin's `assignedBranches` array includes the branch
- Confirm review's branch matches admin's assigned branches

**Issue 4: Average Rating Not Updating**

- Check if review was approved (only approved reviews affect averages)
- Look for errors in `recalculateEntityRatings` service
- Manually verify: `db.reviews.aggregate([{$match: {hotel: hotelId, status: 'approved'}}, {$group: {_id: null, avg: {$avg: "$overallRating"}}}])`

**Issue 5: Review Not Visible Publicly**

- Confirm review status is "approved"
- Check if review matches hotel/branch filter in query
- Verify pagination parameters

---

## Code Locations Reference

| Component                     | File Path                                             |
| ----------------------------- | ----------------------------------------------------- |
| Review Model                  | `src/models/Review.model.js`                          |
| Review Service                | `src/services/reviewService.js`                       |
| Analytics Service             | `src/services/reviewAnalyticsService.js`              |
| User Controller               | `src/controllers/user/reviewController.js`            |
| Admin Controller              | `src/controllers/admin/reviewModerationController.js` |
| User Routes                   | `src/routes/user.route.js`                            |
| Admin Routes                  | `src/routes/admin/review.route.js`                    |
| Email Templates               | `src/utils/emailService.js`                           |
| Order Email Trigger (Staff)   | `src/controllers/staff/orderController.js`            |
| Order Email Trigger (Manager) | `src/controllers/manager/orderController.js`          |
| Order Model Extensions        | `src/models/Order.model.js`                           |

---

## Summary

This review system provides a complete, production-ready solution for collecting and managing customer feedback with:

- **User Experience**: Easy review submission, helpful voting, public browsing
- **Admin Control**: Moderation workflow, response capability, comprehensive analytics
- **Automation**: Email invitations and notifications
- **Security**: Branch isolation, RBAC, input validation
- **Scalability**: Efficient queries, pagination, aggregation pipelines

All requirements from the planning phase have been successfully implemented! 🎉
