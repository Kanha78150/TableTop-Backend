# 🛒→🪙 Complete Order-to-Coin## 🏨 **MULTI-TENANT COIN SYSTEM**

The coin system now supports **admin isolation** where each admin (hotel owner) has their own separate coin configuration:

- **Admin A** manages Hotel X with their own coin settings (e.g., 10% coins, ₹200 minimum)
- **Admin B** manages Hotel Y with different coin settings (e.g., 5% coins, ₹500 minimum)
- **Admin C** manages Hotel Z with their own rules (e.g., 15% coins, ₹100 minimum)

When users order from different hotels, they get coins based on that specific hotel's admin settings. This provides complete isolation and customization per hotel chain.

### 🏢 **Hotel vs Branch Context**

- **Hotel-level**: Use `hotelId` only - applies hotel admin's coin settings to all branches
- **Branch-level**: Use `hotelId` + `branchId` - gets admin through branch → hotel relationship
- Both approaches use the same admin's coin settings, providing consistency across the hotel chainGuide

## 📋 Overview

End-to-end API testing guide covering the complete customer journey from browsing menu, ordering items, earning coins, and using coins for discounts. This includes real-world scenarios with actual data flow.

## 🔑 Authentication Setup

```javascript
// Replace with your actual tokens
const ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

// Base URL
const BASE_URL = "http://localhost:8000/api/v1";

// Headers
const adminHeaders = {
  Authorization: `Bearer ${ADMIN_TOKEN}`,
  "Content-Type": "application/json",
};

const userHeaders = {
  Authorization: `Bearer ${USER_TOKEN}`,
  "Content-Type": "application/json",
};
```

---

## � **MULTI-TENANT COIN SYSTEM**

The coin system now supports **admin isolation** where each admin (hotel owner) has their own separate coin configuration:

- **Admin A** manages Hotel X with their own coin settings (e.g., 10% coins, ₹200 minimum)
- **Admin B** manages Hotel Y with different coin settings (e.g., 5% coins, ₹500 minimum)
- **Admin C** manages Hotel Z with their own rules (e.g., 15% coins, ₹100 minimum)

When users order from different hotels, they get coins based on that specific hotel's admin settings. This provides complete isolation and customization per hotel chain.

---

## �🏗️ **PHASE 1: ADMIN SETUP**

### **Step 1.1: Configure Coin System**

```http
POST {{BASE_URL}}/admin/coins/settings
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "minimumOrderValue": 200,
  "coinValue": 1,
  "coinsPerRupee": 0.1,
  "maxCoinsPerOrder": 300,
  "maxCoinUsagePercent": 40,
  "coinExpiryDays": 365,
  "isActive": true,
  "reason": "Restaurant coin system setup"
}
```

**Expected Response:**

```json
{
  "statusCode": 201,
  "data": {
    "minimumOrderValue": 200,
    "coinValue": 1,
    "coinsPerRupee": 0.1,
    "maxCoinsPerOrder": 300,
    "maxCoinUsagePercent": 40,
    "coinExpiryDays": 365,
    "isActive": true,
    "_id": "coin_settings_id"
  },
  "message": "Coin settings configured successfully",
  "success": true
}
```

### **Step 1.2: Verify Configuration**

```http
GET {{BASE_URL}}/admin/coins/settings
Authorization: Bearer {{ADMIN_TOKEN}}
```

---

## 🍽️ **PHASE 2: MENU BROWSING**

### **Step 2.1: Get Available Food Categories**

```http
GET {{BASE_URL}}/user/menu/categories
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": [
    {
      "_id": "category_id_1",
      "name": "Main Course",
      "description": "Delicious main course items",
      "isActive": true
    },
    {
      "_id": "category_id_2",
      "name": "Appetizers",
      "description": "Tasty starters",
      "isActive": true
    }
  ],
  "message": "Categories retrieved successfully",
  "success": true
}
```

### **Step 2.2: Browse Food Items**

```http
GET {{BASE_URL}}/user/menu/items
Authorization: Bearer {{USER_TOKEN}}
```

**Sample Response:**

```json
{
  "statusCode": 200,
  "data": {
    "items": [
      {
        "_id": "item_id_1",
        "name": "Chicken Biryani",
        "description": "Aromatic basmati rice with tender chicken",
        "price": 299,
        "category": "Main Course",
        "isAvailable": true,
        "image": "biryani.jpg"
      },
      {
        "_id": "item_id_2",
        "name": "Paneer Tikka",
        "description": "Grilled cottage cheese with spices",
        "price": 249,
        "category": "Appetizers",
        "isAvailable": true,
        "image": "paneer_tikka.jpg"
      }
    ],
    "totalItems": 2
  },
  "message": "Food items retrieved successfully",
  "success": true
}
```

