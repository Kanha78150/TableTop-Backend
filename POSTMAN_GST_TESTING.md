# Dynamic GST Implementation - Postman Testing Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Authentication Setup](#authentication-setup)
3. [Food Category Management](#food-category-management)
4. [Food Item Management](#food-item-management)
5. [Bulk GST Updates](#bulk-gst-updates)
6. [Testing Checkout Flow](#testing-checkout-flow)
7. [Invoice Generation](#invoice-generation)
8. [Test Scenarios](#test-scenarios)

---

## Prerequisites

### Valid GST Rates

Only the following GST rates are accepted:

- **0%** - Essential items (e.g., bread, milk)
- **5%** - Food grains, coffee, tea
- **12%** - Butter, cheese, packaged food
- **18%** - Most restaurant food items
- **28%** - Luxury/premium items

### Required IDs

Before testing, ensure you have:

- ✅ Admin/Manager authentication token
- ✅ Hotel ID
- ✅ Branch ID
- ✅ Category ID (for food items)
- ✅ User ID (for checkout testing)
- ✅ Table ID (for dine-in orders)

---

## Authentication Setup

### 1. Admin Login

```http
POST {{baseURL}}/api/v1/auth/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your_password"
}
```

**Response:**

```json
{
  "statusCode": 200,
  "data": {
    "admin": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Action:** Copy the `token` and use it in all subsequent requests as:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

### 2. Manager Login

```http
POST {{baseURL}}/api/v1/auth/manager/login
Content-Type: application/json

{
  "email": "manager@example.com",
  "password": "your_password"
}
```

---

## Food Category Management

### 1. Create Food Category

Before creating food items, you need to create categories. Here are the required fields:

#### Request

```http
POST {{baseURL}}/api/v1/admin/menu/categories
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "name": "Starters",
  "description": "Appetizers and starters",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "type": "both",
  "isActive": true,
  "displayOrder": 1
}
```

#### Required Fields

| Field      | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `name`     | String | ✅ Yes   | Category name (2-100 characters)             |
| `hotelId`  | String | ✅ Yes   | Hotel ID (ObjectId or HTL-YYYY-00000 format) |
| `branchId` | String | ✅ Yes   | Branch ID (ObjectId or BRN-XXX-00000 format) |

#### Optional Fields

| Field              | Type    | Default | Description                                            |
| ------------------ | ------- | ------- | ------------------------------------------------------ |
| `description`      | String  | ""      | Category description (max 500 characters)              |
| `type`             | String  | "both"  | Category type: `"veg"`, `"non-veg"`, or `"both"`       |
| `isActive`         | Boolean | true    | Whether category is active                             |
| `displayOrder`     | Number  | -       | Display order/priority                                 |
| `image`            | String  | null    | Category image URL                                     |
| `tags`             | Array   | []      | Array of tag strings                                   |
| `availableTimings` | Object  | {}      | Timing availability (breakfast, lunch, dinner, snacks) |

#### Example Categories

**Starters Category**

```json
{
  "name": "Starters",
  "description": "Delicious appetizers to begin your meal",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "type": "both",
  "isActive": true,
  "displayOrder": 1,
  "tags": ["appetizer", "starter"],
  "availableTimings": {
    "breakfast": false,
    "lunch": true,
    "dinner": true,
    "snacks": true
  }
}
```

**Main Course Category**

```json
{
  "name": "Main Course",
  "description": "Hearty main dishes",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "type": "both",
  "isActive": true,
  "displayOrder": 2
}
```

**Beverages Category**

```json
{
  "name": "Beverages",
  "description": "Refreshing drinks and beverages",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "type": "veg",
  "isActive": true,
  "displayOrder": 5
}
```

**Desserts Category**

```json
{
  "name": "Desserts",
  "description": "Sweet treats to end your meal",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "type": "veg",
  "isActive": true,
  "displayOrder": 4
}
```

#### Expected Response

```json
{
  "statusCode": 201,
  "data": {
    "category": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Starters",
      "description": "Delicious appetizers to begin your meal",
      "categoryId": "CAT-2026-0001",
      "type": "both",
      "isActive": true,
      "displayOrder": 1,
      "hotel": {
        "_id": "...",
        "name": "Hotel Name"
      },
      "branch": {
        "_id": "...",
        "name": "Branch Name",
        "branchId": "BRN-XXX-00001"
      },
      "tags": ["appetizer", "starter"],
      "availableTimings": {
        "breakfast": false,
        "lunch": true,
        "dinner": true,
        "snacks": true
      },
      "createdAt": "2026-01-16T10:00:00.000Z",
      "updatedAt": "2026-01-16T10:00:00.000Z"
    }
  },
  "message": "Category created successfully"
}
```

### 2. Get All Categories

```http
GET {{baseURL}}/api/v1/admin/menu/categories?branchId=YOUR_BRANCH_ID
Authorization: Bearer {{adminToken}}
```

### 3. Get Category by ID

```http
GET {{baseURL}}/api/v1/admin/menu/categories/{{categoryId}}
Authorization: Bearer {{adminToken}}
```

### 4. Update Category

```http
PUT {{baseURL}}/api/v1/admin/menu/categories/{{categoryId}}
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "name": "Updated Starters",
  "description": "Updated description",
  "isActive": true
}
```

### 5. Delete Category

```http
DELETE {{baseURL}}/api/v1/admin/menu/categories/{{categoryId}}
Authorization: Bearer {{adminToken}}
```

**Note:** Save the `categoryId` from the response - you'll need it to create food items!

---

## Food Item Management

### 1. Create Food Item with GST Rate

#### Request

```http
POST {{baseURL}}/api/v1/admin/menu/items
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "name": "Paneer Tikka",
  "description": "Cottage cheese marinated in spices and grilled",
  "price": 250,
  "foodType": "veg",
  "gstRate": 5,
  "categoryId": "YOUR_CATEGORY_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "isAvailable": true,
  "preparationTime": 20,
  "spiceLevel": "medium"
}
```

#### Expected Response

```json
{
  "statusCode": 201,
  "data": {
    "foodItem": {
      "_id": "...",
      "name": "Paneer Tikka",
      "price": 250,
      "gstRate": 5,
      "gstHistory": [
        {
          "rate": 5,
          "changedBy": "...",
          "changedByModel": "Admin",
          "changedAt": "2026-01-16T..."
        }
      ],
      "itemId": "ITEM-2026-0001",
      "category": { ... },
      "hotel": { ... },
      "branch": { ... }
    }
  },
  "message": "Food item created successfully"
}
```

### 2. Create Multiple Items with Different GST Rates

#### 5% GST Item (Food Grains)

```json
{
  "name": "Roti Basket (5 pcs)",
  "price": 50,
  "foodType": "veg",
  "gstRate": 5,
  "categoryId": "YOUR_BREADS_CATEGORY_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

#### 12% GST Item (Packaged Food)

```json
{
  "name": "Cheese Pizza",
  "price": 350,
  "foodType": "veg",
  "gstRate": 12,
  "categoryId": "YOUR_PIZZA_CATEGORY_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

#### 18% GST Item (Restaurant Food)

```json
{
  "name": "Chicken Biryani",
  "price": 280,
  "foodType": "non-veg",
  "gstRate": 18,
  "categoryId": "YOUR_MAIN_COURSE_CATEGORY_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

#### 0% GST Item (Essential)

```json
{
  "name": "Plain Rice",
  "price": 80,
  "foodType": "veg",
  "gstRate": 0,
  "categoryId": "YOUR_RICE_CATEGORY_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

### 3. Update Food Item GST Rate

#### Request

```http
PUT {{baseURL}}/api/v1/admin/menu/items/{{itemId}}
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "gstRate": 18
}
```

#### Expected Response

```json
{
  "statusCode": 200,
  "data": {
    "foodItem": {
      "_id": "...",
      "name": "Paneer Tikka",
      "gstRate": 18,
      "gstHistory": [
        {
          "rate": 5,
          "changedBy": "...",
          "changedByModel": "Admin",
          "changedAt": "2026-01-16T10:00:00Z"
        },
        {
          "rate": 18,
          "changedBy": "...",
          "changedByModel": "Admin",
          "changedAt": "2026-01-16T10:30:00Z"
        }
      ]
    }
  },
  "message": "Food item updated successfully"
}
```

### 4. Get Food Item Details

```http
GET {{baseURL}}/api/v1/admin/menu/items/{{itemId}}
Authorization: Bearer {{adminToken}}
```

**Check:** Verify `gstRate` field is present and `gstHistory` shows all changes.

---

## Bulk GST Updates

### 1. Bulk Update GST by Category (Admin)

#### Request

```http
PUT {{baseURL}}/api/v1/admin/menu/bulk-update-gst
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "categoryId": "YOUR_CATEGORY_ID",
  "gstRate": 12
}
```

#### With Optional Filters

```json
{
  "categoryId": "YOUR_CATEGORY_ID",
  "gstRate": 12,
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

#### Expected Response

```json
{
  "statusCode": 200,
  "data": {
    "summary": {
      "totalItemsFound": 15,
      "itemsUpdated": 12,
      "itemsSkipped": 3,
      "categoryName": "Beverages",
      "newGstRate": 12
    },
    "updatedItems": [
      {
        "id": "...",
        "name": "Cold Coffee",
        "oldGstRate": 18,
        "newGstRate": 12
      },
      {
        "id": "...",
        "name": "Mango Juice",
        "oldGstRate": 5,
        "newGstRate": 12
      }
    ]
  },
  "message": "Successfully updated GST rate to 12% for 12 food items"
}
```

### 2. Bulk Update GST by Category (Manager)

```http
PUT {{baseURL}}/api/v1/manager/menu/bulk-update-gst
Authorization: Bearer {{managerToken}}
Content-Type: application/json

{
  "categoryId": "YOUR_CATEGORY_ID",
  "gstRate": 18
}
```

**Note:** Manager can only update items in their assigned branch.

---

## Testing Checkout Flow

### 1. Add Items to Cart

```http
POST {{baseURL}}/api/v1/user/cart/add
Authorization: Bearer {{userToken}}
Content-Type: application/json

{
  "foodItemId": "ITEM_ID_WITH_5_PERCENT_GST",
  "quantity": 2,
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

Add multiple items with different GST rates:

```json
{
  "foodItemId": "ITEM_ID_WITH_18_PERCENT_GST",
  "quantity": 1,
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID"
}
```

### 2. View Cart

```http
GET {{baseURL}}/api/v1/user/cart
Authorization: Bearer {{userToken}}
```

**Check:** Each item should have `gstRate` field populated.

### 3. Checkout with Mixed GST Rates

```http
POST {{baseURL}}/api/v1/user/cart/checkout
Authorization: Bearer {{userToken}}
Content-Type: application/json

{
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "tableId": "YOUR_TABLE_ID",
  "paymentMethod": "cash"
}
```

#### Expected Response (Example Calculation)

```json
{
  "statusCode": 201,
  "data": {
    "order": {
      "items": [
        {
          "foodItemName": "Paneer Tikka",
          "quantity": 2,
          "price": 250,
          "totalPrice": 500,
          "gstRate": 5,
          "gstAmount": 23.81
        },
        {
          "foodItemName": "Chicken Biryani",
          "quantity": 1,
          "price": 280,
          "totalPrice": 280,
          "gstRate": 18,
          "gstAmount": 42.86
        }
      ],
      "subtotal": 780,
      "taxes": 66.67,
      "totalPrice": 846.67
    },
    "pricingBreakdown": {
      "step1_itemsSubtotal": {
        "description": "Total price of all items",
        "amount": 780,
        "currency": "₹"
      },
      "step2_afterOfferDiscount": {
        "description": "After applying offer discount",
        "offerApplied": null,
        "discountAmount": 0,
        "amountAfterOffer": 780,
        "currency": "₹"
      },
      "step3_afterCoinDiscount": {
        "description": "After applying coin discount (1 coin = ₹1)",
        "coinsUsed": 0,
        "coinDiscountAmount": 0,
        "amountAfterCoins": 780,
        "currency": "₹"
      },
      "step4_taxesAndCharges": {
        "description": "Taxes and service charges",
        "baseAmount": 780,
        "gstBreakdown": [
          {
            "item": "Paneer Tikka",
            "gstRate": "5%",
            "gstAmount": 23.81
          },
          {
            "item": "Chicken Biryani",
            "gstRate": "18%",
            "gstAmount": 42.86
          }
        ],
        "totalGst": 66.67,
        "cgst": 33.34,
        "sgst": 33.33,
        "serviceCharge": 0,
        "totalTaxesAndCharges": 66.67,
        "currency": "₹"
      },
      "step5_finalTotal": {
        "description": "Final amount to be paid",
        "calculation": "₹780 - ₹0 - ₹0 + ₹66.67 + ₹0",
        "finalAmount": 846.67,
        "currency": "₹"
      },
      "summary": {
        "originalAmount": 780,
        "totalSavings": 0,
        "taxesAndCharges": 66.67,
        "amountToPay": 846.67,
        "currency": "₹"
      }
    }
  }
}
```

### 4. Direct Order with Mixed GST

```http
POST {{baseURL}}/api/v1/manager/orders/place-direct-order
Authorization: Bearer {{managerToken}}
Content-Type: application/json

{
  "userId": "USER_ID",
  "hotelId": "YOUR_HOTEL_ID",
  "branchId": "YOUR_BRANCH_ID",
  "tableId": "YOUR_TABLE_ID",
  "items": [
    {
      "foodItemId": "ITEM_WITH_5_GST",
      "quantity": 2
    },
    {
      "foodItemId": "ITEM_WITH_18_GST",
      "quantity": 1
    }
  ],
  "paymentMethod": "cash"
}
```

---

## Invoice Generation

### Get Order Invoice

```http
GET {{baseURL}}/api/v1/user/orders/{{orderId}}/invoice
Authorization: Bearer {{userToken}}
```

**Invoice GST Display:**

When items have **multiple GST rates**:

```
GST Breakdown:
  GST @ 5%         ₹23.81
  GST @ 18%        ₹42.86

Total GST          ₹66.67
  (CGST: ₹33.34 + SGST: ₹33.33)
```

When items have **single GST rate**:

```
Total GST          ₹90.00
  (CGST: ₹45.00 + SGST: ₹45.00)
```

---

## Test Scenarios

### Scenario 1: Create Food Items with All GST Rates

**Test Case:** Verify all valid GST rates are accepted

| Item Name    | Price | GST Rate | Category    |
| ------------ | ----- | -------- | ----------- |
| Plain Rice   | ₹80   | 0%       | Staples     |
| Roti Basket  | ₹50   | 5%       | Breads      |
| Cheese Pizza | ₹350  | 12%      | Main Course |
| Paneer Tikka | ₹250  | 18%      | Starters    |
| Premium Wine | ₹2000 | 28%      | Beverages   |

**Steps:**

1. Create each item with respective GST rate
2. Verify `gstRate` is saved correctly
3. Check `gstHistory` has initial entry

**Expected:** All items created successfully with proper GST rates.

---

### Scenario 2: Invalid GST Rate Rejection

**Test Case:** Verify system rejects invalid GST rates

```json
{
  "name": "Invalid Item",
  "price": 100,
  "gstRate": 15,
  "categoryId": "...",
  "hotelId": "...",
  "branchId": "..."
}
```

**Expected Response:**

```json
{
  "statusCode": 400,
  "message": "Validation error: GST rate must be one of: 0, 5, 12, 18, 28%"
}
```

**Test with:** 10, 15, 20, 25, 30, -5, 100

---

### Scenario 3: GST Rate Change Audit Trail

**Test Case:** Verify GST history tracking

**Steps:**

1. Create item with `gstRate: 5`
2. Update to `gstRate: 12`
3. Update to `gstRate: 18`
4. Get item details

**Expected `gstHistory`:**

```json
"gstHistory": [
  {
    "rate": 5,
    "changedBy": "admin_id",
    "changedByModel": "Admin",
    "changedAt": "2026-01-16T10:00:00Z"
  },
  {
    "rate": 12,
    "changedBy": "admin_id",
    "changedByModel": "Admin",
    "changedAt": "2026-01-16T10:15:00Z"
  },
  {
    "rate": 18,
    "changedBy": "admin_id",
    "changedByModel": "Admin",
    "changedAt": "2026-01-16T10:30:00Z"
  }
]
```

---

### Scenario 4: Bulk GST Update

**Test Case:** Update entire category GST rate

**Setup:**

1. Create category "Beverages"
2. Add 10 items with various GST rates (0%, 5%, 12%, 18%)

**Action:**

```json
{
  "categoryId": "BEVERAGES_CATEGORY_ID",
  "gstRate": 12
}
```

**Expected:**

- All 10 items updated to 12% GST
- Each item has new entry in `gstHistory`
- Response shows summary with counts

---

### Scenario 5: Mixed GST Checkout

**Test Case:** Order with multiple GST rates calculates correctly

**Cart:**
| Item | Price | Qty | Subtotal | GST Rate | GST Amount |
|------|-------|-----|----------|----------|------------|
| Plain Rice | ₹80 | 2 | ₹160 | 0% | ₹0 |
| Roti Basket | ₹50 | 1 | ₹50 | 5% | ₹2.50 |
| Paneer Tikka | ₹250 | 1 | ₹250 | 18% | ₹45 |

**Expected Calculation:**

```
Subtotal:     ₹460
Total GST:    ₹47.50
CGST:         ₹23.75
SGST:         ₹23.75
Grand Total:  ₹507.50
```

---

### Scenario 6: GST with Discounts

**Test Case:** Verify GST calculated after discounts

**Order:**

- Subtotal: ₹1000
- Offer Discount: ₹200
- Coin Discount: ₹100
- Base Amount: ₹700

**Item GST Rates:**

- Item 1 (50% of value): 5% GST
- Item 2 (50% of value): 18% GST

**Expected:**

- GST calculated on ₹700 (after discounts)
- Proportional distribution: ₹350 @ 5% + ₹350 @ 18%
- Item 1 GST: ₹17.50
- Item 2 GST: ₹63.00
- Total GST: ₹80.50

---

### Scenario 7: Missing GST Rate Error

**Test Case:** Verify checkout fails if item lacks GST rate

**Setup:**

1. Manually update database to remove `gstRate` from an item (simulate old data)
2. Add that item to cart
3. Attempt checkout

**Expected Response:**

```json
{
  "statusCode": 400,
  "message": "GST rate not configured for item: [Item Name]. Please contact admin."
}
```

---

### Scenario 8: Manager Bulk Update (Branch Restricted)

**Test Case:** Manager can only update items in their branch

**Setup:**

- Manager assigned to Branch A
- Category has items in Branch A and Branch B

**Action:** Manager updates GST for category

**Expected:**

- Only Branch A items updated
- Branch B items untouched
- Response shows only Branch A items in `updatedItems`

---

### Scenario 9: Invoice GST Display

**Test Case:** Invoice shows correct GST breakdown

**Order with:**

- 2 items @ 5% GST (total: ₹10)
- 3 items @ 18% GST (total: ₹90)

**Expected Invoice Display:**

```
GST Breakdown:
  GST @ 5%         ₹10.00
  GST @ 18%        ₹90.00

Total GST          ₹100.00
  (CGST: ₹50.00 + SGST: ₹50.00)
```

---

### Scenario 10: Zero GST Items

**Test Case:** Items with 0% GST work correctly

**Cart:**

- Plain Rice @ 0% GST: ₹80

**Expected:**

```
Subtotal:     ₹80
Total GST:    ₹0
Grand Total:  ₹80
```

No GST breakdown shown in invoice.

---

## Common Errors and Solutions

### Error 1: Missing GST Rate

```json
{
  "statusCode": 400,
  "message": "Validation error: GST rate is required"
}
```

**Solution:** Add `gstRate` field to request body.

### Error 2: Invalid GST Rate

```json
{
  "statusCode": 400,
  "message": "Invalid GST rate. Must be one of: 0, 5, 12, 18, 28%"
}
```

**Solution:** Use only valid GST slab rates.

### Error 3: Category Not Found

```json
{
  "statusCode": 404,
  "message": "No food items found matching the specified criteria"
}
```

**Solution:** Verify `categoryId` exists and has items.

### Error 4: Unauthorized Bulk Update

```json
{
  "statusCode": 403,
  "message": "You don't have permission to update pricing"
}
```

**Solution:** Ensure user has `managePricing` permission.

---

## Postman Collection Variables

Set these variables in your Postman environment:

```javascript
baseURL: http://localhost:3000
adminToken: Bearer eyJhbGc...
managerToken: Bearer eyJhbGc...
userToken: Bearer eyJhbGc...
hotelId: 507f1f77bcf86cd799439011
branchId: 507f1f77bcf86cd799439012
categoryId: 507f1f77bcf86cd799439013
tableId: 507f1f77bcf86cd799439014
userId: 507f1f77bcf86cd799439015
```

---

## Quick Testing Checklist

- [ ] Create food item with 0% GST
- [ ] Create food item with 5% GST
- [ ] Create food item with 12% GST
- [ ] Create food item with 18% GST
- [ ] Create food item with 28% GST
- [ ] Try creating item with invalid GST (should fail)
- [ ] Try creating item without GST (should fail)
- [ ] Update existing item GST rate
- [ ] Verify `gstHistory` tracks changes
- [ ] Bulk update GST for entire category
- [ ] Add items with mixed GST to cart
- [ ] Checkout and verify GST breakdown in response
- [ ] Verify CGST/SGST is 50-50 split
- [ ] Test with offer discount applied
- [ ] Test with coin discount applied
- [ ] Generate invoice and check GST display
- [ ] Verify manager can only update their branch items
- [ ] Test direct order placement with mixed GST

---

## Support

For issues or questions:

1. Check that all IDs (hotelId, branchId, categoryId) are valid
2. Verify authentication token is not expired
3. Ensure user has required permissions
4. Check network/server logs for detailed error messages

---

**Testing Date:** January 16, 2026  
**Implementation Version:** Dynamic GST v1.0  
**API Base URL:** `http://localhost:3000` (update as needed)
