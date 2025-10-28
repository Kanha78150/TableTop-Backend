# Super Admin Features & Subscription Plans Documentation

## Hotel Management System - TableTop Backend

---

## Table of Contents

1. [Super Admin Features Overview](#super-admin-features-overview)
2. [Implementation Timeline](#implementation-timeline)
3. [Subscription Plans & Features](#subscription-plans--features)
4. [Technical Architecture](#technical-architecture)
5. [Development Roadmap](#development-roadmap)
6. [Feature Access Control](#feature-access-control)

---

## Super Admin Features Overview

### 1. System-Wide Administration

- **Multi-Hotel Chain Management**: Control multiple hotel brands and properties across different locations
- **System Configuration**: Manage global settings, payment gateways, and platform configurations
- **Database Management**: Backup, restore, and maintenance operations
- **Server Health Monitoring**: Real-time system performance, uptime monitoring, and error tracking
- **API Management**: Monitor API usage, rate limits, and third-party integrations

### 2. Advanced User & Role Management

- **Admin Hierarchy Control**: Create, modify, and delete admin accounts with granular permissions
- **Role-Based Access Control (RBAC)**: Define custom roles and permission sets
- **Multi-Factor Authentication Enforcement**: Mandate 2FA for all admin levels
- **Session Management**: Force logout, monitor active sessions, and set session policies
- **Audit Trail**: Complete activity logs for all admin actions across the system

### 3. Financial & Accounting Oversight

- **Revenue Analytics**: Cross-hotel revenue analysis, profit margins, and financial forecasting
- **Transaction Monitoring**: Real-time payment monitoring, fraud detection, and dispute management
- **Coin Economy Management**: Global coin settings, exchange rates, and reward program control
- **Tax Management**: Configure tax rates, generate tax reports, and compliance monitoring
- **Expense Tracking**: Monitor operational costs, staff payments, and vendor expenses

### 4. Operational Intelligence

- **Real-time Dashboard**: System-wide KPIs, alerts, and performance metrics
- **Predictive Analytics**: Demand forecasting, inventory optimization, and staff scheduling
- **Quality Control**: Mystery shopper reports, review analysis, and service quality metrics
- **Supply Chain Management**: Vendor management, procurement, and inventory across locations
- **Compliance Monitoring**: Health department compliance, safety regulations, and certification tracking

### 5. Advanced Security & Privacy

- **Data Privacy Controls**: GDPR compliance, data retention policies, and user data management
- **Security Incident Response**: Breach detection, incident management, and forensic tools
- **IP Whitelisting**: Control access by IP addresses and geographical restrictions
- **Encryption Management**: SSL certificate management and data encryption policies
- **Vulnerability Management**: Security scanning, patch management, and threat monitoring

### 6. Business Intelligence & Reporting

- **Custom Report Builder**: Create complex reports with multiple data sources
- **Executive Dashboards**: High-level business metrics and trend analysis
- **Competitive Analysis**: Market positioning, pricing analysis, and competitor monitoring
- **Customer Segmentation**: Advanced customer analytics and personalization
- **Performance Benchmarking**: Compare performance across hotels and industry standards

### 7. System Automation & Workflows

- **Workflow Automation**: Create automated processes for common operations
- **Alert Management**: Configure system alerts, escalation procedures, and notifications
- **Scheduled Operations**: Manage automated backups, reports, and maintenance tasks
- **Integration Management**: Third-party service integrations and API connections
- **Business Process Optimization**: Identify bottlenecks and optimize workflows

### 8. Advanced Hotel Operations

- **Dynamic Pricing Control**: AI-powered pricing strategies and revenue optimization
- **Inventory Management**: Global inventory tracking, waste reduction, and procurement
- **Quality Assurance**: Service standards enforcement and performance monitoring
- **Marketing Campaign Management**: Cross-hotel promotions and loyalty programs
- **Guest Experience Analytics**: Sentiment analysis, feedback management, and service improvement

### 9. Emergency & Crisis Management

- **Incident Response**: Emergency protocols, crisis communication, and business continuity
- **Disaster Recovery**: Data recovery procedures and system restoration capabilities
- **Risk Management**: Identify and mitigate operational, financial, and security risks
- **Insurance Claims**: Manage insurance policies and claims processing
- **Regulatory Compliance**: Ensure compliance with local and international regulations

### 10. Advanced Staff Management

- **Performance Analytics**: Staff productivity, training needs, and performance reviews
- **Payroll Management**: Multi-location payroll, benefits administration, and tax reporting
- **Training Programs**: Standardized training modules and certification tracking
- **Recruitment Analytics**: Hiring metrics, turnover analysis, and recruitment optimization
- **Labor Cost Optimization**: Schedule optimization and cost control

---

## Implementation Timeline

### Phase 1: Foundation & Security (3-4 weeks)

**Time Required: 160-180 hours**

- Update Admin model with super_admin role _(8 hours)_
- Enhanced authentication & 2FA _(16 hours)_
- Audit logging system _(20 hours)_
- Advanced session management _(12 hours)_
- Security middleware enhancements _(24 hours)_
- Database backup/restore system _(20 hours)_
- System health monitoring _(24 hours)_
- IP whitelisting & geo-restrictions _(16 hours)_
- Advanced error handling & logging _(20 hours)_

### Phase 2: Advanced User & Admin Management (2-3 weeks)

**Time Required: 120-140 hours**

- Super admin can manage other admins _(16 hours)_
- Dynamic role creation system _(24 hours)_
- Permission template system _(20 hours)_
- Advanced user analytics _(16 hours)_
- Mass user operations _(12 hours)_
- Staff performance tracking _(20 hours)_
- Payroll integration basics _(24 hours)_
- Training module management _(16 hours)_
- Recruitment analytics _(12 hours)_

### Phase 3: Financial & Business Intelligence (3-4 weeks)

**Time Required: 140-160 hours**

- Advanced financial reporting _(24 hours)_
- Cross-hotel revenue analytics _(20 hours)_
- Predictive analytics engine _(32 hours)_
- Tax management system _(20 hours)_
- Fraud detection algorithms _(24 hours)_
- Custom report builder _(20 hours)_
- Executive dashboards _(20 hours)_
- Competitive analysis tools _(20 hours)_

### Phase 4: Operational Intelligence (2-3 weeks)

**Time Required: 100-120 hours**

- Real-time dashboard enhancements _(20 hours)_
- Supply chain management _(24 hours)_
- Quality control systems _(16 hours)_
- Compliance monitoring _(20 hours)_
- Inventory optimization _(20 hours)_
- Dynamic pricing algorithms _(20 hours)_

### Phase 5: Automation & Workflows (2-3 weeks)

**Time Required: 100-120 hours**

- Workflow automation engine _(24 hours)_
- Alert management system _(16 hours)_
- Scheduled operations enhancement _(20 hours)_
- Integration management _(20 hours)_
- Business process optimization _(20 hours)_

### Phase 6: Emergency & Crisis Management (1-2 weeks)

**Time Required: 60-80 hours**

- Incident response system _(16 hours)_
- Disaster recovery procedures _(20 hours)_
- Risk management dashboard _(12 hours)_
- Emergency override capabilities _(12 hours)_

### Phase 7: Testing, Documentation & Deployment (2-3 weeks)

**Time Required: 80-100 hours**

- Comprehensive testing _(40 hours)_
- Security testing & penetration testing _(20 hours)_
- Documentation & API docs _(20 hours)_
- Deployment & monitoring setup _(20 hours)_

### Total Development Timeline:

- **Conservative Estimate**: 860-1,000 hours (15-18 weeks / 3.5-4.5 months)
- **Aggressive Estimate**: 700-850 hours (12-15 weeks / 3-3.5 months)
- **Realistic Estimate**: 800-900 hours (14-16 weeks / 3.5-4 months)

**Recommended Team**: 2-3 developers + 1 senior architect

---

## Subscription Plans & Features

### 🆓 Free Trial Plan (₹0 - 1 Month)

**Target**: New restaurants trying the system

#### Core Features:

- ✅ Basic Restaurant Setup: 1 Hotel, 2 Branches max
- ✅ Limited User Management: Up to 10 customers, 3 staff members
- ✅ Basic Menu Management: Up to 25 menu items, 5 categories
- ✅ Simple Table Management: Up to 15 tables with QR codes
- ✅ Basic Order Processing: Order taking, status updates
- ✅ Simple Payment: Cash and basic online payments
- ✅ Basic Dashboard: Simple analytics (last 7 days only)
- ✅ Customer Support: Email support only

#### Limitations:

- ❌ No advanced analytics
- ❌ No inventory management
- ❌ No staff scheduling
- ❌ No advanced reporting
- ❌ No API access
- ❌ Limited customization

### 💼 Basic Plan (₹499/month)

**Target**: Small restaurants, cafes, single outlets

#### Features (Free Plan + Following):

- ✅ Extended Limits: 1 Hotel, 5 Branches, 50 customers, 10 staff
- ✅ Enhanced Menu: Up to 100 menu items, 15 categories
- ✅ Advanced Table Management: Up to 30 tables, reservation system
- ✅ Inventory Tracking: Basic stock management, low stock alerts
- ✅ Customer Management: Customer profiles, basic loyalty points
- ✅ Staff Management: Basic staff roles, attendance tracking
- ✅ Reports: Sales reports (last 30 days), basic profit/loss
- ✅ Offer Management: Basic discount coupons and offers
- ✅ Payment Options: Multiple payment gateways, split bills
- ✅ Notifications: SMS and email notifications
- ✅ Data Export: Basic CSV exports

#### New Features:

- Basic inventory management
- Customer loyalty system
- Staff attendance tracking
- Order history (30 days)
- Basic sales analytics
- Coupon/discount system
- SMS notifications
- Print receipts

### 🚀 Pro Plan (₹999/month)

**Target**: Growing restaurants, multiple outlets, chain stores

#### Features (Basic Plan + Following):

- ✅ Expanded Scale: 3 Hotels, 15 Branches, 200 customers, 30 staff
- ✅ Advanced Analytics: 90-day reports, trend analysis, forecasting
- ✅ Comprehensive Inventory: Multi-location inventory, supplier management
- ✅ Advanced Staff Features: Scheduling, performance tracking, payroll basics
- ✅ Customer Insights: Detailed customer analytics, segmentation
- ✅ Marketing Tools: Email campaigns, targeted promotions
- ✅ Advanced Reporting: Custom reports, profit/loss analysis
- ✅ Multi-location Management: Centralized control across branches
- ✅ API Access: Basic API for integrations
- ✅ Advanced Reservations: Table booking system, waitlist management

#### New Features:

- Multi-location inventory sync
- Staff scheduling & shifts
- Customer segmentation
- Advanced sales forecasting
- Email marketing campaigns
- Custom report builder
- Supplier management
- Basic API access (100 calls/day)
- Advanced table reservation system
- Kitchen display system
- Waste management tracking
- Menu profitability analysis

### 🏢 Enterprise Plan (₹2499/month)

**Target**: Large restaurant chains, hotel chains, enterprise customers

#### Features (Pro Plan + Following):

- ✅ Unlimited Scale: Unlimited hotels, branches, customers, staff
- ✅ Advanced Business Intelligence: Predictive analytics, AI insights
- ✅ Complete Staff Management: HR module, payroll, performance reviews
- ✅ Advanced Financial Management: Accounting integration, tax management
- ✅ White-label Options: Custom branding, domain
- ✅ Priority Support: Phone support, dedicated account manager
- ✅ Advanced Integrations: ERP, CRM, accounting software integrations
- ✅ Compliance Tools: GST reports, audit trails, regulatory compliance
- ✅ Advanced Security: SSO, advanced user permissions, audit logs

#### Enterprise-Only Features:

- Unlimited everything
- AI-powered demand forecasting
- Advanced financial reporting & GST
- Multi-currency support
- Franchise management
- Advanced user roles & permissions
- SSO integration
- White-label/custom branding
- Dedicated account manager
- Custom integrations
- Advanced security features
- Audit trails & compliance
- API access (unlimited)
- Advanced analytics & BI dashboards
- Automated reordering
- Multi-language support

---

## Technical Architecture

### Database Models Required:

#### 1. SubscriptionPlan Model

```javascript
{
  name: String, // "Free Trial Plan", "Basic Plan", etc.
  type: String, // "free", "paid"
  accessLevel: String, // "full", "limited", "extended"
  duration: String, // "monthly", "yearly", "lifetime"
  durationInDays: Number, // 30, 365, etc.
  price: Number, // ₹0, ₹499, ₹999, ₹2499
  currency: String, // "INR"
  features: [String], // Array of features included
  limitations: Object, // Max hotels, branches, users, etc.
  isActive: Boolean,
  isDefault: Boolean, // For Free Trial
  createdBy: ObjectId, // Super Admin who created
  updatedBy: ObjectId
}
```

#### 2. HotelSubscription Model

```javascript
{
  hotelId: ObjectId, // Reference to Hotel
  planId: ObjectId, // Reference to SubscriptionPlan
  status: String, // "active", "expired", "suspended", "cancelled"
  startDate: Date,
  endDate: Date,
  autoRenew: Boolean,
  paymentStatus: String, // "pending", "paid", "failed"
  transactionId: String,
  razorpaySubscriptionId: String,
  usage: Object, // Track current usage vs limits
  trialUsed: Boolean, // Has hotel used free trial?
  downgradedFrom: ObjectId, // Previous plan if downgraded
  upgradedTo: ObjectId // Next plan if upgraded
}
```

#### 3. SubscriptionTransaction Model

```javascript
{
  hotelId: ObjectId,
  subscriptionId: ObjectId,
  planId: ObjectId,
  amount: Number,
  currency: String,
  status: String, // "pending", "completed", "failed", "refunded"
  paymentMethod: String,
  razorpayPaymentId: String,
  invoiceUrl: String,
  nextBillingDate: Date,
  transactionType: String // "new", "renewal", "upgrade", "downgrade"
}
```

### Super Admin Permissions Structure:

```javascript
permissions: {
  // System Level
  manageSystem: true,
  manageDatabase: true,
  manageBackups: true,
  manageIntegrations: true,

  // Security
  manageSecurity: true,
  viewAuditLogs: true,
  manageEncryption: true,

  // Admin Management
  manageAdmins: true,
  manageRoles: true,
  managePermissions: true,

  // Subscription Management
  managePlans: true,
  manageSubscriptions: true,
  viewSubscriptionAnalytics: true,

  // Financial
  viewAllFinancials: true,
  manageTaxSettings: true,
  managePaymentGateways: true,

  // Emergency
  emergencyOverride: true,
  systemMaintenance: true,
  forceActions: true
}
```

---

## Development Roadmap

### Immediate Priority (Week 1-4)

1. **Update Admin Model**: Add super_admin role and enhanced permissions
2. **Subscription Models**: Create all subscription-related database models
3. **Basic Plan Management**: CRUD operations for subscription plans
4. **Payment Integration**: Enhance Razorpay integration for subscriptions
5. **Feature Access Control**: Implement middleware for plan-based restrictions

### Short Term (Week 5-8)

1. **Advanced Analytics Dashboard**: Super admin overview of all hotels
2. **User Management Enhancement**: Advanced admin controls
3. **Financial Reporting**: Cross-hotel revenue and profit analysis
4. **Security Enhancements**: 2FA, session management, audit logs
5. **Automated Billing**: Subscription renewals and notifications

### Medium Term (Week 9-12)

1. **Business Intelligence**: Predictive analytics and forecasting
2. **Inventory Management**: Multi-location inventory tracking
3. **Staff Management**: Advanced HR features and performance tracking
4. **Marketing Tools**: Campaign management and customer segmentation
5. **Compliance Tools**: Regulatory compliance and audit trails

### Long Term (Week 13-16)

1. **AI Integration**: Demand forecasting and pricing optimization
2. **Advanced Security**: SSO, advanced permissions, vulnerability management
3. **White-label Options**: Custom branding and multi-tenancy
4. **Advanced Integrations**: ERP, CRM, and accounting software
5. **Mobile Apps**: Super admin mobile application

---

## Feature Access Control

### Plan Limitations Matrix:

```javascript
const PLAN_FEATURES = {
  free: {
    maxHotels: 1,
    maxBranches: 2,
    maxUsers: 10,
    maxStaff: 3,
    maxTables: 15,
    maxMenuItems: 25,
    maxCategories: 5,
    dataRetention: 7, // days
    features: [
      "basic_menu",
      "basic_orders",
      "qr_codes",
      "cash_payments",
      "basic_dashboard",
    ],
    restrictions: [
      "no_inventory",
      "no_analytics",
      "no_reports",
      "no_api_access",
      "email_support_only",
    ],
  },

  basic: {
    maxHotels: 1,
    maxBranches: 5,
    maxUsers: 50,
    maxStaff: 10,
    maxTables: 30,
    maxMenuItems: 100,
    maxCategories: 15,
    dataRetention: 30,
    features: [
      // Free features +
      "inventory_basic",
      "loyalty_system",
      "staff_attendance",
      "basic_reports",
      "offers_coupons",
      "sms_notifications",
    ],
  },

  pro: {
    maxHotels: 3,
    maxBranches: 15,
    maxUsers: 200,
    maxStaff: 30,
    maxTables: 100,
    maxMenuItems: 500,
    maxCategories: 50,
    dataRetention: 90,
    features: [
      // Basic features +
      "advanced_analytics",
      "multi_location",
      "staff_scheduling",
      "customer_segmentation",
      "email_marketing",
      "api_basic",
      "advanced_reservations",
    ],
  },

  enterprise: {
    maxHotels: "unlimited",
    maxBranches: "unlimited",
    maxUsers: "unlimited",
    maxStaff: "unlimited",
    maxTables: "unlimited",
    maxMenuItems: "unlimited",
    maxCategories: "unlimited",
    dataRetention: "unlimited",
    features: [
      // Pro features +
      "ai_analytics",
      "white_label",
      "advanced_security",
      "sso_integration",
      "custom_integrations",
      "priority_support",
      "compliance_tools",
    ],
  },
};
```

### Middleware Implementation:

```javascript
const checkFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    const subscription = req.user.subscription;
    const plan = subscription.planId;

    if (!plan.features.includes(featureName)) {
      return res.status(403).json({
        error: "Feature not available in your current plan",
        feature: featureName,
        currentPlan: plan.name,
        upgradeRequired: true,
      });
    }

    next();
  };
};
```

### API Endpoints for Super Admin:

#### Plan Management:

- `POST /api/super-admin/plans` - Create subscription plan
- `GET /api/super-admin/plans` - Get all plans
- `PUT /api/super-admin/plans/:id` - Update plan
- `DELETE /api/super-admin/plans/:id` - Delete plan
- `GET /api/super-admin/plans/analytics` - Plan performance analytics

#### Subscription Management:

- `GET /api/super-admin/subscriptions` - All hotel subscriptions
- `POST /api/super-admin/subscriptions/upgrade` - Manual upgrade
- `POST /api/super-admin/subscriptions/extend` - Extend subscription
- `POST /api/super-admin/subscriptions/suspend` - Suspend subscription
- `GET /api/super-admin/subscriptions/analytics` - Subscription analytics

#### System Management:

- `GET /api/super-admin/system/health` - System health status
- `GET /api/super-admin/system/logs` - System logs and audit trails
- `POST /api/super-admin/system/backup` - Create system backup
- `GET /api/super-admin/system/metrics` - Performance metrics

---

## Key Benefits

### For Business:

1. **Scalable Revenue Model**: Multiple pricing tiers for different customer segments
2. **Automated Management**: Reduces manual intervention and operational costs
3. **Data-Driven Decisions**: Comprehensive analytics for business optimization
4. **Market Differentiation**: Advanced features set apart from competitors
5. **Customer Retention**: Clear upgrade paths and feature progression

### For Customers:

1. **Flexible Pricing**: Pay only for features they need
2. **Seamless Scaling**: Easy upgrades as business grows
3. **Comprehensive Solution**: All-in-one hotel management platform
4. **Reliable Support**: Tiered support based on plan level
5. **Integration Ready**: API access for custom integrations

### For Development:

1. **Modular Architecture**: Easy to add new features and plans
2. **Automated Billing**: Integrated payment and subscription management
3. **Usage Tracking**: Monitor feature usage and plan performance
4. **Security First**: Enterprise-grade security and compliance
5. **Future-Proof**: Scalable architecture for growth

---

## Conclusion

This comprehensive Super Admin system with subscription-based pricing will transform your hotel management platform into a scalable SaaS solution. The phased implementation approach ensures manageable development while delivering value at each stage.

The combination of powerful super admin features and well-structured subscription plans creates a solid foundation for:

- **Revenue Growth**: Multiple revenue streams and upgrade paths
- **Customer Success**: Features that scale with business needs
- **Operational Efficiency**: Automated management and monitoring
- **Market Leadership**: Advanced capabilities for competitive advantage

**Estimated ROI**: With proper implementation and marketing, this system can generate 5-10x ROI within the first year through subscription revenue and reduced operational costs.

---

_Document prepared for TableTop Backend - Hotel Management System_
_Date: October 28, 2025_
_Version: 1.0_