### **Step 2.3: Get Specific Item Details**

```http
GET {{BASE_URL}}/user/menu/items/item_id_1
Authorization: Bearer {{USER_TOKEN}}
```

---

## 🛒 **PHASE 3: CART MANAGEMENT**

### **Step 3.1: Add Items to Cart**

```http
POST {{BASE_URL}}/user/cart/add
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "foodItemId": "item_id_1",
  "quantity": 2,
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1",
  "specialInstructions": "Medium spicy"
}
```

**Expected Response:**

```json
{
  "statusCode": 201,
  "data": {
    "cartItem": {
      "_id": "cart_item_id_1",
      "foodItem": {
        "_id": "item_id_1",
        "name": "Chicken Biryani",
        "price": 299
      },
      "quantity": 2,
      "totalPrice": 598,
      "specialInstructions": "Medium spicy"
    }
  },
  "message": "Item added to cart successfully",
  "success": true
}
```

### **Step 3.2: Add More Items**

```http
POST {{BASE_URL}}/user/cart/add
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "foodItemId": "item_id_2",
  "quantity": 1,
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1",
  "specialInstructions": "Extra sauce"
}
```

### **Step 3.3: View Current Cart**

```http
GET {{BASE_URL}}/user/cart/hotel_id_1/branch_id_1
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "cart": {
      "_id": "cart_id",
      "user": "user_id",
      "hotel": "hotel_id_1",
      "branch": "branch_id_1",
      "items": [
        {
          "foodItem": {
            "_id": "item_id_1",
            "name": "Chicken Biryani",
            "price": 299
          },
          "quantity": 2,
          "totalPrice": 598
        },
        {
          "foodItem": {
            "_id": "item_id_2",
            "name": "Paneer Tikka",
            "price": 249
          },
          "quantity": 1,
          "totalPrice": 249
        }
      ],
      "totalItems": 3,
      "totalPrice": 847
    }
  },
  "message": "Cart retrieved successfully",
  "success": true
}
```

### **Step 3.4: Get Cart Summary**

```http
GET {{BASE_URL}}/user/cart/summary/hotel_id_1/branch_id_1
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "summary": {
      "totalItems": 3,
      "totalPrice": 847,
      "tax": 76.23,
      "deliveryFee": 50,
      "finalAmount": 973.23,
      "coinEligible": true,
      "potentialCoinsEarned": 84
    }
  },
  "message": "Cart summary retrieved successfully",
  "success": true
}
```

---

## 🪙 **PHASE 4: COIN CALCULATIONS (BEFORE ORDER)**

> **⚠️ IMPORTANT**: All coin calculation endpoints now require `hotelId` parameter due to admin isolation. Each hotel has its own coin settings configured by its admin. Optional `branchId` parameter is also supported for branch-specific contexts.

### **Step 4.1: Check Current Coin Balance**

```http
GET {{BASE_URL}}/user/coins/balance
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "currentBalance": 150,
    "totalEarned": 450,
    "totalUsed": 300,
    "totalExpired": 0,
    "nextExpiry": null
  },
  "message": "Coin balance retrieved successfully",
  "success": true
}
```

### **Step 4.2: Calculate Potential Earnings**

```http
GET {{BASE_URL}}/user/coins/calculate-earning?orderValue=973&hotelId=hotel_id_1&branchId=branch_id_1
Authorization: Bearer {{USER_TOKEN}}
```

