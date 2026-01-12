# Review System - Quick Start Guide

## 🚀 Quick Implementation Summary

The review and rating system has been successfully implemented with the following components:

### ✅ Completed Files

1. **Models**

   - ✅ `src/models/Review.model.js` - Complete review schema with validations
   - ✅ `src/models/Order.model.js` - Extended with review tracking fields

2. **Services**

   - ✅ `src/services/reviewService.js` - Business logic for reviews
   - ✅ `src/services/reviewAnalyticsService.js` - Analytics and statistics

3. **Controllers**

   - ✅ `src/controllers/user/reviewController.js` - 8 user endpoints
   - ✅ `src/controllers/admin/reviewModerationController.js` - 8 admin endpoints

4. **Routes**

   - ✅ `src/routes/user.route.js` - User review routes added
   - ✅ `src/routes/admin/review.route.js` - New admin review routes
   - ✅ `src/routes/admin.route.js` - Mounted admin review routes

5. **Email Integration**

   - ✅ `src/utils/emailService.js` - 2 new email templates added
   - ✅ `src/controllers/staff/orderController.js` - Email trigger on order complete
   - ✅ `src/controllers/manager/orderController.js` - Email trigger on order complete

6. **Documentation**
   - ✅ `docs/REVIEW_SYSTEM_DOCUMENTATION.md` - Complete system documentation

---

## 🎯 Quick Test Flow

### Step 1: Complete an Order

```bash
# As Staff/Manager - Mark order as completed
PUT /api/v1/staff/orders/:orderId/status
Authorization: Bearer <staff-token>
Content-Type: application/json

{
  "status": "completed"
}

# ✅ Check: Review invitation email sent to customer
# ✅ Check: order.reviewInviteSentAt is set
```

### Step 2: Submit a Review

```bash
# As User - Submit review for the completed order
POST /api/v1/user/reviews
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "orderId": "67890abcdef...",
  "foodRating": 5,
  "hotelRating": 4,
  "branchRating": 5,
  "staffRating": 4,
  "comment": "Excellent service and delicious food!"
}

# ✅ Response: 201 Created with status: "pending"
```

### Step 3: Moderate the Review

```bash
# As Admin - Get pending reviews
GET /api/v1/admin/reviews/pending
Authorization: Bearer <admin-token>

# As Admin - Approve the review
PUT /api/v1/admin/reviews/:reviewId/approve
Authorization: Bearer <admin-token>

# ✅ Review is now publicly visible
# ✅ Hotel/branch average ratings updated
```

### Step 4: Add Admin Response

```bash
# As Admin - Respond to the review
POST /api/v1/admin/reviews/:reviewId/response
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "message": "Thank you for your wonderful feedback! We're thrilled you enjoyed your experience."
}

# ✅ Email sent to user with review summary and admin response
```

### Step 5: Public View

```bash
# As Any User - View hotel reviews
GET /api/v1/user/reviews/hotel/:hotelId?sortBy=helpful

# ✅ See all approved reviews with statistics
# ✅ Rating distribution
# ✅ Most helpful reviews
```

---

## 📊 API Endpoints Summary

### User Endpoints (Public - No Auth)

```
GET  /api/v1/user/reviews/hotel/:hotelId      - Get hotel reviews
GET  /api/v1/user/reviews/branch/:branchId    - Get branch reviews
GET  /api/v1/user/reviews/:reviewId           - Get review details
```

### User Endpoints (Protected - Auth Required)

```
POST /api/v1/user/reviews                     - Submit new review
GET  /api/v1/user/reviews/my-reviews          - Get my reviews
PUT  /api/v1/user/reviews/:reviewId           - Update review (if pending)
GET  /api/v1/user/reviews/eligibility/:orderId - Check if can review
POST /api/v1/user/reviews/:reviewId/helpful   - Mark review helpful
```

### Admin Endpoints (Protected - Admin + handleComplaints permission)

```
GET    /api/v1/admin/reviews                   - Get all reviews
GET    /api/v1/admin/reviews/pending           - Get pending reviews
GET    /api/v1/admin/reviews/analytics         - Get analytics
PUT    /api/v1/admin/reviews/:reviewId/approve - Approve review
PUT    /api/v1/admin/reviews/:reviewId/reject  - Reject review
POST   /api/v1/admin/reviews/:reviewId/response - Add response
PUT    /api/v1/admin/reviews/:reviewId/response - Update response
DELETE /api/v1/admin/reviews/:reviewId/response - Delete response
```

---

## 🔐 Required Permissions

### User Actions

- **Submit Review**: Authenticated user with completed paid order
- **View Own Reviews**: Authenticated user
- **Update Review**: Authenticated user + review status must be "pending"
- **Mark Helpful**: Any authenticated user

### Admin Actions

- **All Review Moderation**:
  - Admin role
  - `handleComplaints` permission (via RBAC)
  - Branch isolation (branch admins see only their branches)

---

## 📧 Email Configuration

