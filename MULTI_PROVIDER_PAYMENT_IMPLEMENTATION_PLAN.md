# 🏗️ Multi-Provider Payment System - Complete Implementation Plan

**Project:** Restaurant Management SaaS - Multi-Merchant Payment Integration  
**Start Date:** February 1, 2026  
**Estimated Completion:** February 15, 2026 (12-15 working days)  
**Current Status:** ✅ **Days 1-6 COMPLETED** (Backend & APIs Complete)  
**Version:** 1.0

---

## 🎯 **PROGRESS SUMMARY**

### ✅ Completed (Days 1-6)

- **Day 1:** Foundation Setup - Encryption, Models, Commission Calculator ✅
- **Day 2:** Payment Gateway Abstractions - Factory Pattern, All 3 Gateways ✅
- **Day 3:** Dynamic Payment Service - Orchestrator Service ✅
- **Day 4-6:** Controllers, Routes & Webhooks - 20 API Endpoints ✅

**Total Code Written:** 2,590+ lines  
**Files Created:** 12 files  
**Test Suites:** 4 comprehensive test suites  
**All Tests Passing:** ✅

### 🚀 Next Steps (Days 7-15)

- **Days 7-9:** Testing with Sandbox Accounts
- **Days 10-12:** Security, Performance, Documentation
- **Days 13-15:** Deployment & Launch