> **Note**: `branchId` is optional. If provided, it will get admin settings through branch → hotel → admin relationship.

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "orderValue": 973,
    "coinsEarned": 97,
    "cashbackPercentage": 10,
    "qualified": true,
    "eligibilityCheck": {
      "minimumOrderValue": 200,
      "meetsMinimum": true,
      "systemActive": true
    }
  },
  "message": "Coin earning calculated successfully",
  "success": true
}
```

### **Step 4.3: Check Maximum Usable Coins**

```http
GET {{BASE_URL}}/user/coins/max-usable?orderValue=973&hotelId=hotel_id_1&branchId=branch_id_1
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "orderValue": 973,
    "maxCoinsUsable": 389,
    "maxDiscountAmount": 389,
    "maxUsagePercent": 40,
    "userBalance": 150,
    "actualUsable": 150,
    "recommendation": "You can use all 150 of your coins for ₹150 discount"
  },
  "message": "Maximum usable coins calculated successfully",
  "success": true
}
```

### **Step 4.4: Calculate Specific Discount**

```http
POST {{BASE_URL}}/user/coins/calculate-discount
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "orderValue": 973,
  "coinsToUse": 100,
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1"
}
```

> **Note**: `branchId` is optional in the request body.

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "orderValue": 973,
    "coinsToUse": 100,
    "discountAmount": 100,
    "finalAmount": 873,
    "valid": true,
    "savings": {
      "percentageSaved": 10.28,
      "amountSaved": 100
    }
  },
  "message": "Discount calculated successfully",
  "success": true
}
```

---

## 🎯 **PHASE 5: PLACE ORDER (WITH COINS)**

### **Step 5.1: Place Order Using Coins**

```http
POST {{BASE_URL}}/user/orders/place
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1",
  "tableId": "table_id_1",
  "orderType": "dine-in",
  "paymentMethod": "cash",
  "specialInstructions": "Please serve hot",
  "coinsUsed": 100,
  "address": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  }
}
```

**Expected Response:**

```json
{
  "statusCode": 201,
  "data": {
    "order": {
      "_id": "order_id_1",
      "orderNumber": "ORD-2025-10-07-001",
      "user": "user_id",
      "hotel": "hotel_id_1",
      "branch": "branch_id_1",
      "items": [
        {
          "foodItem": "item_id_1",
          "name": "Chicken Biryani",
          "quantity": 2,
          "price": 299,
          "totalPrice": 598
        },
        {
          "foodItem": "item_id_2",
          "name": "Paneer Tikka",
          "quantity": 1,
          "price": 249,
          "totalPrice": 249
        }
      ],
      "pricing": {
        "subtotal": 847,
        "tax": 76.23,
        "deliveryFee": 50,
        "totalPrice": 973.23,
        "coinsUsed": 100,
        "coinDiscount": 100,
        "finalAmount": 873.23
      },
      "coinTransaction": {
        "coinsUsed": 100,
        "coinsEarned": 87,
        "netCoinChange": -13
      },
      "status": "placed",
      "orderType": "dine-in",
      "paymentMethod": "cash",
      "createdAt": "2025-10-07T12:30:00.000Z"
    }
  },
  "message": "Order placed successfully",
  "success": true
}
```

### **Step 5.2: Verify Order Details**

```http
GET {{BASE_URL}}/user/orders/order_id_1
Authorization: Bearer {{USER_TOKEN}}
```

---

## 🪙 **PHASE 6: COIN VERIFICATION (AFTER ORDER)**

### **Step 6.1: Check Updated Coin Balance**

```http
GET {{BASE_URL}}/user/coins/balance
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "currentBalance": 137,
    "totalEarned": 537,
    "totalUsed": 400,
    "totalExpired": 0,
    "recentActivity": {
      "lastTransaction": {
        "type": "used",
        "amount": 100,
        "orderId": "order_id_1",
        "date": "2025-10-07T12:30:00.000Z"
      },
      "nextTransaction": {
        "type": "earned",
        "amount": 87,
        "orderId": "order_id_1",
        "date": "2025-10-07T12:30:05.000Z"
      }
    }
  },
  "message": "Coin balance retrieved successfully",
  "success": true
}
```

### **Step 6.2: View Recent Coin History**

```http
GET {{BASE_URL}}/user/coins/history?limit=5
Authorization: Bearer {{USER_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "transactions": [
      {
        "_id": "txn_id_2",
        "type": "earned",
        "amount": 87,
        "description": "Coins earned from order ORD-2025-10-07-001",
        "order": {
          "_id": "order_id_1",
          "orderNumber": "ORD-2025-10-07-001",
          "totalPrice": 973.23
        },
        "balanceAfter": 137,
        "createdAt": "2025-10-07T12:30:05.000Z"
      },
      {
        "_id": "txn_id_1",
        "type": "used",
        "amount": 100,
        "description": "Coins used for order ORD-2025-10-07-001",
        "order": {
          "_id": "order_id_1",
          "orderNumber": "ORD-2025-10-07-001"
        },
        "balanceAfter": 50,
        "createdAt": "2025-10-07T12:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalTransactions": 2
    }
  },
  "message": "Coin transaction history retrieved successfully",
  "success": true
}
```