Make sure your `.env` has:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=http://localhost:3000
```

### Email Templates Included

1. **Review Invitation** - Sent when order is completed

   - Personalized with user name and order details
   - Lists all 4 rating categories
   - CTA button to review form
   - 30-day deadline reminder

2. **Admin Response** - Sent when admin responds to review
   - Shows user's review summary
   - Displays admin's response
   - Link to view full review
   - Encourages engagement

---

## 🎨 Rating System

### 4 Categories (All Required, 1-5 scale)

1. **🍕 Food Quality** - Taste, presentation, temperature
2. **🏨 Hotel Experience** - Ambiance, atmosphere, decor
3. **🏢 Branch Service** - Facilities, cleanliness, comfort
4. **👥 Staff Behavior** - Friendliness, attentiveness, professionalism

### Overall Rating Calculation

```javascript
overallRating = (foodRating + hotelRating + branchRating + staffRating) / 4;
```

**Equal weights**: Each category contributes 25% to overall rating

---

## 🔄 Review Lifecycle

```
1. User submits review
   ↓
   [STATUS: PENDING] - User can edit, admin can't see publicly
   ↓
2. Admin moderates
   ↓
   ├─→ APPROVE → Publicly visible + ratings recalculated
   │             User can't edit anymore
   │             Admin can add response
   │
   └─→ REJECT → Hidden forever + no user notification
```

---

## 📈 Analytics Included

### Overview

- Total reviews count
- Status breakdown (pending/approved/rejected)
- Approval rate percentage
- Average moderation time

### Ratings Analysis

- Average for each category (Food, Hotel, Branch, Staff)
- Overall average rating
- Rating distribution (1-5 stars breakdown)

### Engagement

- Total helpful votes
- Average helpful votes per review
- Admin response rate

### Performance

- Top 10 hotels by review count and rating
- Top 10 branches by review count and rating
- Monthly trends (last 6 months)

---

## 🔍 Testing Checklist

### Basic Flow

- [ ] Order completion triggers email
- [ ] User receives review invitation email
- [ ] User can check eligibility for order
- [ ] User can submit review with all 4 ratings
- [ ] Duplicate review submission is blocked
- [ ] Pending review appears in admin moderation queue
- [ ] Admin can approve review
- [ ] Approved review is publicly visible
- [ ] Hotel/branch average ratings updated

### Advanced Features

- [ ] Admin can reject review with reason
- [ ] Rejected review is hidden (no user notification)
- [ ] Admin can respond to approved review
- [ ] User receives email with admin response
- [ ] Users can mark reviews as helpful
- [ ] Helpful vote count updates correctly
- [ ] Toggling helpful vote works (on/off)
- [ ] Analytics dashboard shows correct statistics

### Security & Access

- [ ] Branch admin sees only assigned branches
- [ ] User can't edit approved reviews
- [ ] User can only view their own pending reviews
- [ ] Public endpoints show only approved reviews
- [ ] RBAC enforces handleComplaints permission

### Edge Cases

- [ ] Review after 30 days is rejected
- [ ] Review for unpaid order is rejected
- [ ] Email failure doesn't block order completion
- [ ] Missing hotel/branch doesn't crash system
- [ ] Invalid ratings (0, 6, etc.) are rejected

---

## 🐛 Troubleshooting

### Review Not Showing Publicly

**Cause**: Review status is still "pending"
**Fix**: Admin must approve the review first

### Email Not Received

**Cause**: Email configuration or spam filter
**Fix**:

1. Check `.env` EMAIL_USER and EMAIL_PASS
2. Check spam/junk folder
3. Review server logs for email errors

### Can't Submit Review

**Possible Causes**:

- Order not completed yet
- Order not paid
- Order completed >30 days ago
- Already submitted review for this order

**Fix**: Check eligibility endpoint first:

```bash
GET /api/v1/user/reviews/eligibility/:orderId
```

### Branch Admin Can't See Reviews

**Cause**: Review's branch not in admin's assignedBranches
**Fix**: Verify admin has correct branch assignments

---

## 💡 Pro Tips

1. **Always check eligibility first** before showing review form to users
2. **Sort by helpful** to showcase best reviews on public pages
3. **Monitor pending queue** regularly to avoid review backlog
4. **Use analytics** to identify service improvement areas
5. **Respond to reviews** to show customers you care (triggers email)
6. **Branch isolation** ensures admins only see relevant reviews

---

## 📚 Full Documentation

For complete details, see:

- **`docs/REVIEW_SYSTEM_DOCUMENTATION.md`** - Comprehensive system documentation
- **Code files** - All files listed at the beginning of this guide

---

## ✨ Features Implemented

✅ 4-category rating system (Food, Hotel, Branch, Staff)  
✅ Admin moderation workflow  
✅ One review per order  
✅ 30-day review window  
✅ Helpful voting with toggle  
✅ Admin responses with email notifications  
✅ Branch admin isolation  
✅ Automatic review invitation emails  
✅ Comprehensive analytics dashboard  
✅ Public and authenticated endpoints  
✅ Full RBAC integration

---

## 🎉 Ready to Use!

The system is fully implemented and ready for testing. Start with the Quick Test Flow above and refer to the full documentation for detailed information.

**Happy Testing! 🚀**