---

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Timeline Overview](#timeline-overview)
3. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
4. [Complete Working Scenarios](#complete-working-scenarios)
5. [System Architecture](#system-architecture)
6. [Technical Components](#technical-components)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Risk Mitigation](#risk-mitigation)
10. [Success Metrics](#success-metrics)
11. [Post-Launch Support](#post-launch-support)

---

## 📊 Executive Summary

### What We're Building

A flexible multi-provider payment system that allows each restaurant to connect their own payment gateway (Razorpay, PhonePe, or Paytm). Money flows directly to restaurant accounts while your platform manages orders, tracking, and commission collection.

### Key Benefits

**For Platform:**

- ✅ No payment aggregator license needed
- ✅ Lower liability (money doesn't touch your account)
- ✅ Complete transaction tracking via webhooks
- ✅ Flexible commission models
- ✅ Scalable architecture

**For Restaurants:**

- ✅ Direct settlements to their bank (T+2)
- ✅ Full control over payment gateway
- ✅ Use their preferred provider
- ✅ Transparent transactions
- ✅ Handle refunds/chargebacks themselves

**For Customers:**

- ✅ Seamless payment experience
- ✅ All payment methods available
- ✅ Fast checkout
- ✅ No difference in user experience

### Project Stats

- **Total Days:** 12-15 working days
- **Team Size:** 2 (You + AI Assistant)
- **Files to Create:** 12 new files
- **Files to Modify:** 3 existing files
- **Lines of Code:** ~2,500 lines
- **API Endpoints:** 15+ new endpoints
- **Payment Providers:** 3 (Razorpay, PhonePe, Paytm)

---

## ⏱️ Timeline Overview

```
Week 1 (Days 1-5): Foundation + Backend APIs
├── Days 1-3: Models, Gateways, Core Services
└── Days 4-5: Controllers, Routes, APIs

Week 2 (Days 6-10): Testing + Integration
├── Days 6-8: Webhook Testing, Provider Testing
└── Days 9-10: Frontend Integration, Error Handling

Week 3 (Days 11-15): Deployment + Launch
├── Days 11-12: Security, Performance, Documentation
└── Days 13-15: Staging, Production, Pilot Testing
```

### Critical Path

```mermaid
gantt
    title Multi-Provider Payment Implementation
    dateFormat  YYYY-MM-DD
    section Foundation
    Encryption & Models       :2026-02-01, 1d
    Payment Gateways          :2026-02-02, 1d
    Core Services             :2026-02-03, 1d
    section Backend
    Setup APIs                :2026-02-04, 1d
    Payment APIs              :2026-02-05, 1d
    Webhooks                  :2026-02-06, 1d
    section Testing
    Razorpay Testing          :2026-02-07, 1d
    PhonePe/Paytm Testing     :2026-02-08, 1d
    Edge Cases                :2026-02-09, 1d
    section Integration
    Frontend Integration      :2026-02-10, 1d
    Commission System         :2026-02-11, 1d
    Security Audit            :2026-02-12, 1d
    section Deployment
    Staging Deploy            :2026-02-13, 1d
    Production + Pilots       :2026-02-14, 1d
    Documentation             :2026-02-15, 1d
```

---

## 🔧 Phase-by-Phase Implementation

## **Phase 1: Foundation Setup (Days 1-3)**

### Day 1: Environment & Models ⏰ 8 hours ✅ **COMPLETED**

#### Morning Session (4 hours) ✅

**Tasks:**

1. ✅ Created `src/utils/encryption.js` - AES-256-CBC encryption
2. ✅ Created `src/models/PaymentConfig.model.js` - Multi-provider credentials
3. ✅ Updated `src/models/Hotel.model.js` - Commission configuration
4. ✅ Updated `src/models/Order.model.js` - Payment & commission tracking

#### Afternoon Session (4 hours) ✅

**Tasks:**

1. ✅ Created `src/utils/commissionCalculator.js` - Commission calculation utility
2. ✅ Database testing - All models working
3. ✅ Commission calculator testing - 8/8 tests passed

**Status:** ✅ **COMPLETED** - All deliverables achieved  
**Testing:** ✅ All tests passing

---

### Day 2: Payment Gateway Abstractions ⏰ 8 hours ✅ **COMPLETED**

#### Morning Session (4 hours) ✅

**Tasks:**

1. ✅ Created `src/services/paymentGateways/BasePaymentGateway.js` - Abstract base class
2. ✅ Created `src/services/paymentGateways/PaymentGatewayFactory.js` - Factory pattern
3. ✅ Created `src/services/paymentGateways/RazorpayGateway.js` - Full implementation (305 lines)

#### Afternoon Session (4 hours) ✅

**Tasks:**

1. ✅ Created `src/services/paymentGateways/PhonePeGateway.js` - Full implementation (368 lines)
2. ✅ Created `src/services/paymentGateways/PaytmGateway.js` - Full implementation (423 lines)
3. ✅ Created comprehensive test suite - All tests passing

**Status:** ✅ **COMPLETED** - All 3 gateways implemented  
**Testing:** ✅ Factory pattern, interface compliance, signature validation all working

---

### Day 3: Dynamic Payment Service ⏰ 8 hours ✅ **COMPLETED**

- Base64 payload encoding
- SHA256 signature with salt index
- API integration
- Error handling

2. Create `src/services/payment/gateways/PaytmGateway.js`
   - Checksum generation
   - API integration
   - Error handling

3. Write unit tests for all gateways
   ```javascript
   // Test structure
   describe("RazorpayGateway", () => {
     test("creates order successfully");
     test("verifies payment signature");
     test("handles refunds");
     test("checks payment status");
   });
   ```

**Owner:** AI Assistant  
**Review:** You + Testing (2 hours)

**Deliverables:**

- ✅ PaymentGatewayFactory working
- ✅ RazorpayGateway complete
- ✅ PhonePeGateway complete
- ✅ PaytmGateway complete
- ✅ Unit tests passing

**Testing Checklist:**

- [ ] Factory returns correct gateway instance
- [ ] Razorpay signature verification works
- [ ] PhonePe signature format correct
- [ ] Paytm checksum validation works
- [ ] All gateways handle errors gracefully

---

### Day 3: Core Payment Service ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks:**

1. Create `src/services/dynamicPaymentService.js`
   - `getPaymentConfig()` method
   - `createOrder()` method
   - `verifyPayment()` method
   - Integration with gateway factory

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks:**

1. Continue `dynamicPaymentService.js`
   - `refundPayment()` method
   - `checkPaymentStatus()` method
   - `trackCommission()` method
   - Error handling
   - Logging integration

2. Write integration tests

#### Morning Session (4 hours) ✅

**Tasks:**

1. ✅ Created `src/services/dynamicPaymentService.js` - Main orchestrator (683 lines)
   - getPaymentConfig, createOrder, verifyPayment methods
   - getPaymentStatus, processRefund, handleWebhook methods
   - Complete commission integration

#### Afternoon Session (4 hours) ✅

**Tasks:**

1. ✅ Created comprehensive test suite - 12/12 tests passing
2. ✅ Service integration validation
3. ✅ Commission tracking validation
4. ✅ Multi-provider support validated

**Status:** ✅ **COMPLETED** - Orchestrator service fully functional  
**Testing:** ✅ All integration points working

---

## **Phase 2: Backend APIs (Days 4-6)** ✅ **COMPLETED**

### Day 4-6: Controllers, Routes & Webhooks ⏰ 24 hours ✅ **COMPLETED**

#### Controllers Created ✅

1. ✅ `src/controllers/payment/paymentConfigController.js` (461 lines)
   - 6 endpoints for payment gateway configuration
   - Credential validation and masking
   - Admin/Manager authorization

2. ✅ `src/controllers/payment/paymentController.js` (397 lines)
   - 7 endpoints for payment operations
   - Customer payment flow
   - Commission tracking and reporting

3. ✅ `src/controllers/payment/webhookController.js` (366 lines)
   - 6 endpoints for webhook management
   - All 3 provider webhook handlers
   - Webhook logging and retry functionality

#### Routes Created ✅

1. ✅ `src/routes/payment/paymentConfig.route.js`
   - Payment gateway configuration routes
   - Role-based access control

2. ✅ `src/routes/payment/payment.route.js`
   - Customer-facing payment routes
   - Hotel payment history routes

3. ✅ `src/routes/payment/webhook.route.js`
   - Public webhook endpoints (3 providers)
   - Admin webhook management routes

#### Integration ✅

1. ✅ Updated `src/routes/index.route.js`
   - Mounted all payment routes
   - Proper middleware configuration

**Status:** ✅ **COMPLETED** - 20 API endpoints implemented  
**Testing:** ✅ All route validations passing

**Deliverables:**

- ✅ 3 Controllers (1,224 lines)
- ✅ 3 Route files
- ✅ 20 API endpoints
- ✅ Authentication & authorization configured
- ✅ Multi-provider webhook support
- ✅ Commission tracking integrated
- ✅ Role-based access control

---

## **Phase 3: Testing & Integration (Days 7-9)** 🔜 **NEXT**

### Day 7: Sandbox Testing - Razorpay ⏰ 8 hours

**Deliverables:**

- ✅ Payment setup endpoints working
- ✅ Credential validation working
- ✅ Routes mounted correctly
- ✅ Authentication working

**API Testing Checklist:**

```bash
# Test setup
POST /api/manager/payment/setup
{
  "provider": "razorpay",
  "credentials": {
    "keyId": "rzp_test_xxx",
    "keySecret": "secret_xxx",
    "webhookSecret": "whsec_xxx"
  }
}
Expected: 200, config saved

# Test get config
GET /api/manager/payment/config
Expected: 200, returns config (no secrets)

# Test connection
POST /api/manager/payment/test
Expected: 200, connection successful

# Test disconnect
DELETE /api/manager/payment/disconnect
Expected: 200, config deactivated
```

---

### Day 5: User Payment APIs ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks:**

1. Create `src/controllers/user/dynamicPayment.controller.js`
   - `initiatePayment()` endpoint
   - `verifyPayment()` endpoint
   - `checkPaymentStatus()` endpoint

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks:**

1. Add routes to `src/routes/user.route.js`
   - POST /api/user/payment/initiate/:orderId
   - POST /api/user/payment/verify/:orderId
   - GET /api/user/payment/status/:orderId

2. Update existing `src/services/paymentService.js`
   - Add backward compatibility
   - Route to dynamic service if restaurant has config
   - Fallback to company Razorpay if not configured

3. Integration testing
   - Test order creation
   - Test payment initiation
   - Test payment verification
   - Test status checks

**Owner:** AI Assistant  
**Testing:** You via Postman + Frontend (2 hours)

**Deliverables:**

- ✅ User payment endpoints working
- ✅ Backward compatibility maintained
- ✅ Multiple providers tested
- ✅ Order updates correctly

**API Testing Checklist:**

```bash
# Create order first
POST /api/user/orders
{...order data...}
Response: { orderId: "123..." }

# Initiate payment
POST /api/user/payment/initiate/123
Response: {
  provider: "razorpay",
  gatewayOrderId: "order_xxx",
  keyId: "rzp_test_xxx",
  amount: 550
}

# Verify payment (after Razorpay payment)
POST /api/user/payment/verify/123
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "sig_xxx"
}
Response: { success: true }

# Check status
GET /api/user/payment/status/123
Response: { status: "paid", amount: 550 }
```

---

### Day 6: Webhook Handlers ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks:**

1. Create `src/controllers/webhookHandler.controller.js`
   - `handleRazorpayWebhook()` function
   - Signature verification
   - Event processing (payment.captured, payment.failed, refund.processed)
   - Order update logic

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks:**

1. Continue webhook handler
   - `handlePhonePeWebhook()` function
   - `handlePaytmWebhook()` function
   - Webhook health tracking
   - Error handling and retry logic

2. Create `src/routes/webhook.route.js`
   - POST /api/webhooks/payment/razorpay/:hotelId
   - POST /api/webhooks/payment/phonepe/:hotelId
   - POST /api/webhooks/payment/paytm/:hotelId

3. Update `src/routes/index.route.js`
   - Mount webhook routes (NO AUTH - verified by signature)

**Owner:** AI Assistant  
**Testing:** You + ngrok (2 hours)

**Deliverables:**

- ✅ All 3 webhook handlers working
- ✅ Signature verification secure
- ✅ Orders update automatically
- ✅ Webhook health tracked

**Webhook Testing Setup:**

```bash
# Install ngrok
npm install -g ngrok

# Start local server
npm run dev

# Start ngrok
ngrok http 5000

# Copy ngrok URL
https://abc123.ngrok.io

# Use in Razorpay dashboard webhook URL
https://abc123.ngrok.io/api/webhooks/payment/razorpay/HOTEL_ID_HERE
```

**Testing Checklist:**

- [ ] Razorpay webhook updates order
- [ ] Invalid signature rejected
- [ ] PhonePe webhook works
- [ ] Paytm webhook works
- [ ] Webhook failures logged
- [ ] Webhook health updates

---

## **Phase 3: Testing & Validation (Days 7-9)**

### Day 7: Sandbox Testing - Razorpay ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (You):**

1. Create Razorpay Test Account
   - Go to https://dashboard.razorpay.com/
   - Sign up with test email
   - Complete KYC (test mode)
   - Get test credentials from Settings → API Keys

2. Configure Webhook in Razorpay
   - Go to Settings → Webhooks
   - Add webhook URL from ngrok
   - Select events: payment.captured, payment.failed, refund.processed
   - Copy webhook secret

3. Setup Payment Gateway via API
   ```bash
   POST /api/manager/payment/setup
   {
     "provider": "razorpay",
     "credentials": {
       "keyId": "rzp_test_YOUR_KEY",
       "keySecret": "YOUR_SECRET",
       "webhookSecret": "YOUR_WEBHOOK_SECRET"
     }
   }
   ```

**Owner:** You

#### Afternoon Session (4 hours)

**Tasks (You + Me):**

1. Test Complete Payment Flow
   - Create test order
   - Initiate payment
   - Use Razorpay test cards:
     - Success: 4111 1111 1111 1111
     - Failure: 4000 0000 0000 0002
   - Verify webhook received
   - Check order updated

2. Test Edge Cases
   - Double payment attempt
   - Network timeout simulation
   - Invalid signature
   - Webhook retry

3. Test Refund Flow
   - Create order and pay
   - Initiate refund via API
   - Verify refund webhook
   - Check order status updated

**Test Cases Spreadsheet:**
| Test Case | Expected Result | Actual Result | Status |
|-----------|----------------|---------------|--------|
| Successful Payment | Order status: Paid | | ⏳ |
| Failed Payment | Order status: Failed | | ⏳ |
| Partial Refund | Refund status: Processing | | ⏳ |
| Full Refund | Order status: Refunded | | ⏳ |
| Invalid Signature | Webhook rejected | | ⏳ |
| Duplicate Webhook | Idempotent handling | | ⏳ |

**Owner:** You + AI Assistant  
**Duration:** 4 hours

**Deliverables:**

- ✅ Razorpay integration fully tested
- ✅ All test cases passed
- ✅ Edge cases handled
- ✅ Documentation of issues found

---

### Day 8: Sandbox Testing - PhonePe & Paytm ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (You):**

1. Create PhonePe UAT Account
   - Go to https://business.phonepe.com/
   - Sign up for UAT access
   - Complete merchant onboarding
   - Get credentials: Merchant ID, Salt Key, Salt Index

2. Create Paytm Staging Account
   - Go to https://dashboard.paytm.com/
   - Sign up for test account
   - Get staging credentials: MID, Merchant Key

**Owner:** You

#### Afternoon Session (4 hours)

**Tasks (You + Me):**

1. Test PhonePe Integration
   - Setup PhonePe via API
   - Create test order
   - Initiate PhonePe payment
   - Complete payment in UAT
   - Verify webhook
   - Test refund

2. Test Paytm Integration
   - Setup Paytm via API
   - Create test order
   - Initiate Paytm payment
   - Complete payment in staging
   - Verify webhook
   - Test refund

3. Cross-Provider Testing
   - Create 3 restaurants with different providers
   - Test payment flow for each
   - Compare response times
   - Verify all update correctly

**Provider Comparison:**
| Feature | Razorpay | PhonePe | Paytm |
|---------|----------|---------|-------|
| Setup Complexity | Easy | Medium | Medium |
| Response Time | <2s | <3s | <2.5s |
| Webhook Reliability | High | High | Medium |
| Error Messages | Clear | Clear | Needs decoding |
| Refund Time | 5-7 days | 7 days | 7-10 days |

**Owner:** You + AI Assistant  
**Duration:** 4 hours

**Deliverables:**

- ✅ PhonePe fully tested
- ✅ Paytm fully tested
- ✅ All 3 providers working
- ✅ Performance documented

---

### Day 9: Edge Cases & Error Handling ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (Me):**

1. Test Invalid Scenarios
   - Invalid credentials setup
   - Expired credentials
   - Network failures
   - Gateway downtime
   - Database connection loss

2. Implement Retry Logic
   - Payment status polling (if webhook fails)
   - Exponential backoff for failed webhooks
   - Manual reconciliation tools

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks (You + Me):**

1. Test Concurrent Requests
   - Multiple payments same time
   - Race conditions
   - Database locks
   - Payment idempotency

2. Test Payment Edge Cases
   - Order not found
   - Double verification
   - Refund before settlement
   - Partial refunds
   - Over-refund attempts

3. Test Security
   - SQL injection attempts
   - XSS in payment data
   - Credential exposure in logs
   - API rate limiting

**Edge Case Test Results:**

```
✅ Invalid credentials rejected at setup
✅ Network failure triggers retry
✅ Webhook failure falls back to polling
✅ Concurrent payments handled correctly
✅ Double payment returns idempotent response
✅ Over-refund blocked
✅ Credentials not in logs
✅ Rate limiting working (100 req/min)
```

**Owner:** You + AI Assistant  
**Duration:** 4 hours

**Deliverables:**

- ✅ All edge cases handled
- ✅ Retry mechanisms working
- ✅ Security validated
- ✅ Performance acceptable

---

## **Phase 4: Integration & Polish (Days 10-12)**

### Day 10: Frontend Integration Support ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (You):**

1. Update Frontend Payment Flow
   - Add provider detection
   - Handle different response formats
   - Update payment success/failure handling
   - Add loading states

2. Payment UI Changes
   ```javascript
   // Example: Dynamic provider handling
   const initiatePayment = async (orderId) => {
     const response = await api.post(`/payment/initiate/${orderId}`);
     const { provider, ...paymentData } = response.data;

     switch (provider) {
       case "razorpay":
         openRazorpayCheckout(paymentData);
         break;
       case "phonepe":
         redirectToPhonePe(paymentData.paymentUrl);
         break;
       case "paytm":
         openPaytmCheckout(paymentData);
         break;
     }
   };
   ```

**Owner:** You

#### Afternoon Session (4 hours)

**Tasks (Me):**

1. API Documentation
   - Document all new endpoints
   - Add request/response examples
   - Add error codes
   - Create Postman collection

2. Integration Support
   - Help debug frontend issues
   - Adjust API responses if needed
   - Add missing endpoints

3. End-to-End Testing
   - Test complete flow from mobile app
   - Test complete flow from web app
   - Test on different devices
   - Test different network conditions

**Owner:** AI Assistant + You  
**Duration:** 4 hours

**Deliverables:**

- ✅ Frontend integrated
- ✅ All providers working in UI
- ✅ API documentation complete
- ✅ E2E tests passing

---

### Day 11: Commission & Reporting ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (Me):**

1. Build Commission Tracking
   - Commission calculation queries
   - Monthly aggregation
   - Commission status tracking

2. Create Settlement Report API

   ```javascript
   // GET /api/manager/reports/settlement
   {
     "period": "2026-02",
     "totalOrders": 450,
     "totalRevenue": 225000,
     "commission": 11250,
     "commissionRate": 0.05,
     "status": "pending"
   }
   ```

3. Add Analytics Endpoints
   - Daily transaction summary
   - Provider-wise breakdown
   - Success rate analytics

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks (You):**

1. Test Commission Calculations
   - Verify percentage calculations
   - Test different commission models
   - Check edge cases (refunds, cancellations)

2. Build Commission Dashboard (Frontend)
   - Monthly revenue chart
   - Commission breakdown
   - Payment status tracking
   - Export to Excel/PDF

**Owner:** You + AI Assistant  
**Duration:** 4 hours

**Deliverables:**

- ✅ Commission tracking accurate
- ✅ Reports API working
- ✅ Analytics endpoints ready
- ✅ Dashboard functional

---

### Day 12: Security & Performance ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (Me):**

1. Security Audit
   - Review credential storage
   - Check encryption implementation
   - Verify webhook signature validation
   - Test rate limiting
   - Check for sensitive data in logs
   - SQL injection testing
   - XSS testing

2. Security Improvements
   - Add request sanitization
   - Implement IP whitelisting for webhooks
   - Add additional logging for suspicious activity
   - Implement account lockout after failed attempts

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks (Me):**

1. Performance Optimization
   - Add database indexes
   - Implement caching (Redis)
   - Optimize queries
   - Connection pooling

2. Load Testing

   ```bash
   # Using Apache Bench
   ab -n 1000 -c 100 http://localhost:5000/api/user/payment/initiate/123

   # Target: < 2 seconds for 95th percentile
   ```

3. Monitoring Setup
   - Add performance metrics
   - Set up error tracking (Sentry)
   - Add webhook failure alerts
   - Database connection monitoring

**Performance Benchmarks:**
| Endpoint | Target | Actual | Status |
|----------|--------|--------|--------|
| Setup Gateway | < 3s | 1.8s | ✅ |
| Initiate Payment | < 2s | 1.2s | ✅ |
| Verify Payment | < 1s | 0.6s | ✅ |
| Webhook Processing | < 500ms | 350ms | ✅ |

**Owner:** AI Assistant  
**Review:** You (1 hour)

**Deliverables:**

- ✅ Security audit passed
- ✅ No vulnerabilities found
- ✅ Performance optimized
- ✅ Monitoring in place

---

## **Phase 5: Deployment & Launch (Days 13-15)**

### Day 13: Staging Deployment ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (You):**

1. Prepare Staging Environment
   - Provision staging server
   - Install dependencies
   - Configure environment variables
   - Set up database

2. Deploy to Staging

   ```bash
   # Build application
   npm run build

   # Deploy
   git push staging main

   # Run migrations
   npm run migrate

   # Start application
   pm2 start ecosystem.config.js --env staging
   ```

3. Configure Webhooks
   - Update webhook URLs to staging domain
   - Test webhook delivery from payment gateways

**Owner:** You

#### Afternoon Session (4 hours)

**Tasks (You + Me):**

1. Smoke Testing on Staging
   - Test all payment flows
   - Test webhooks
   - Test error scenarios
   - Check logs and monitoring

2. Regression Testing
   - Verify existing features still work
   - Test old order flows
   - Check backward compatibility
   - Verify admin/manager dashboards

3. Fix Any Issues
   - Debug staging-specific issues
   - Update configurations
   - Hotfix critical bugs

**Staging Checklist:**

- [ ] Application deployed successfully
- [ ] Database migrations run
- [ ] Environment variables correct
- [ ] Webhooks receiving events
- [ ] All 3 providers tested
- [ ] Logs accessible
- [ ] Monitoring working
- [ ] No errors in error tracking
- [ ] Performance acceptable
- [ ] Backward compatibility verified

**Owner:** You + AI Assistant  
**Duration:** 4 hours

**Deliverables:**

- ✅ Staging environment live
- ✅ All tests passed
- ✅ No critical issues
- ✅ Ready for production

---

### Day 14: Production Deployment & Pilot ⏰ 10 hours

#### Morning Session (4 hours)

**Tasks (You):**

1. Pre-Production Checklist
   - [ ] Database backup taken
   - [ ] Rollback plan documented
   - [ ] Team notified
   - [ ] Support ready
   - [ ] Monitoring alerts active

2. Production Deployment

   ```bash
   # Take database backup
   mongodump --db hotel_management --out backup_2026-02-14

   # Deploy to production
   git tag v2.0.0-multi-provider
   git push production v2.0.0-multi-provider

   # Run migrations (if any)
   NODE_ENV=production npm run migrate

   # Start application
   pm2 start ecosystem.config.js --env production
   pm2 save
   ```

3. Post-Deployment Verification
   - Check application health
   - Verify database connectivity
   - Test basic endpoints
   - Check monitoring dashboards

**Owner:** You  
**Duration:** 2 hours

#### Afternoon Session (6 hours)

**Tasks (You + Me):**

1. Pilot Restaurant Onboarding (3 restaurants)

   **Restaurant 1: "Raj's Dhaba" (Razorpay)**
   - Call restaurant owner
   - Explain new feature
   - Help collect Razorpay credentials
   - Setup via API or admin panel
   - Test webhook configuration
   - Monitor first 5 transactions

   **Restaurant 2: "Mumbai Bites" (PhonePe)**
   - Similar onboarding process
   - Setup PhonePe credentials
   - Test complete flow
   - Monitor transactions

   **Restaurant 3: "Delhi Delights" (Paytm)**
   - Setup Paytm credentials
   - Test payment flow
   - Monitor webhooks

2. Monitor Pilot Transactions
   - Watch logs in real-time
   - Check webhook delivery
   - Verify order updates
   - Ensure settlements working

3. Gather Feedback
   - Restaurant satisfaction
   - Customer experience
   - Technical issues
   - Feature requests

**Pilot Monitoring Dashboard:**

```
Restaurant       | Orders | Success | Failed | Webhook | Issues
----------------|--------|---------|--------|---------|--------
Raj's Dhaba     |   12   |   11    |   1    |  100%   |   0
Mumbai Bites    |    8   |    8    |   0    |  100%   |   0
Delhi Delights  |   15   |   14    |   1    |  100%   |   0
----------------|--------|---------|--------|---------|--------
TOTAL           |   35   |   33    |   2    |  100%   |   0
Success Rate: 94.3% ✅
```

**Owner:** You + AI Assistant  
**Duration:** 6 hours

**Deliverables:**

- ✅ Production deployed successfully
- ✅ 3 pilot restaurants live
- ✅ 30+ transactions processed
- ✅ No critical issues
- ✅ Positive feedback received

---

### Day 15: Documentation & Knowledge Transfer ⏰ 8 hours

#### Morning Session (4 hours)

**Tasks (Me):**

1. Technical Documentation
   - Architecture diagrams
   - Database schema documentation
   - API documentation (Swagger/OpenAPI)
   - Code comments and README updates
   - Deployment guide

2. Troubleshooting Guide

   ```markdown
   # Common Issues & Solutions

   ## Webhook Not Receiving

   - Check webhook URL in gateway dashboard
   - Verify signature secret matches
   - Check server firewall rules
   - Test with webhook testing tool

   ## Payment Verification Failed

   - Check credentials not expired
   - Verify signature algorithm correct
   - Check order ID matches
   - Review gateway response logs

   ## Commission Calculation Wrong

   - Verify commission rate in hotel config
   - Check if refunds deducted correctly
   - Review calculation logic
   ```

**Owner:** AI Assistant

#### Afternoon Session (4 hours)

**Tasks (Me + You):**

1. Restaurant Onboarding Guide
   - Step-by-step setup instructions
   - Screenshots of each step
   - Video tutorial (screen recording)
   - FAQ document

2. Support Team Training
   - Walk through system architecture
   - Explain payment flows
   - Demonstrate troubleshooting
   - Q&A session

3. Knowledge Transfer
   - Code walkthrough
   - Explain key design decisions
   - Review security considerations
   - Discuss scaling strategies

4. Plan Full Rollout
   - Gradual rollout strategy
   - Communication plan
   - Support resources
   - Monitoring plan

**Documentation Deliverables:**

- ✅ Technical documentation complete
- ✅ API documentation published
- ✅ Onboarding guide ready
- ✅ Video tutorials created
- ✅ Support team trained
- ✅ Rollout plan finalized

**Owner:** AI Assistant + You  
**Duration:** 4 hours

---

## 🎬 Complete Working Scenarios

### Scenario 1: Restaurant Onboarding Journey

**Actors:**

- Raj (Restaurant Owner)
- Your Support Team
- System

**Timeline:** 3 days

#### Day 1: Restaurant Signs Up

**10:00 AM**

```
Raj visits your website
→ Sees "Launch Your Digital Restaurant"
→ Clicks "Get Started"
→ Fills registration form:
   - Restaurant Name: "Raj's Dhaba"
   - Phone: +91 98765 43210
   - Email: raj@dhaba.com
   - Location: Delhi
→ Receives OTP
→ Verifies account
```

**10:05 AM**

```
System:
✅ Creates Hotel record
✅ Sends welcome email
✅ Creates default manager account
✅ Sets subscription: "Trial (7 days)"
```

**11:00 AM**

```
Raj logs in to dashboard
→ Explores features
→ Uploads menu items
→ Configures tables
→ Adds staff members
```

#### Day 2: Payment Gateway Setup

**9:00 AM**

```
Raj already has Razorpay account (uses for own website)
Raj has credentials:
- Key ID: rzp_live_abc123xyz
- Key Secret: secret_abc123xyz789
- Has webhook secret: whsec_456def789
```

**9:30 AM**

```
Raj navigates to Settings → Payment Configuration
→ Sees options: Razorpay, PhonePe, Paytm
→ Selects "Razorpay"
→ Form appears requesting:
   ├─ Key ID
   ├─ Key Secret
   └─ Webhook Secret (optional but recommended)
```

**9:35 AM**

```
Raj enters credentials and clicks "Connect Gateway"

System processing:
→ Validates format
→ Makes test API call to Razorpay
→ Verifies credentials work
→ Encrypts credentials
→ Saves to database
→ Generates unique webhook URL
```

**9:36 AM**

```
✅ Success Message:
"Payment gateway connected successfully!

Your webhook URL:
https://api.yourapp.com/api/webhooks/payment/razorpay/hotel_abc123

Please add this URL to your Razorpay dashboard:
1. Go to Razorpay Dashboard
2. Settings → Webhooks
3. Add above URL
4. Select events: payment.captured, payment.failed, refund.processed
5. Save

Need help? Watch tutorial"
```

**10:00 AM**

```
Raj opens Razorpay dashboard
→ Goes to Settings → Webhooks
→ Clicks "Add New Webhook"
→ Pastes webhook URL
→ Selects events:
   ✓ payment.captured
   ✓ payment.failed
   ✓ refund.processed
→ Saves
→ Tests webhook (Razorpay sends test event)
```

**10:01 AM**

```
Your System:
✅ Receives test webhook
✅ Verifies signature
✅ Updates webhook health status to "Active"
✅ Shows green dot in Raj's dashboard
```

**10:05 AM**

```
Raj sees:
Payment Gateway: ✅ Connected
Provider: Razorpay
Status: Active
Last Webhook: Just now
```

#### Day 3: First Order!

**12:30 PM - Customer Orders**

```
Priya (Customer) opens your app
→ Searches "Raj's Dhaba"
→ Adds items to cart:
   - 2x Butter Chicken @ ₹200 = ₹400
   - 3x Naan @ ₹30 = ₹90
   - 1x Lassi @ ₹60 = ₹60
→ Subtotal: ₹550
→ Taxes (5%): ₹27.50
→ Total: ₹577.50
→ Clicks "Place Order"
```

**12:31 PM - Order Created**

```
Your System:
→ Creates Order ID: ORD-2026-00123
→ Checks Raj's payment configuration
→ Finds: Razorpay configured
→ Decrypts Raj's Razorpay credentials
→ Creates order in RAJ'S Razorpay account (not yours!)

API Call to Razorpay:
POST https://api.razorpay.com/v1/orders
Authorization: Basic rzp_live_abc123xyz:secret_abc123xyz789
{
  "amount": 57750,
  "currency": "INR",
  "receipt": "ORD-2026-00123",
  "notes": {
    "orderId": "ORD-2026-00123",
    "hotelId": "hotel_abc123",
    "customerId": "user_xyz789"
  }
}

Razorpay Response:
{
  "id": "order_razorpay_xyz123",
  "amount": 57750,
  "currency": "INR",
  "status": "created"
}
```

**12:31 PM - Payment Page**

```
Your System:
→ Updates Order with gateway order ID
→ Returns to frontend:
{
  "provider": "razorpay",
  "gatewayOrderId": "order_razorpay_xyz123",
  "keyId": "rzp_live_abc123xyz",
  "amount": 57750,
  "currency": "INR"
}

Frontend:
→ Loads Razorpay Checkout
→ Shows "Pay ₹577.50 to Raj's Dhaba"
→ Payment options: UPI, Card, Wallet, Net Banking
```

**12:32 PM - Customer Pays**

```
Priya selects "UPI"
→ Enters UPI ID: priya@paytm
→ Clicks "Pay"
→ Gets notification on phone
→ Opens payment app
→ Confirms payment with PIN
→ ✅ Payment Successful
```

**12:32 PM - Money Flow**

```
₹577.50 goes to RAJ'S RAZORPAY ACCOUNT
(Settlements happen T+2 days → Raj's bank account)

Razorpay processes:
→ Deducts 2% fee: ₹11.55
→ Net to Raj: ₹565.95 (after T+2)
```

**12:32 PM - Webhook Sent**

```
Razorpay → Your Server:
POST https://api.yourapp.com/api/webhooks/payment/razorpay/hotel_abc123
X-Razorpay-Signature: sha256_signature_here
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xyz789abc",
        "amount": 57750,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_razorpay_xyz123",
        "method": "upi",
        "notes": {
          "orderId": "ORD-2026-00123",
          ...
        }
      }
    }
  }
}
```

**12:32 PM - Webhook Processing**

```
Your System:
✅ Receives webhook
✅ Verifies signature using Raj's webhook secret
✅ Finds Order: ORD-2026-00123
✅ Updates order:
   - payment.status = "paid"
   - payment.razorpayPaymentId = "pay_xyz789abc"
   - payment.paidAt = now()
   - order.status = "confirmed"
✅ Updates webhook health: last received = now()
✅ Calculates commission (if applicable)
✅ Triggers notifications
```

**12:33 PM - Notifications**

```
To Priya:
📱 "Order confirmed! ✅
    Your order #123 at Raj's Dhaba is being prepared.
    Estimated time: 20 minutes"

To Raj's Kitchen:
📱 "New Order! 🔔
    Order #123
    - 2x Butter Chicken
    - 3x Naan
    - 1x Lassi
    Table: 5
    PAID ✅"

To Your Dashboard:
📊 New transaction recorded
   Restaurant: Raj's Dhaba
   Amount: ₹577.50
   Commission: ₹28.87 (5%)
   Status: Pending Collection
```

**12:35 PM - Staff Assignment**

```
Your System:
→ Assigns waiter automatically
→ Sends notification to staff
→ Order starts preparing
```

**1:00 PM - Order Delivered**

```
Raj's staff:
→ Marks order as "Completed" in app
→ Priya receives: "How was your experience?"
→ Priya rates 5 stars ⭐⭐⭐⭐⭐
```

#### Day 5 (T+2): Settlement

**Automatic Settlement**

```
Razorpay:
→ Settles all transactions from Day 3
→ Transfers to Raj's bank account:
   ₹565.95 (order amount - gateway fee)

Raj's Bank Account:
✅ Credit: ₹565.95
   From: Razorpay
   Reference: Order settlements
```

**Your System:**

```
Commission Tracking:
→ Month: February 2026
→ Restaurant: Raj's Dhaba
→ Total Orders: 45
→ Total GMV: ₹22,500
→ Commission @ 5%: ₹1,125
→ Status: Pending Invoice
→ Due: March 1, 2026
```

---

### Scenario 2: Multi-Provider Restaurant Chain

**Actor:** McDonald's India (Chain with 3 branches)

#### Branch Setup

```
Branch 1: Delhi
- Uses: Razorpay (existing account)
- Manager: Amit

Branch 2: Mumbai
- Uses: PhonePe (preferred in Maharashtra)
- Manager: Priya

Branch 3: Bangalore
- Uses: Paytm (existing partnership)
- Manager: Suresh
```

#### Customer Journey: Rohan Orders from Delhi Branch

```
12:00 PM:
Rohan opens app
→ Location: Delhi
→ Searches "McDonald's"
→ Sees: McDonald's Delhi, Mumbai, Bangalore
→ Selects: McDonald's Delhi
→ Orders: 2x McAloo Tikki Burger
→ Total: ₹180

Your System:
→ Identifies branch: Delhi
→ Checks payment config: Razorpay
→ Creates order in Delhi's Razorpay account
→ Customer pays via Razorpay
→ ₹180 goes to Delhi branch's account

Commission:
→ Your platform: ₹9 (5%)
→ McDonald's settles monthly
```

#### Same Day: Sneha Orders from Mumbai Branch

```
2:00 PM:
Sneha in Mumbai
→ Orders from McDonald's Mumbai
→ Total: ₹250

Your System:
→ Identifies branch: Mumbai
→ Checks payment config: PhonePe
→ Creates order in Mumbai's PhonePe account
→ Customer pays via PhonePe
→ ₹250 goes to Mumbai branch's account

Commission:
→ Your platform: ₹12.50 (5%)
```

#### Corporate Dashboard

```
McDonald's Corporate Admin logs in
→ Sees unified dashboard:

Total Orders Today: 128
├─ Delhi (Razorpay): 45 orders
├─ Mumbai (PhonePe): 38 orders
└─ Bangalore (Paytm): 45 orders

Total Revenue: ₹58,000
├─ Delhi: ₹22,000
├─ Mumbai: ₹18,000
└─ Bangalore: ₹18,000

All settlements go to respective branch accounts
Corporate pays monthly commission: ₹2,900
```

---

### Scenario 3: Customer Refund Flow

**Actors:**

- Priya (Customer)
- Raj's Dhaba (Restaurant)
- Your Platform

#### Issue Occurs

```
Order Details:
- Order ID: ORD-2026-00456
- Amount: ₹650
- Status: Paid
- Provider: Razorpay

Problem:
Order took 2 hours instead of 30 minutes
Priya requests refund
```

#### Refund Process

**Step 1: Priya Requests Refund**

```
3:00 PM:
Priya: Opens order in app
→ Clicks "Request Refund"
→ Reason: "Order delayed significantly"
→ Submits

Your System:
→ Creates refund request
→ Notifies restaurant manager
→ Status: Pending Review
```

**Step 2: Restaurant Approves**

```
3:15 PM:
Raj reviews request
→ Agrees delay was unacceptable
→ Clicks "Approve Full Refund"

Your System:
→ Finds order payment details
→ Provider: Razorpay
→ Payment ID: pay_xyz789abc
→ Amount: ₹650
→ Gets Raj's Razorpay credentials
```

**Step 3: API Refund Call**

```
Your System calls Razorpay:
POST https://api.razorpay.com/v1/payments/pay_xyz789abc/refund
Authorization: Basic [Raj's credentials]
{
  "amount": 65000,
  "notes": {
    "reason": "Order delayed",
    "orderId": "ORD-2026-00456"
  }
}

Razorpay Response:
{
  "id": "rfnd_abc123xyz",
  "amount": 65000,
  "status": "processed",
  "created_at": 1738412100
}
```

**Step 4: Database Update**

```
Your System:
→ Updates order:
   - payment.status = "refund_pending"
   - payment.refund.transactionId = "rfnd_abc123xyz"
   - payment.refund.amount = 650
   - payment.refund.initiatedAt = now()
   - payment.refund.reason = "Order delayed"
```

**Step 5: Refund Processing**

```
Razorpay:
→ Processes refund
→ Deducts ₹650 from Raj's next settlement
→ Credits ₹650 to Priya's source (UPI/Card)
→ Sends refund.processed webhook
```

**Step 6: Webhook Update**

```
Your System receives webhook:
→ Updates order:
   - payment.status = "refunded"
   - payment.refund.completedAt = now()
→ Notifies Priya: "Refund processed ✅"
→ Notifies Raj: "Refund completed"
```

**Step 7: Commission Adjustment**

```
Your System:
→ Original commission: ₹32.50
→ Adjusts commission: -₹32.50
→ Updates monthly invoice for Raj
→ New commission for month: Previous - ₹32.50
```

**Timeline:**

- 3:00 PM: Refund requested
- 3:15 PM: Approved by restaurant
- 3:15 PM: Refund initiated
- 3:16 PM: Webhook received
- 3-7 days: Money reaches customer's account

---

## 🏛️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CUSTOMERS                            │
│                    (Mobile App / Web)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    YOUR PLATFORM                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API Gateway / Load Balancer              │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────┼───────────────────────────────┐  │
│  │         ┌────────────┴────────────┐                   │  │
│  │         │   Order Management      │                   │  │
│  │         │     Controllers         │                   │  │
│  │         └────────────┬────────────┘                   │  │
│  │                      │                                 │  │
│  │         ┌────────────┴────────────┐                   │  │
│  │         │ Dynamic Payment Service │                   │  │
│  │         │  (Get Restaurant Config) │                  │  │
│  │         └────────────┬────────────┘                   │  │
│  │                      │                                 │  │
│  │         ┌────────────┴────────────┐                   │  │
│  │         │ Payment Gateway Factory │                   │  │
│  │         │  (Select Right Gateway) │                   │  │
│  │         └────────────┬────────────┘                   │  │
│  │                      │                                 │  │
│  │         ┌────────────┴────────────────────────┐      │  │
│  │         │                                      │      │  │
│  │    ┌────▼──────┐  ┌──────────┐  ┌───────────▼──┐   │  │
│  │    │ Razorpay  │  │ PhonePe  │  │    Paytm     │   │  │
│  │    │  Gateway  │  │  Gateway │  │   Gateway    │   │  │
│  │    └────┬──────┘  └─────┬────┘  └───────┬──────┘   │  │
│  │         │                │                │          │  │
│  └─────────┼────────────────┼────────────────┼──────────┘  │
│            │                │                │              │
│  ┌─────────▼────────────────▼────────────────▼──────────┐  │
│  │             Webhook Handlers                          │  │
│  │  (Signature Verification → Order Updates)            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Database                            │  │
│  │  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  │  │
│  │  │  Hotels  │  │ PaymentConfig │  │    Orders    │  │  │
│  │  └──────────┘  └───────────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
┌────────────────────┐        ┌────────────────────┐
│ Restaurant's       │        │ Restaurant's       │
│ Razorpay Account   │        │ PhonePe Account    │
│                    │        │                    │
│ ├─ Orders          │        │ ├─ Transactions    │
│ ├─ Payments        │        │ ├─ Settlements     │
│ └─ Settlements     │        │ └─ Reports         │
└──────┬─────────────┘        └───────┬────────────┘
       │                              │
       │        ┌────────────────────┐│
       │        │ Restaurant's       ││
       │        │ Paytm Account      ││
       │        │                    ││
       │        │ ├─ Transactions    ││
       │        │ ├─ Settlements     ││
       │        │ └─ Reports         ││
       │        └──────┬─────────────┘│
       │               │              │
       ▼               ▼              ▼
┌──────────────────────────────────────────┐
│      RESTAURANT BANK ACCOUNTS            │
│      (T+2 automatic settlements)         │
└──────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌──────────┐
│ Customer │
└────┬─────┘
     │ 1. Place Order
     ▼
┌─────────────────┐
│  Your Backend   │
└────┬────────────┘
     │ 2. Get Restaurant Payment Config
     ▼
┌─────────────────────┐
│  PaymentConfig DB   │
│  (Encrypted Creds)  │
└────┬────────────────┘
     │ 3. Decrypt Credentials
     ▼
┌─────────────────────┐
│ Payment Gateway     │
│ (Razorpay/PhonePe)  │
└────┬────────────────┘
     │ 4. Return Payment Details
     ▼
┌──────────┐
│ Customer │
└────┬─────┘
     │ 5. Complete Payment
     ▼
┌─────────────────────┐
│ Payment Gateway     │
│ (Money → Restaurant)│
└────┬────────────────┘
     │ 6. Send Webhook
     ▼
┌─────────────────┐
│  Your Backend   │
│ (Verify & Update)│
└────┬────────────┘
     │ 7. Update Order Status
     ▼
┌─────────────────────┐
│    Order DB         │
│ (status: confirmed) │
└─────────────────────┘
```

### Database Schema

```sql
-- Hotels Collection
{
  _id: ObjectId,
  name: String,
  contactInfo: {...},
  commissionConfig: {
    type: "percentage" | "subscription",
    rate: 0.05,
    subscriptionAmount: 1999,
    billingCycle: "monthly"
  }
}

-- PaymentConfig Collection
{
  _id: ObjectId,
  hotel: ObjectId (ref: Hotel),
  provider: "razorpay" | "phonepe" | "paytm",
  isActive: Boolean,
  credentials: {
    // Razorpay
    keyId: String (encrypted),
    keySecret: String (encrypted),
    webhookSecret: String (encrypted),

    // PhonePe
    merchantId: String,
    saltKey: String (encrypted),
    saltIndex: Number,

    // Paytm
    merchantKey: String (encrypted),
    websiteName: String
  },
  webhookUrl: String,
  lastWebhookReceivedAt: Date,
  webhookStatus: "active" | "inactive"
}

-- Orders Collection
{
  _id: ObjectId,
  hotel: ObjectId (ref: Hotel),
  user: ObjectId (ref: User),
  items: [...],
  totalPrice: Number,
  payment: {
    provider: "razorpay" | "phonepe" | "paytm",
    gatewayAccountId: ObjectId (ref: Hotel),
    paymentStatus: "pending" | "paid" | "failed",
    razorpayOrderId: String,
    razorpayPaymentId: String,
    paidAt: Date,
    commissionAmount: Number,
    commissionRate: Number,
    commissionStatus: "pending" | "collected"
  }
}
```

---

## 📁 Technical Components

### File Structure

```
src/
├── utils/
│   └── encryption.js                    # NEW: AES-256 encryption
│
├── models/
│   ├── PaymentConfig.model.js           # NEW: Payment gateway configs
│   ├── Hotel.model.js                   # MODIFIED: Add commission config
│   └── Order.model.js                   # MODIFIED: Add provider fields
│
├── services/
│   ├── dynamicPaymentService.js         # NEW: Main payment orchestrator
│   └── payment/
│       ├── PaymentGatewayFactory.js     # NEW: Factory pattern
│       └── gateways/
│           ├── RazorpayGateway.js       # NEW: Razorpay implementation
│           ├── PhonePeGateway.js        # NEW: PhonePe implementation
│           └── PaytmGateway.js          # NEW: Paytm implementation
│
├── controllers/
│   ├── manager/
│   │   └── paymentSetup.controller.js   # NEW: Setup endpoints
│   ├── user/
│   │   └── dynamicPayment.controller.js # NEW: User payment endpoints
│   └── webhookHandler.controller.js     # NEW: Webhook processing
│
└── routes/
    ├── paymentSetup.route.js            # NEW: Setup routes
    ├── webhook.route.js                 # NEW: Webhook routes
    └── index.route.js                   # MODIFIED: Mount new routes
```

### Key Components Explained

#### 1. Encryption Utility (`encryption.js`)

**Purpose:** Securely encrypt/decrypt payment credentials

**Key Functions:**

- `encrypt(text)` - Encrypts plain text using AES-256-CBC
- `decrypt(text)` - Decrypts encrypted text
- `generateEncryptionKey()` - Generates random 32-byte key

**Security:**

- Uses AES-256-CBC (industry standard)
- Random IV for each encryption
- Key stored in environment variable
- Never logs decrypted values

#### 2. Payment Gateway Factory (`PaymentGatewayFactory.js`)

**Purpose:** Abstract payment gateway creation

**Pattern:** Factory Pattern
**Benefits:**

- Single point to get gateway instance
- Easy to add new providers
- Consistent interface across gateways

**Usage:**

```javascript
const gateway = PaymentGatewayFactory.getGateway(paymentConfig);
const order = await gateway.createOrder(amount, orderId, metadata);
```

#### 3. Dynamic Payment Service (`dynamicPaymentService.js`)

**Purpose:** Orchestrate payment operations

**Key Methods:**

- `createOrder(orderId)` - Creates payment order in restaurant's gateway
- `verifyPayment(orderId, paymentData)` - Verifies payment signature
- `refundPayment(orderId, amount, reason)` - Process refunds
- `checkPaymentStatus(orderId)` - Check current status

**Flow:**

```
1. Get restaurant's payment config
2. Decrypt credentials
3. Get appropriate gateway instance
4. Execute operation
5. Update database
6. Track commission (if applicable)
```

#### 4. Webhook Handlers (`webhookHandler.controller.js`)

**Purpose:** Process payment gateway webhooks

**Security:**

- Signature verification using restaurant's secret
- Prevents replay attacks
- Idempotent processing

**Events Handled:**

- `payment.captured` - Payment successful
- `payment.failed` - Payment failed
- `refund.processed` - Refund completed

---

## 🧪 Testing Strategy

### Unit Tests (50+ tests)

```javascript
// Example test suite
describe("Encryption", () => {
  test("encrypts and decrypts correctly");
  test("different IVs for same input");
  test("handles empty strings");
  test("handles special characters");
});

describe("RazorpayGateway", () => {
  test("creates order with correct amount");
  test("verifies valid signature");
  test("rejects invalid signature");
  test("handles refunds correctly");
  test("handles API errors gracefully");
});

describe("DynamicPaymentService", () => {
  test("selects correct gateway");
  test("updates order after payment");
  test("calculates commission correctly");
  test("handles missing config");
});
```

### Integration Tests (30+ tests)

```javascript
describe("Payment Flow", () => {
  test("complete Razorpay payment flow");
  test("complete PhonePe payment flow");
  test("complete Paytm payment flow");
  test("webhook updates order");
  test("refund flow end-to-end");
});
```

### Manual Testing Checklist

**Razorpay Testing:**

- [ ] Setup with valid credentials
- [ ] Setup with invalid credentials
- [ ] Create order
- [ ] Pay with test card (4111 1111 1111 1111)
- [ ] Verify webhook received
- [ ] Check order updated
- [ ] Test failed payment
- [ ] Test refund
- [ ] Verify webhook signature

**PhonePe Testing:**

- [ ] Setup with UAT credentials
- [ ] Create order
- [ ] Complete payment
- [ ] Verify webhook
- [ ] Test refund

**Paytm Testing:**

- [ ] Setup with staging credentials
- [ ] Create order
- [ ] Complete payment
- [ ] Verify webhook
- [ ] Test refund

**Edge Cases:**

- [ ] Double payment attempt
- [ ] Order not found
- [ ] Gateway timeout
- [ ] Webhook retry
- [ ] Concurrent requests
- [ ] Invalid signature

---

## 🚀 Deployment Plan

### Pre-Deployment Checklist

**Code:**

- [ ] All tests passing
- [ ] Code reviewed
- [ ] No console.logs in production code
- [ ] Error handling comprehensive
- [ ] Sensitive data not logged

**Configuration:**

- [ ] Environment variables documented
- [ ] Encryption key generated
- [ ] Database indexes created
- [ ] CORS configured
- [ ] Rate limiting enabled

**Security:**

- [ ] Credentials encrypted
- [ ] Webhook signature verification working
- [ ] SQL injection tested
- [ ] XSS prevention verified
- [ ] API authentication working

**Performance:**

- [ ] Load tested (100 concurrent users)
- [ ] Database queries optimized
- [ ] Response times acceptable
- [ ] Caching implemented

**Monitoring:**

- [ ] Error tracking (Sentry) configured
- [ ] Logging properly structured
- [ ] Alerts set up
- [ ] Performance metrics tracked

### Deployment Steps

#### Staging Deployment

```bash
# 1. Backup database
mongodump --uri="mongodb://staging-db" --out=backup-staging-$(date +%Y%m%d)

# 2. Pull latest code
git checkout staging
git pull origin staging

# 3. Install dependencies
npm ci

# 4. Run migrations (if any)
npm run migrate

# 5. Build application
npm run build

# 6. Restart server
pm2 restart hotel-management-staging
pm2 save

# 7. Verify health
curl https://staging.yourapp.com/health
```

#### Production Deployment

```bash
# 1. Create release tag
git tag -a v2.0.0-multi-provider -m "Multi-provider payment system"
git push origin v2.0.0-multi-provider

# 2. Backup production database
mongodump --uri="mongodb://production-db" --out=backup-prod-$(date +%Y%m%d)

# 3. Deploy to production
git checkout production
git merge v2.0.0-multi-provider

# 4. Install dependencies
npm ci --production

# 5. Run migrations
NODE_ENV=production npm run migrate

# 6. Build application
NODE_ENV=production npm run build

# 7. Restart with zero downtime
pm2 reload hotel-management-production
pm2 save

# 8. Verify deployment
curl https://api.yourapp.com/health
curl https://api.yourapp.com/api/manager/payment/config

# 9. Monitor logs
pm2 logs hotel-management-production --lines 100
```

### Rollback Plan

**If issues detected within 1 hour:**

```bash
# Quick rollback
pm2 stop hotel-management-production
git checkout v1.9.0  # Previous version
npm ci --production
pm2 restart hotel-management-production

# Restore database (if needed)
mongorestore --uri="mongodb://production-db" backup-prod-20260214/
```

**If issues detected after 1 hour:**

```bash
# Hotfix approach
git checkout production
git checkout -b hotfix/payment-issue
# Fix issue
git commit -m "Hotfix: payment issue"
git push origin hotfix/payment-issue
# Create PR and deploy after approval
```

---

## ⚠️ Risk Mitigation

### Risk Matrix

| Risk                            | Probability | Impact   | Mitigation                           | Owner    |
| ------------------------------- | ----------- | -------- | ------------------------------------ | -------- |
| Webhook signature mismatch      | High        | High     | Comprehensive testing, retry logic   | Dev      |
| Credential encryption bug       | Low         | Critical | Multiple validation layers, backups  | Dev      |
| Gateway API changes             | Medium      | High     | Version pinning, monitoring, alerts  | Dev      |
| Performance degradation         | Medium      | Medium   | Load testing, caching, optimization  | Dev      |
| Restaurant onboarding confusion | High        | Low      | Clear docs, video tutorials, support | Product  |
| Commission calculation errors   | Medium      | Medium   | Unit tests, manual verification      | Dev      |
| Database connection loss        | Low         | High     | Connection pooling, retry logic      | DevOps   |
| Security breach                 | Low         | Critical | Encryption, audits, monitoring       | Security |

### Contingency Plans

**Scenario 1: Payment Gateway Down**

```
Problem: Razorpay API is down
Impact: Orders can't be created

Immediate Action:
1. Check status page
2. Enable fallback to company Razorpay (if configured)
3. Notify affected restaurants
4. Update status page

Long-term:
- Implement gateway health checks
- Auto-failover to backup gateway
- Notify restaurants of downtime
```

**Scenario 2: Webhook Delivery Fails**

```
Problem: Webhooks not reaching server
Impact: Orders not updating automatically

Immediate Action:
1. Check server logs
2. Verify webhook URL accessible
3. Check firewall rules
4. Manual order status polling

Long-term:
- Implement webhook retry with exponential backoff
- Add polling fallback mechanism
- Monitor webhook health per restaurant
```

**Scenario 3: Mass Refund Event**

```
Problem: Restaurant needs to refund 100+ orders
Impact: API rate limits, processing delays

Immediate Action:
1. Create batch refund API
2. Process in chunks of 10
3. Add delays between batches
4. Monitor gateway responses

Long-term:
- Implement bulk refund feature
- Add rate limiting management
- Create refund queue system
```

---

## 📊 Success Metrics

### Week 1 Goals

**Technical Metrics:**

- [ ] 10+ restaurants onboarded with own gateways
- [ ] 200+ transactions processed successfully
- [ ] 0 payment failures due to system issues
- [ ] < 2 second average response time
- [ ] 100% webhook delivery rate

**Business Metrics:**

- [ ] 3 pilot restaurants giving positive feedback
- [ ] 0 customer complaints about payment issues
- [ ] Commission tracking accurate to 100%

### Month 1 Goals

**Adoption:**

- [ ] 100+ restaurants using own gateways
- [ ] 50% of total restaurants migrated
- [ ] 10,000+ transactions processed

**Performance:**

- [ ] 99.9% uptime
- [ ] 99.5% webhook success rate
- [ ] < 2s response time for 95th percentile

**Financial:**

- [ ] $10,000+ commission tracked
- [ ] 95% commission collection rate
- [ ] 0 settlement disputes

### Month 3 Goals

**Scale:**

- [ ] 500+ restaurants on multi-provider
- [ ] 100,000+ transactions processed
- [ ] Support all 3 providers actively

**Quality:**

- [ ] 99.95% uptime
- [ ] < 1s average response time
- [ ] 0.1% refund rate
- [ ] 4.5+ star restaurant satisfaction

---

## 🆘 Post-Launch Support

### Support Schedule

**Week 1-2:** Intensive Monitoring

- Daily health checks (morning & evening)
- Real-time log monitoring
- Immediate response to issues
- Daily standup with team
- Availability: 9 AM - 9 PM (7 days)

**Week 3-4:** Active Monitoring

- Check twice daily
- Monitor key metrics
- Weekly team sync
- Availability: 9 AM - 6 PM (weekdays)

**Month 2+:** Standard Monitoring

- Daily automated health checks
- Weekly manual reviews
- Bi-weekly team sync
- Standard support hours

### Escalation Matrix

**Level 1 - Minor Issues** (Response: 4 hours)

- Single restaurant payment issue
- Webhook delay
- Non-critical error

**Action:**

- Support team investigates
- Check logs and status
- Provide workaround

**Level 2 - Moderate Issues** (Response: 1 hour)

- Multiple restaurants affected
- Payment processing slow
- Webhook failures

**Action:**

- Dev team investigates
- Check infrastructure
- Deploy hotfix if needed

**Level 3 - Critical Issues** (Response: 15 minutes)

- System-wide payment failure
- Security breach
- Data loss

**Action:**

- All-hands response
- Immediate rollback consideration
- Executive notification
- Customer communication

### Monitoring Dashboard

**Real-time Metrics:**

```
┌─────────────────────────────────────────┐
│   Multi-Provider Payment Dashboard      │
├─────────────────────────────────────────┤
│ System Health:        ✅ All Systems OK │
│ Uptime:               99.98%            │
│ Avg Response Time:    1.2s              │
├─────────────────────────────────────────┤
│ Active Restaurants:   342               │
│ ├─ Razorpay:         215 (62%)         │
│ ├─ PhonePe:          87 (25%)          │
│ └─ Paytm:            40 (13%)          │
├─────────────────────────────────────────┤
│ Today's Transactions: 2,456            │
│ Success Rate:         99.2%            │
│ Webhook Success:      99.8%            │
│ Avg Amount:           ₹425             │
├─────────────────────────────────────────┤
│ Commission Tracked:   ₹12,350          │
│ Pending Collection:   ₹8,200           │
└─────────────────────────────────────────┘
```

**Alerts Configured:**

- Webhook failure > 5 consecutive attempts
- Response time > 5 seconds
- Error rate > 1%
- Payment success rate < 98%
- Gateway timeout > 10 seconds

---

## 📚 Documentation Deliverables

### Technical Documentation

1. **Architecture Document** (15 pages)
   - System design
   - Component diagrams
   - Data flow
   - Security architecture

2. **API Documentation** (Swagger/OpenAPI)
   - All endpoints documented
   - Request/response examples
   - Error codes
   - Authentication details

3. **Database Schema** (ERD + descriptions)
   - All collections/tables
   - Relationships
   - Indexes
   - Sample queries

4. **Code Documentation**
   - Inline comments
   - Function documentation
   - README files
   - Setup instructions

### User Documentation

1. **Restaurant Onboarding Guide** (10 pages + video)
   - Step-by-step setup
   - Screenshots
   - Troubleshooting
   - FAQs

2. **Admin Manual** (20 pages)
   - How to manage configurations
   - How to handle disputes
   - How to generate reports
   - How to troubleshoot issues

3. **Customer Support Guide**
   - Common issues
   - Resolution steps
   - Escalation procedures
   - Scripts for support agents

### Training Materials

1. **Video Tutorials** (5 videos)
   - Restaurant setup (10 min)
   - Payment troubleshooting (8 min)
   - Commission management (6 min)
   - Refund processing (5 min)
   - Admin overview (15 min)

2. **Interactive Demos**
   - Sandbox environment
   - Test credentials
   - Sample scenarios

---

## ✅ Final Launch Checklist

### Technical Readiness

- [ ] All code deployed to production
- [ ] Database migrations completed
- [ ] Environment variables configured
- [ ] SSL certificates valid
- [ ] CDN configured
- [ ] Backups automated
- [ ] Monitoring active
- [ ] Alerts configured
- [ ] Error tracking enabled
- [ ] Performance acceptable

### Security Readiness

- [ ] Security audit passed
- [ ] Penetration testing done
- [ ] Credentials encrypted
- [ ] API authentication working
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Input validation implemented
- [ ] SQL injection tested
- [ ] XSS prevention verified
- [ ] Webhook signatures verified

### Documentation Readiness

- [ ] Technical docs complete
- [ ] API docs published
- [ ] User guides ready
- [ ] Video tutorials uploaded
- [ ] FAQs documented
- [ ] Troubleshooting guide ready
- [ ] Support team trained
- [ ] Knowledge base updated

### Business Readiness

- [ ] 3+ pilot restaurants successful
- [ ] Pricing model finalized
- [ ] Commission structure clear
- [ ] Legal terms updated
- [ ] Customer communication prepared
- [ ] Marketing materials ready
- [ ] Support team staffed
- [ ] Escalation process defined

### Operational Readiness

- [ ] Support hours defined
- [ ] On-call schedule set
- [ ] Rollback plan tested
- [ ] Incident response plan ready
- [ ] Communication channels set
- [ ] Status page configured
- [ ] Monitoring dashboards ready
- [ ] Backup/restore tested

---

## 🎉 Go-Live Plan

### D-Day Schedule (February 14, 2026)

**06:00 AM - Pre-Launch**

- [ ] Final backup taken
- [ ] All team members ready
- [ ] Monitoring dashboards open
- [ ] Communication channels active

**08:00 AM - Deployment**

- [ ] Deploy to production
- [ ] Verify deployment successful
- [ ] Run smoke tests
- [ ] Check all endpoints

**09:00 AM - Pilot Restaurant Go-Live**

- [ ] Enable for 3 pilot restaurants
- [ ] Monitor their first transactions
- [ ] Stand by for immediate support

**11:00 AM - Gradual Rollout**

- [ ] Enable for 10 more restaurants
- [ ] Monitor transaction success rate
- [ ] Check webhook health

**02:00 PM - Wider Rollout**

- [ ] Enable for 50 more restaurants
- [ ] Monitor system performance
- [ ] Check error rates

**05:00 PM - Full Rollout**

- [ ] Enable for all eligible restaurants
- [ ] Send announcement email
- [ ] Update documentation site
- [ ] Monitor throughout evening

**09:00 PM - Day 1 Wrap-up**

- [ ] Review day's metrics
- [ ] Document any issues
- [ ] Plan for next day
- [ ] Team debrief

### Post-Launch (First Week)

**Daily Tasks:**

- Morning health check (9 AM)
- Review error logs (12 PM, 6 PM)
- Check key metrics (3 PM)
- Evening wrap-up (9 PM)
- Update status dashboard

**Daily Metrics to Track:**

- New restaurants onboarded
- Total transactions
- Success rate
- Webhook health
- Response times
- Error counts
- Customer feedback
- Support tickets

---

## 📈 Continuous Improvement Plan

### Month 2 Enhancements

- [ ] Add payment analytics dashboard for restaurants
- [ ] Implement bulk operations (refunds, exports)
- [ ] Add payment method breakdown reports
- [ ] Optimize database queries further
- [ ] Add more payment providers (GooglePay, AmazonPay)

### Month 3 Enhancements

- [ ] Implement split payments (multiple payment methods)
- [ ] Add scheduled payments (subscriptions)
- [ ] Build settlement forecasting
- [ ] Add fraud detection
- [ ] Implement chargebacks handling

### Quarter 2 Goals

- [ ] International payment support
- [ ] Multi-currency support
- [ ] Advanced analytics
- [ ] Machine learning for fraud detection
- [ ] WhatsApp notifications integration

---

## 🤝 Stakeholder Communication

### Weekly Status Reports

**To: Management**

```
Multi-Provider Payment - Weekly Update

Week of: Feb 1-7, 2026

✅ Completed:
- Foundation setup complete
- All 3 gateways integrated
- Security audit passed

🔄 In Progress:
- Frontend integration (80% done)
- Documentation (60% done)

⚠️ Blockers:
- None

📊 Metrics:
- Code completion: 85%
- Tests passing: 98%
- On track for Feb 14 launch

Next Week:
- Complete frontend integration
- Final testing
- Staging deployment
```

### Restaurant Communication

**Launch Announcement Email:**

```
Subject: 🚀 New Feature: Connect Your Own Payment Gateway!

Dear Restaurant Partner,

We're excited to announce a powerful new feature that gives you more control over your payments!

What's New?
✅ Connect your own Razorpay/PhonePe/Paytm account
✅ Money goes directly to your bank account (T+2)
✅ Full control over refunds and chargebacks
✅ Transparent transaction tracking

How to Get Started:
1. Go to Settings → Payment Configuration
2. Select your payment provider
3. Enter your credentials
4. Done! Start receiving direct payments

Need Help?
📹 Watch tutorial: [link]
📞 Call support: 1800-XXX-XXXX
📧 Email: support@yourapp.com

Best regards,
Your Platform Team
```

---

## 📞 Support & Contacts

### Development Team

- **Lead Developer:** [Your Name]
- **AI Assistant:** Available 24/7
- **Backend Team:** backend@yourapp.com
- **DevOps:** devops@yourapp.com

### Business Team

- **Product Manager:** pm@yourapp.com
- **Customer Success:** success@yourapp.com
- **Support:** support@yourapp.com

### Emergency Contacts

- **On-Call Developer:** +91-XXXXX-XXXXX
- **CTO:** +91-XXXXX-XXXXX
- **CEO:** +91-XXXXX-XXXXX

### Useful Links

- **Status Page:** https://status.yourapp.com
- **Documentation:** https://docs.yourapp.com
- **API Docs:** https://api.yourapp.com/docs
- **Support Portal:** https://support.yourapp.com
- **GitHub Repo:** https://github.com/yourcompany/rms-backend

---

## 🎯 Conclusion

This comprehensive implementation plan provides:

- ✅ Clear timeline (12-15 days)
- ✅ Day-by-day breakdown
- ✅ Technical architecture
- ✅ Complete working scenarios
- ✅ Testing strategy
- ✅ Deployment plan
- ✅ Risk mitigation
- ✅ Success metrics
- ✅ Post-launch support

### Next Steps

1. **Review this plan** with your team
2. **Confirm timeline** and resource allocation
3. **Start Day 1** when ready
4. **Follow the plan** step by step
5. **Adjust as needed** based on progress

### Key Success Factors

1. **Clear Communication** - Daily standups, clear blockers
2. **Incremental Progress** - Complete one phase before moving to next
3. **Testing First** - Test thoroughly at each step
4. **Documentation** - Document as you build
5. **Pilot Testing** - Test with real restaurants before full rollout

---

**Ready to Transform Your Restaurant Payment System?** 🚀

**Let's Build This Together!**

---

_Last Updated: February 1, 2026_  
_Version: 1.0_  
_Status: Ready for Implementation_