### **Step 6.3: Get Detailed Coin Information**

```http
GET {{BASE_URL}}/user/coins/details
Authorization: Bearer {{USER_TOKEN}}
```

---

## 🔄 **PHASE 7: PLACE ANOTHER ORDER (WITHOUT COINS)**

### **Step 7.1: Add New Items to Cart**

```http
POST {{BASE_URL}}/user/cart/add
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "foodItemId": "item_id_3",
  "quantity": 1,
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1"
}
```

### **Step 7.2: Place Order Without Using Coins**

```http
POST {{BASE_URL}}/user/orders/place
Authorization: Bearer {{USER_TOKEN}}
Content-Type: application/json

{
  "hotelId": "hotel_id_1",
  "branchId": "branch_id_1",
  "tableId": "table_id_1",
  "orderType": "dine-in",
  "paymentMethod": "cash",
  "coinsUsed": 0
}
```

**Expected Response (Order only earns coins):**

```json
{
  "statusCode": 201,
  "data": {
    "order": {
      "_id": "order_id_2",
      "orderNumber": "ORD-2025-10-07-002",
      "pricing": {
        "subtotal": 350,
        "tax": 31.5,
        "totalPrice": 381.5,
        "coinsUsed": 0,
        "coinDiscount": 0,
        "finalAmount": 381.5
      },
      "coinTransaction": {
        "coinsUsed": 0,
        "coinsEarned": 38,
        "netCoinChange": 38
      }
    }
  },
  "message": "Order placed successfully",
  "success": true
}
```

---

## 🔍 **PHASE 8: ADMIN ANALYTICS & MONITORING**

### **Step 8.1: View System Analytics**

```http
GET {{BASE_URL}}/admin/coins/analytics
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "data": {
    "summary": {
      "totalCoinsIssued": 625,
      "totalCoinsUsed": 400,
      "totalActiveUsers": 15,
      "totalOrders": 47,
      "averageCoinsPerOrder": 45.2
    },
    "recentActivity": {
      "last24Hours": {
        "coinsEarned": 125,
        "coinsUsed": 100,
        "newUsers": 3,
        "orders": 8
      }
    },
    "topUsers": [
      {
        "user": {
          "_id": "user_id",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "totalCoinsEarned": 537,
        "totalCoinsUsed": 400,
        "currentBalance": 175
      }
    ]
  },
  "message": "Coin analytics retrieved successfully",
  "success": true
}
```

### **Step 8.2: View Users with Coins**

```http
GET {{BASE_URL}}/admin/coins/users?limit=10
Authorization: Bearer {{ADMIN_TOKEN}}
```

### **Step 8.3: View All Transactions**

```http
GET {{BASE_URL}}/admin/coins/transactions?limit=20
Authorization: Bearer {{ADMIN_TOKEN}}
```

---

## 🧪 **TESTING SCENARIOS**

### **Scenario 1: First-Time User Journey**

```javascript
// Complete flow for new user
const firstTimeUserFlow = async () => {
  // 1. Browse menu
  const categories = await GET("/user/menu/categories");
  const items = await GET("/user/menu/items");

  // 2. Check coin system info
  const coinInfo = await GET("/user/coins/info?hotelId=hotel_id_1");
  const balance = await GET("/user/coins/balance"); // Should be 0

  // 3. Add items to cart
  await POST("/user/cart/add", { foodItemId: "item1", quantity: 2 });

  // 4. Calculate potential earnings
  const earnings = await GET(
    "/user/coins/calculate-earning?orderValue=500&hotelId=hotel_id_1"
  );

  // 5. Place order (no coins to use)
  const order = await POST("/user/orders/place", {
    hotelId: "hotel_id_1",
    coinsUsed: 0,
  });

  // 6. Verify coins earned
  const newBalance = await GET("/user/coins/balance");
  const history = await GET("/user/coins/history");
};
```

### **Scenario 2: Returning User with Coins**

