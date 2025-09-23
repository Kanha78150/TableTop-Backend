# Hotel Management System API Documentation

A comprehensive hotel management system with role-based access control for Admin, Manager, and Staff users.

## 🚀 Getting Started

### Base URL

```
http://localhost:8000/api/v1
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 📋 Table of Contents

- [Authentication Endpoints](#authentication-endpoints)
- [Admin Routes](#admin-routes)
- [Manager Routes](#manager-routes)
- [Staff Routes](#staff-routes)

---

## 🔐 Authentication Endpoints

### Admin Authentication

| Method   | Endpoint                      | Description                       |
| -------- | ----------------------------- | --------------------------------- |
| `POST`   | `/auth/admin/register`        | Register new admin                |
| `POST`   | `/auth/admin/login`           | Admin login                       |
| `POST`   | `/auth/admin/logout`          | Admin logout                      |
| `POST`   | `/auth/admin/forgot-password` | Forgot password                   |
| `POST`   | `/auth/admin/reset-password`  | Reset password                    |
| `POST`   | `/auth/admin/verify-email`    | Verify email                      |
| `POST`   | `/auth/admin/refresh-token`   | Refresh access token              |
| `GET`    | `/auth/admin/profile`         | Get admin profile                 |
| `PUT`    | `/auth/admin/profile`         | Update admin profile              |
| `POST`   | `/auth/admin/change-password` | Change password                   |
| `GET`    | `/auth/admin/all`             | Get all admins (Super Admin only) |
| `PUT`    | `/auth/admin/:adminId`        | Update admin (Super Admin only)   |
| `DELETE` | `/auth/admin/:adminId`        | Delete admin (Super Admin only)   |

### Manager Authentication

| Method | Endpoint                        | Description             |
| ------ | ------------------------------- | ----------------------- |
| `POST` | `/auth/manager/login`           | Manager login           |
| `POST` | `/auth/manager/logout`          | Manager logout          |
| `GET`  | `/auth/manager/profile`         | Get manager profile     |
| `PUT`  | `/auth/manager/change-password` | Change manager password |

### Staff Authentication

| Method | Endpoint                      | Description           |
| ------ | ----------------------------- | --------------------- |
| `POST` | `/auth/staff/login`           | Staff login           |
| `POST` | `/auth/staff/logout`          | Staff logout          |
| `GET`  | `/auth/staff/profile`         | Get staff profile     |
| `PUT`  | `/auth/staff/change-password` | Change staff password |

---

## 🏨 Admin Routes

**Prefix:** `/admin`

### Hotel Management

| Method   | Endpoint                            | Description               |
| -------- | ----------------------------------- | ------------------------- |
| `POST`   | `/admin/hotels`                     | Create new hotel          |
| `GET`    | `/admin/hotels`                     | Get all hotels            |
| `GET`    | `/admin/hotels/search`              | Search hotels             |
| `GET`    | `/admin/hotels/search-by-location`  | Search hotels by location |
| `GET`    | `/admin/hotels/:hotelId`            | Get hotel by ID           |
| `PUT`    | `/admin/hotels/:hotelId`            | Update hotel              |
| `DELETE` | `/admin/hotels/:hotelId`            | Delete hotel              |
| `PATCH`  | `/admin/hotels/:hotelId/deactivate` | Deactivate hotel          |
| `GET`    | `/admin/hotels/:hotelId/branches`   | Get hotel branches        |

### Branch Management

| Method   | Endpoint                             | Description                 |
| -------- | ------------------------------------ | --------------------------- |
| `POST`   | `/admin/branches`                    | Create new branch           |
| `GET`    | `/admin/branches`                    | Get all branches            |
| `GET`    | `/admin/branches/search-by-location` | Search branches by location |
| `GET`    | `/admin/branches/hotel/:hotelId`     | Get branches by hotel       |
| `GET`    | `/admin/branches/:branchId`          | Get branch by ID            |
| `PUT`    | `/admin/branches/:branchId`          | Update branch               |
| `DELETE` | `/admin/branches/:branchId`          | Delete branch               |

### User Management

| Method   | Endpoint                       | Description        |
| -------- | ------------------------------ | ------------------ |
| `GET`    | `/admin/users`                 | Get all customers  |
| `GET`    | `/admin/users/:userId`         | Get customer by ID |
| `PUT`    | `/admin/users/:userId`         | Update customer    |
| `POST`   | `/admin/users/:userId/block`   | Block customer     |
| `POST`   | `/admin/users/:userId/unblock` | Unblock customer   |
| `DELETE` | `/admin/users/:userId`         | Delete customer    |

### Manager Management

| Method   | Endpoint                                 | Description                |
| -------- | ---------------------------------------- | -------------------------- |
| `GET`    | `/admin/managers`                        | Get all managers           |
| `GET`    | `/admin/managers/:managerId`             | Get manager by ID          |
| `POST`   | `/admin/managers`                        | Create new manager         |
| `PUT`    | `/admin/managers/:managerId`             | Update manager             |
| `DELETE` | `/admin/managers/:managerId`             | Delete manager             |
| `PUT`    | `/admin/managers/:managerId/permissions` | Update manager permissions |

### Staff Management

| Method   | Endpoint                               | Description             |
| -------- | -------------------------------------- | ----------------------- |
| `GET`    | `/admin/staff`                         | Get all staff           |
| `POST`   | `/admin/staff`                         | Create new staff        |
| `PUT`    | `/admin/staff/:staffId`                | Update staff            |
| `DELETE` | `/admin/staff/:staffId`                | Delete staff            |
| `PUT`    | `/admin/staff/:staffId/assign-manager` | Assign staff to manager |
| `GET`    | `/admin/managers/:managerId/staff`     | Get staff by manager    |

### Menu Management

| Method   | Endpoint                             | Description              |
| -------- | ------------------------------------ | ------------------------ |
| `GET`    | `/admin/menu/categories`             | Get all food categories  |
| `POST`   | `/admin/menu/categories`             | Create food category     |
| `PUT`    | `/admin/menu/categories/:categoryId` | Update category          |
| `DELETE` | `/admin/menu/categories/:categoryId` | Delete category          |
| `GET`    | `/admin/menu/items`                  | Get all food items       |
| `POST`   | `/admin/menu/items`                  | Create food item         |
| `PUT`    | `/admin/menu/items/:itemId`          | Update food item         |
| `DELETE` | `/admin/menu/items/:itemId`          | Delete food item         |
| `PATCH`  | `/admin/menu/items/availability`     | Update item availability |

### Offers Management

| Method   | Endpoint                 | Description      |
| -------- | ------------------------ | ---------------- |
| `GET`    | `/admin/offers`          | Get all offers   |
| `POST`   | `/admin/offers`          | Create new offer |
| `PUT`    | `/admin/offers/:offerId` | Update offer     |
| `DELETE` | `/admin/offers/:offerId` | Delete offer     |

### Analytics & Reports

| Method | Endpoint                      | Description              |
| ------ | ----------------------------- | ------------------------ |
| `GET`  | `/admin/dashboard`            | Get dashboard overview   |
| `GET`  | `/admin/reports/sales`        | Get sales report         |
| `GET`  | `/admin/reports/profit-loss`  | Get profit & loss report |
| `GET`  | `/admin/analytics/customers`  | Get customer analytics   |
| `GET`  | `/admin/reports/best-sellers` | Get best selling items   |

---

## 👨‍💼 Manager Routes

**Prefix:** `/manager`

### Dashboard & Profile

| Method | Endpoint                   | Description            |
| ------ | -------------------------- | ---------------------- |
| `GET`  | `/manager/dashboard`       | Get manager dashboard  |
| `GET`  | `/manager/analytics`       | Get branch analytics   |
| `GET`  | `/manager/profile`         | Get manager profile    |
| `PUT`  | `/manager/profile`         | Update manager profile |
| `PUT`  | `/manager/change-password` | Change password        |

### Staff Management

| Method   | Endpoint                              | Description              |
| -------- | ------------------------------------- | ------------------------ |
| `POST`   | `/manager/staff`                      | Create new staff         |
| `GET`    | `/manager/staff`                      | Get all staff            |
| `GET`    | `/manager/staff/:staffId`             | Get staff by ID          |
| `PUT`    | `/manager/staff/:staffId`             | Update staff             |
| `DELETE` | `/manager/staff/:staffId`             | Delete staff             |
| `PUT`    | `/manager/staff/:staffId/permissions` | Update staff permissions |
| `PUT`    | `/manager/staff/:staffId/status`      | Update staff status      |
| `GET`    | `/manager/staff/:staffId/performance` | Get staff performance    |
| `PUT`    | `/manager/staff/:staffId/performance` | Update staff performance |
| `POST`   | `/manager/staff/:staffId/training`    | Add staff training       |
| `GET`    | `/manager/staff/:staffId/schedule`    | Get staff schedule       |
| `PUT`    | `/manager/staff/:staffId/schedule`    | Update staff schedule    |

### Menu Management

| Method   | Endpoint                                   | Description              |
| -------- | ------------------------------------------ | ------------------------ |
| `GET`    | `/manager/menu/items`                      | Get menu items           |
| `POST`   | `/manager/menu/items`                      | Add menu item            |
| `PUT`    | `/manager/menu/items/:itemId`              | Update menu item         |
| `DELETE` | `/manager/menu/items/:itemId`              | Delete menu item         |
| `PUT`    | `/manager/menu/items/:itemId/availability` | Update item availability |
| `GET`    | `/manager/menu/categories`                 | Get food categories      |
| `POST`   | `/manager/menu/categories`                 | Add food category        |
| `PUT`    | `/manager/menu/categories/:categoryId`     | Update category          |
| `DELETE` | `/manager/menu/categories/:categoryId`     | Delete category          |

### Order Management

| Method | Endpoint                                   | Description           |
| ------ | ------------------------------------------ | --------------------- |
| `GET`  | `/manager/orders`                          | Get all orders        |
| `GET`  | `/manager/orders/:orderId`                 | Get order details     |
| `PUT`  | `/manager/orders/:orderId/status`          | Update order status   |
| `GET`  | `/manager/orders/status/:status`           | Get orders by status  |
| `GET`  | `/manager/orders/analytics/summary`        | Get order analytics   |
| `GET`  | `/manager/kitchen/orders`                  | Get kitchen orders    |
| `PUT`  | `/manager/orders/:orderId/assign/:staffId` | Assign order to staff |

### Table & Reservation Management

| Method   | Endpoint                               | Description         |
| -------- | -------------------------------------- | ------------------- |
| `GET`    | `/manager/tables`                      | Get all tables      |
| `POST`   | `/manager/tables`                      | Create table        |
| `PUT`    | `/manager/tables/:tableId`             | Update table        |
| `DELETE` | `/manager/tables/:tableId`             | Delete table        |
| `GET`    | `/manager/tables/status`               | Get table status    |
| `PUT`    | `/manager/tables/:tableId/status`      | Update table status |
| `GET`    | `/manager/reservations`                | Get reservations    |
| `POST`   | `/manager/reservations`                | Create reservation  |
| `PUT`    | `/manager/reservations/:reservationId` | Update reservation  |
| `DELETE` | `/manager/reservations/:reservationId` | Cancel reservation  |

### Complaint Management

| Method | Endpoint                                           | Description               |
| ------ | -------------------------------------------------- | ------------------------- |
| `GET`  | `/manager/complaints`                              | Get all complaints        |
| `GET`  | `/manager/complaints/:complaintId`                 | Get complaint details     |
| `PUT`  | `/manager/complaints/:complaintId/status`          | Update complaint status   |
| `PUT`  | `/manager/complaints/:complaintId/assign/:staffId` | Assign complaint to staff |
| `POST` | `/manager/complaints/:complaintId/response`        | Add complaint response    |
| `GET`  | `/manager/complaints/analytics/summary`            | Get complaint analytics   |

---

Authorization: Bearer <jwt_token>
Content-Type: application/json

👨‍💼 ADMIN ENDPOINTS
🗂️ Food Categories Management

1. Get All Food Categories
   GET {{baseUrl}}/api/v1/admin/menu/categories

Query Parameters:
?page=1&limit=10&search=appetizer&branchId=<branch_id>&sortBy=createdAt&sortOrder=desc

2. Create Food Category
   POST {{baseUrl}}/api/v1/admin/menu/categories
   {
   "name": "Appetizers",
   "description": "Delicious starters and appetizers",
   "type": "both",
   "branch": "6507f1f77bcf86cd799439011",
   "hotel": "6507f1f77bcf86cd799439012",
   "isActive": true,
   "displayOrder": 1,
   "image": "https://example.com/appetizers.jpg",
   "tags": ["starter", "appetizer", "snacks"],
   "availableTimings": {
   "breakfast": false,
   "lunch": true,
   "dinner": true,
   "snacks": true
   }
   }

3. Update Food Category
   PUT {{baseUrl}}/api/v1/admin/menu/categories/:categoryId

{
"name": "Updated Appetizers",
"description": "Updated description",
"isActive": false,
"displayOrder": 2
}

4. Delete Food Category
   DELETE {{baseUrl}}/api/v1/admin/menu/categories/:categoryId

🍽️ Food Items Management

5. Get All Food Items
   GET {{baseUrl}}/api/v1/admin/menu/items

6. Create Food Item
   POST {{baseUrl}}/api/v1/admin/menu/items

{
"name": "Chicken Burger",
"description": "Juicy grilled chicken burger with fresh vegetables",
"shortDescription": "Grilled chicken burger",
"price": 299,
"discountPrice": 249,
"foodType": "non-veg",
"spiceLevel": "medium",
"category": "6507f1f77bcf86cd799439015",
"branch": "6507f1f77bcf86cd799439011",
"hotel": "6507f1f77bcf86cd799439012",
"isAvailable": true,
"isRecommended": true,
"isBestSeller": false,
"availableTimings": {
"breakfast": false,
"lunch": true,
"dinner": true,
"snacks": false
},
"dietaryInfo": {
"glutenFree": false,
"dairyFree": false,
"nutFree": true,
"sugarFree": false,
"organic": false
},
"nutritionalInfo": {
"calories": 450,
"protein": 25,
"carbs": 35,
"fat": 18,
"fiber": 3,
"sodium": 800
},
"preparationTime": 15,
"servingSize": "1 burger",
"ingredients": ["chicken breast", "burger bun", "lettuce", "tomato", "mayo"],
"allergens": ["gluten", "dairy"],
"tags": ["burger", "chicken", "grilled"],
"image": "https://example.com/chicken-burger.jpg",
"images": [
"https://example.com/chicken-burger-1.jpg",
"https://example.com/chicken-burger-2.jpg"
],
"displayOrder": 1,
"isLimitedQuantity": false,
"quantityAvailable": null
}

7. Update Food Item
   PUT {{baseUrl}}/api/v1/admin/menu/items/:itemId

8. Delete Food Item
   DELETE {{baseUrl}}/api/v1/admin/menu/items/:itemId

9. Bulk Update Food Item Availability
   PATCH {{baseUrl}}/api/v1/admin/menu/items/availability