```javascript
const returningUserFlow = async () => {
  // 1. Check existing balance
  const balance = await GET("/user/coins/balance");

  // 2. Add items worth ₹1000
  await POST("/user/cart/add", { foodItemId: "item1", quantity: 3 });

  // 3. Check max usable coins
  const maxUsable = await GET(
    "/user/coins/max-usable?orderValue=1000&hotelId=hotel_id_1"
  );

  // 4. Calculate discount
  const discount = await POST("/user/coins/calculate-discount", {
    orderValue: 1000,
    coinsToUse: 200,
    hotelId: "hotel_id_1",
  });

  // 5. Place order with coins
  const order = await POST("/user/orders/place", {
    hotelId: "hotel_id_1",
    coinsUsed: 200,
  });

  // 6. Verify final balance
  const finalBalance = await GET("/user/coins/balance");
};
```

### **Scenario 3: Order Below Minimum Value**

```javascript
const belowMinimumOrder = async () => {
  // 1. Add items worth ₹150 (below ₹200 minimum)
  await POST("/user/cart/add", { foodItemId: "cheapItem", quantity: 1 });

  // 2. Check earnings (should be 0)
  const earnings = await GET(
    "/user/coins/calculate-earning?orderValue=150&hotelId=hotel_id_1"
  );
  // Expected: coinsEarned: 0, qualified: false

  // 3. Place order
  const order = await POST("/user/orders/place", {
    hotelId: "hotel_id_1",
    coinsUsed: 0,
  });

  // 4. Verify no coins earned
  const balance = await GET("/user/coins/balance");
};
```

---

## ✅ **VALIDATION CHECKLIST**

### **Order Flow Validation**

- [ ] Menu items display correctly with prices
- [ ] Cart calculates totals accurately
- [ ] Order placement works with all required fields
- [ ] Order confirmation includes correct coin calculations

### **Coin System Validation**

- [ ] Coins earned match configuration (10% of order value)
- [ ] Minimum order value enforced (₹200)
- [ ] Maximum coins per order respected (300 coins)
- [ ] Maximum usage percentage enforced (40%)
- [ ] Coin transactions recorded properly

### **Integration Validation**

- [ ] Cart → Order → Coins flow works seamlessly
- [ ] Balance updates immediately after transactions
- [ ] History shows both coin usage and earnings
- [ ] Admin analytics reflect user activities

### **Error Handling**

- [ ] Invalid coin amounts rejected
- [ ] Insufficient coin balance handled gracefully
- [ ] Order failures don't affect coin balance
- [ ] API errors return proper status codes

---

## 🎯 **SUCCESS METRICS**

After completing all phases, verify:

1. **User earned coins** from qualifying orders (≥₹200)
2. **User used coins** for discounts (≤40% of order value)
3. **Balance updated correctly** after each transaction
4. **Transaction history** shows complete audit trail
5. **Admin analytics** reflect all user activities

---

## 🚀 **Quick Test Script**

```bash
# Set variables
BASE_URL="http://localhost:8000/api/v1"
USER_TOKEN="your_user_token"
ADMIN_TOKEN="your_admin_token"

# 1. Setup coin system
curl -X POST "$BASE_URL/admin/coins/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minimumOrderValue":200,"coinValue":1,"coinsPerRupee":0.1,"maxCoinsPerOrder":300,"maxCoinUsagePercent":40,"coinExpiryDays":365,"isActive":true}'

# 2. Check user balance
curl -X GET "$BASE_URL/user/coins/balance" \
  -H "Authorization: Bearer $USER_TOKEN"

# 3. Browse menu
curl -X GET "$BASE_URL/user/menu/items" \
  -H "Authorization: Bearer $USER_TOKEN"

# 4. Add to cart
curl -X POST "$BASE_URL/user/cart/add" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"foodItemId":"ITEM_ID","quantity":2,"hotelId":"HOTEL_ID","branchId":"BRANCH_ID"}'

# 5. Place order
curl -X POST "$BASE_URL/user/orders/place" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hotelId":"HOTEL_ID","branchId":"BRANCH_ID","orderType":"dine-in","paymentMethod":"cash","coinsUsed":0}'

# 6. Check updated balance
curl -X GET "$BASE_URL/user/coins/balance" \
  -H "Authorization: Bearer $USER_TOKEN"
```

---

## 🎉 **Testing Complete!**

This guide covers the complete order-to-coin flow including:

- ✅ Admin coin system setup
- ✅ Menu browsing and cart management
- ✅ Coin calculations and previews
- ✅ Order placement with coin usage
- ✅ Coin earning and balance updates
- ✅ Admin monitoring and analytics
- ✅ Multiple testing scenarios
- ✅ Validation checklists

Use this guide to thoroughly test the integration between ordering system and coin rewards! 🚀
