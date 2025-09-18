---

## 🔧 **Environment Setup**

### **Postman Environment Variables**

```
// Base Configuration
base_url: http://localhost:8000
api_version: /api/v1

// Authentication Tokens
super_admin_token: {{obtained_from_login}}
manager_token: {{obtained_from_login}}
staff_token: {{obtained_from_login}}
refresh_token: {{obtained_from_refresh}}
```

// Auto-Generated Entity IDs (will be populated after creation)
hotel_id: {{auto_generated_hotel_id}}
branch_id: {{auto_generated_branch_id}}
manager_id: {{auto_generated_manager_id}}
staff_id: {{auto_generated_staff_id}}
user_id: {{user_object_id}}
table_id: {{table_object_id}}
order_id: {{order_object_id}}
menu_item_id: {{menu_item_object_id}}
category_id: {{category_object_id}}
complaint_id: {{complaint_object_id}}
reservation_id: {{reservation_object_id}}

```

---

## 🔐 **Authentication Endpoints**

### **1. Super Admin Bootstrap (One-time System Setup)**

```http
POST {{base_url}}{{api_version}}/auth/admin/bootstrap
Content-Type: application/json
{
  "name": "System Administrator",
  "email": "superadmin@hotel.com",
  "password": "SuperAdmin@123",
  "phone": "9876543210",
  "department": "system"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "admin": {
      "name": "System Administrator",
      "email": "superadmin@hotel.com",
      "role": "super_admin",
      "employeeId": "SUPER001",
      "_id": "auto_generated_id"
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  },
  "message": "Super Admin bootstrap completed successfully"
}
```

### **2. Super Admin Login**

```http
POST {{base_url}}{{api_version}}/auth/admin/login
Content-Type: application/json

{
  "email": "superadmin@hotel.com",
  "password": "SuperAdmin@123"
}
```

### **3. Branch Manager Login**

```http
POST {{base_url}}{{api_version}}/auth/manager/login
Content-Type: application/json

{
  "email": "manager@hotel.com",
  "password": "Manager@123"
}
```

### **4. Staff Login**

```http
POST {{base_url}}{{api_version}}/auth/staff/login
Content-Type: application/json

{
  "email": "staff@hotel.com",
  "password": "Staff@123"
}
```

### **5. User Login**

```http
POST {{base_url}}{{api_version}}/auth/user/login
Content-Type: application/json

{
"email": "user@email.com",
"password": "User@123"
}
```

### **\*6. Logout (All Roles)**

```http
POST {{base_url}}{{api_version}}/auth/admin/logout
Authorization: Bearer {{super_admin_token}}

POST {{base_url}}{{api_version}}/auth/manager/logout
Authorization: Bearer {{manager_token}}

POST {{base_url}}{{api_version}}/auth/staff/logout
Authorization: Bearer {{staff_token}}
```

### **7. Refresh Token**

```http
POST {{base_url}}{{api_version}}/auth/admin/refresh-token
Content-Type: application/json
```

## 🏢 **Super Admin Endpoints**

### **Profile Management**

#### **Get Profile**

```http
GET {{base_url}}{{api_version}}/auth/admin/profile
Authorization: Bearer {{super_admin_token}}
```

#### **Update Profile**

```http
PUT {{base_url}}{{api_version}}/auth/admin/profile
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "name": "Updated Admin Name",
  "phone": "9876543211"
}
```

#### **Change Password**

```http
PUT {{base_url}}{{api_version}}/auth/admin/change-password
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "currentPassword": "SuperAdmin@123",
  "newPassword": "NewPassword@456",
  "confirmPassword": "NewPassword@456"
}
```

### **Hotel Management**

#### **Create Hotel (Auto-Generated Hotel ID)**

```http
POST {{base_url}}{{api_version}}/admin/hotels
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

{
"name": "Grand Hotel Chain",
"description": "Luxury hotel chain with premium services",
"mainLocation": {
"address": "123 Business District",
"city": "Mumbai",
"state": "Maharashtra",
"country": "India",
"pincode": "400001",
"coordinates": {
"latitude": 19.0760,
"longitude": 72.8777
}
},
"contactInfo": {
"phone": "9876543210",
"email": "info@grandhotel.com",
"website": "https://grandhotel.com"
},
"amenities": ["WiFi", "Restaurant", "Spa", "Gym", "Pool"],
"starRating": 5,
"establishedYear": 2020
}

```

```

**Response:**

```json
{
  "success": true,
  "data": {
    "hotel": {
      "hotelId": "HTL-2025-00001",
      "name": "Grand Hotel Chain",
      "description": "Luxury hotel chain with premium services",
      "mainLocation": {...},
      "contactInfo": {...},
      "amenities": [...],
      "starRating": 5,
      "_id": "auto_generated_object_id"
    }
  },
  "message": "Hotel created successfully"
}
```

#### **Get All Hotels**

```http
GET {{base_url}}{{api_version}}/admin/hotels
Authorization: Bearer {{super_admin_token}}
```

#### **Get Hotel by ID**

```http
GET {{base_url}}{{api_version}}/admin/hotels/{{hotel_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Update Hotel**

```http
PUT {{base_url}}{{api_version}}/admin/hotels/{{hotel_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "name": "Updated Hotel Name",
  "description": "Updated description",
  "starRating": 5
}
```

#### **Delete Hotel (Hard Delete)**

```http
DELETE {{base_url}}{{api_version}}/admin/hotels/{{hotel_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Deactivate Hotel (Soft Delete)**

```http
PATCH {{base_url}}{{api_version}}/admin/hotels/{{hotel_id}}/deactivate
Authorization: Bearer {{super_admin_token}}
```

### **Branch Management**

#### **Create Branch (Auto-Generated Branch ID)**

```http
POST {{base_url}}{{api_version}}/admin/branches
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
"name": "Grand Hotel Mumbai Central",
"hotel": "{{hotel_id}}",
"location": {
"address": "Central Plaza, Near Railway Station",
"city": "Mumbai",
"state": "Maharashtra",
"country": "India",
"pincode": "400008",
"coordinates": {
"latitude": 19.0760,
"longitude": 72.8777
}
},
"contactInfo": {
"phone": "9876543211",
"email": "mumbai@grandhotel.com"
},
"facilities": ["WiFi", "Restaurant", "Parking", "AC"],
"capacity": {
"rooms": 100,
"tables": 50,
"maxOccupancy": 200
},
"operatingHours": {
"open": "06:00",
"close": "23:00"
}
}

```

**Response:**

```json
{
  "success": true,
  "data": {
    "branch": {
      "branchId": "BRN-HTL001-00001",
      "name": "Grand Hotel Mumbai Central",
      "hotel": "{{hotel_id}}",
      "location": {...},
      "contactInfo": {...},
      "_id": "auto_generated_object_id"
    }
  },
  "message": "Branch created successfully"
}
```

#### **Get All Branches**

```http
GET {{base_url}}{{api_version}}/admin/branches
Authorization: Bearer {{super_admin_token}}
```

#### **Get Branch by ID**

```http
GET {{base_url}}{{api_version}}/admin/branches/{{branch_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Update Branch**

```http
PUT {{base_url}}{{api_version}}/admin/branches/{{branch_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "name": "Updated Branch Name",
  "status": "active",
  "capacity": {
    "rooms": 120,
    "tables": 60,
    "maxOccupancy": 250
  }
}
```

#### **Delete Branch**

```http
DELETE {{base_url}}{{api_version}}/admin/branches/{{branch_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Get Branches by Hotel**

```http
GET {{base_url}}{{api_version}}/admin/branches/hotel/{{hotel_id}}
Authorization: Bearer {{super_admin_token}}
```

### **Manager Management (Hotel-Branch Hierarchy)**

#### **Create Manager (Auto-Generated Employee ID)**

```http
POST {{base_url}}{{api_version}}/admin/managers
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
"name": "John Manager",
"email": "john.manager@hotel.com",
"phone": "9876543212",
"password": "Manager@123",
"hotelId": "{{hotel_id}}",
"branchId": "{{branch_id}}",
"department": "operations",
"permissions": {
"manageStaff": true,
"viewStaff": true,
"manageMenu": true,
"updateMenuItems": true,
"processOrders": true,
"updateOrderStatus": true,
"viewOrders": true,
"manageReservations": true,
"manageTables": true,
"handleComplaints": true,
"viewFeedback": true,
"viewReports": true,
"viewBranchAnalytics": true,
"internalChat": true
},
"emergencyContact": {
"name": "Jane Manager",
"phone": "9876543213",
"relationship": "Spouse"
}
}

```

**Response:**

````json
{
  "success": true,
  "data": {
    "manager": {
      "employeeId": "MGR-2025-00001",
      "name": "John Manager",
      "email": "john.manager@hotel.com",
      "hotel": "{{hotel_id}}",
      "branch": "{{branch_id}}",
      "department": "operations",
      "_id": "auto_generated_object_id"
    }
  },
  "message": "Manager created successfully"
}
#### **Get All Managers**
```http
GET {{base_url}}{{api_version}}/admin/managers
Authorization: Bearer {{super_admin_token}}
````

#### **Get Manager by ID**

```http
GET {{base_url}}{{api_version}}/admin/managers/{{manager_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Update Manager**

```http
PUT {{base_url}}{{api_version}}/admin/managers/{{manager_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json


{
  "name": "Updated Manager Name",
  "department": "management",
  "phone": "9876543214"
}
```

#### **Update Manager Permissions**

```http
PUT {{base_url}}{{api_version}}/admin/managers/{{manager_id}}/permissions
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "permissions": {
    "manageStaff": true,
    "manageMenu": false,
    "processOrders": true,
    "viewBranchAnalytics": true
  }
}
```

#### **Delete Manager**

```http
DELETE {{base_url}}{{api_version}}/admin/managers/{{manager_id}}
Authorization: Bearer {{super_admin_token}}
```

### **Staff Management (Admin-Controlled)**

#### **Create Staff (Auto-Generated Staff ID)**

```http
POST {{base_url}}{{api_version}}/admin/staff
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "name": "Alice Waiter",
  "email": "alice@hotel.com",
  "phone": "9876543217",
  "password": "Staff@123",
  "role": "waiter",
  "department": "service",
  "hotelId": "{{hotel_id}}",
  "branchId": "{{branch_id}}",
  "managerId": "{{manager_id}}",
  "permissions": {
    "takeOrders": true,
    "updateOrderStatus": true,
    "viewOrders": true,
    "manageTableStatus": true,
    "viewTableReservations": true,
     "viewMenu": true,
    "suggestMenuItems": true,
    "handleComplaints": true,
    "accessCustomerInfo": true,
    "internalChat": true,
    "emergencyAlerts": true
  },
  "emergencyContact": {
    "name": "Emergency Contact",
    "phone": "9876543218",
    "relationship": "Parent"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "staff": {
      "staffId": "STF-2025-00001",
      "name": "Alice Waiter",
      "email": "alice@hotel.com",
      "role": "waiter",
      "hotel": "{{hotel_id}}",
      "branch": "{{branch_id}}",
      "manager": "{{manager_id}}",
      "_id": "auto_generated_object_id"
    }
  },
  "message": "Staff created successfully"
}
```

#### **Assign Staff to Manager (Admin Only)**

```http
PUT {{base_url}}{{api_version}}/admin/staff/{{staff_id}}/assign-manager
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "managerId": "{{manager_id}}"
}
```

#### **Get Staff by Manager**

```http
GET {{base_url}}{{api_version}}/admin/managers/{{manager_id}}/staff
Authorization: Bearer {{super_admin_token}}
```

#### **Get All Staff**

```http
GET {{base_url}}{{api_version}}/admin/staff
Authorization: Bearer {{super_admin_token}}
```

#### **Update Staff**

```http
PUT {{base_url}}{{api_version}}/admin/staff/{{staff_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "name": "Updated Staff Name",
  "phone": "9876543219",
  "department": "kitchen"
}
```

#### **Update Staff Permissions**

```http
PUT {{base_url}}{{api_version}}/admin/staff/{{staff_id}}/permissions
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

{
  "permissions": {
    "takeOrders": true,
    "updateOrderStatus": true,
    "manageTableStatus": false,
    "processPayments": true
  }
}
```

### **User Management**

#### **Get All Users**

```http
GET {{base_url}}{{api_version}}/admin/users
Authorization: Bearer {{super_admin_token}}
```

#### **Search Users**

```http
GET {{base_url}}{{api_version}}/admin/users?search=john&status=active&page=1&limit=10
Authorization: Bearer {{super_admin_token}}
```

#### **Update User**

```http
PUT {{base_url}}{{api_version}}/admin/users/{{user_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

{
"name": "Updated User Name",
"email": "updated@email.com"
}

````
#### **Delete User**
```http
DELETE {{base_url}}{{api_version}}/admin/users/{{user_id}}
Authorization: Bearer {{super_admin_token}}
````

### **Analytics & Reports**

#### **System Overview**

```http
GET {{base_url}}{{api_version}}/admin/analytics
Authorization: Bearer {{super_admin_token}}
```

#### **Branch Performance**

```http
GET {{base_url}}{{api_version}}/admin/analytics/branches
Authorization: Bearer {{super_admin_token}}
```

#### **Manager Performance**

```http
GET {{base_url}}{{api_version}}/admin/analytics/managers
Authorization: Bearer {{super_admin_token}}
```

---

## 👨‍💼 **Branch Manager Endpoints**

### **Dashboard & Profile**

#### **Get Dashboard**

```http
GET {{base_url}}{{api_version}}/manager/dashboard
Authorization: Bearer {{manager_token}}
```

#### **Get Profile**

```http
GET {{base_url}}{{api_version}}/manager/profile
Authorization: Bearer {{manager_token}}
```

#### **Update Profile**

```http
PUT {{base_url}}{{api_version}}/manager/profile
Authorization: Bearer {{manager_token}}
Content-Type: application/json
{
  "name": "Updated Manager Name",
  "phone": "9876543215",
  "emergencyContact": {
    "name": "Emergency Contact",
    "phone": "9876543216",
    "relationship": "Friend"
  }
}
```

### **Staff Viewing (Manager Cannot Assign/Reassign)**

#### **View Staff Under Management**

```http
GET {{base_url}}{{api_version}}/manager/staff
Authorization: Bearer {{manager_token}}
```

#### **View Staff Details**

```http
GET {{base_url}}{{api_version}}/manager/staff/{{staff_id}}
Authorization: Bearer {{manager_token}}
```

#### **Update Staff Performance**

```http
PUT {{base_url}}{{api_version}}/manager/staff/{{staff_id}}/performance
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "performanceRating": 4,
  "feedback": "Excellent service quality",
  "goals": "Focus on upselling techniques"
}
```

### **Menu Management**

#### **Get Menu Items**

```http
GET {{base_url}}{{api_version}}/manager/menu/items
Authorization: Bearer {{manager_token}}
```

#### **Add Menu Item**

```http
POST {{base_url}}{{api_version}}/manager/menu/items
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "name": "Butter Chicken",
  "description": "Creamy tomato-based chicken curry with aromatic spices",
  "price": 450,
  "category": "{{category_id}}",
  "ingredients": ["chicken", "tomatoes", "cream", "butter", "spices"],
  "isVegetarian": false,
  "isVegan": false,
  "isGlutenFree": false,
  "isAvailable": true,
  "preparationTime": 20,
  "calories": 380,
  "spiceLevel": "medium"
}
```

#### **Update Menu Item**

```http
PUT {{base_url}}{{api_version}}/manager/menu/items/{{item_id}}
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "name": "Updated Item Name",
  "price": 500,
  "isAvailable": false
}
```

#### **Add Food Category**

```http
POST {{base_url}}{{api_version}}/manager/menu/categories
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "name": "Main Course",
  "description": "Primary dishes including rice, curry, and breads",
  "isActive": true,
  "sortOrder": 2
}
```

### **Order Management**

#### **Get All Orders**

```http
GET {{base_url}}{{api_version}}/manager/orders
Authorization: Bearer {{manager_token}}
```

#### **Update Order Status**

```http
PUT {{base_url}}{{api_version}}/manager/orders/{{order_id}}/status
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "status": "preparing",
  "notes": "Special dietary requirements noted",
  "estimatedTime": 25
}
```

#### **Get Kitchen Orders**

```http
GET {{base_url}}{{api_version}}/manager/kitchen/orders
Authorization: Bearer {{manager_token}}
```

### **Table & Reservation Management**

#### **Get All Tables**

```http
GET {{base_url}}{{api_version}}/manager/tables
Authorization: Bearer {{manager_token}}
```

#### **Create Table**

````http
POST {{base_url}}{{api_version}}/manager/tables
Authorization: Bearer {{manager_token}}
Content-Type: application/json
#### **Create Table**
```http
POST {{base_url}}{{api_version}}/manager/tables
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "tableNumber": "T001",
  "capacity": 4,
  "location": "Main Hall",
  "status": "available",
  "features": ["window_view", "wheelchair_accessible"]
}
````

#### **Update Table Status**

```http
PUT {{base_url}}{{api_version}}/manager/tables/{{table_id}}/status
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "status": "occupied",
  "notes": "VIP customer, special attention required"
}
```

#### **Create Reservation**

```http
POST {{base_url}}{{api_version}}/manager/reservations
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "customerName": "John Doe",
  "customerPhone": "9876543220",
  "customerEmail": "john@email.com",
  "tableId": "{{table_id}}",
  "reservationDate": "2025-01-15",
  "reservationTime": "19:30",
  "partySize": 4,
  "specialRequests": "Window seat preferred, birthday celebration"
}
```

### **Complaint Management**

#### **Get All Complaints**

```http
GET {{base_url}}{{api_version}}/manager/complaints
Authorization: Bearer {{manager_token}}
```

#### **Update Complaint Status**

```http
PUT {{base_url}}{{api_version}}/manager/complaints/{{complaint_id}}/status
Authorization: Bearer {{manager_token}}
Content-Type: application/json
{
  "status": "in_progress",
  "priority": "high",
  "notes": "Immediate attention required"
}
```

#### **Add Complaint Response**

```http
POST {{base_url}}{{api_version}}/manager/complaints/{{complaint_id}}/response
Authorization: Bearer {{manager_token}}
Content-Type: application/json

{
  "response": "We sincerely apologize for the inconvenience. We have taken immediate action.",
  "actionTaken": "Spoke with kitchen staff and provided additional training",
  "resolutionTime": "2025-01-15T10:30:00Z"
}
```

---

## 👨‍🍳 **Staff Endpoints**

### **Dashboard & Profile**

#### **Get Dashboard**

```http
GET {{base_url}}{{api_version}}/staff/dashboard
Authorization: Bearer {{staff_token}}
```

#### **Get Profile**

```http
GET {{base_url}}{{api_version}}/staff/profile
Authorization: Bearer {{staff_token}}
```

#### **Update Profile**

```http
PUT {{base_url}}{{api_version}}/staff/profile
Authorization: Bearer {{staff_token}}
Content-Type: application/json

{
  "name": "Updated Staff Name",
  "phone": "9876543221",
  "emergencyContact": {
    "name": "Updated Emergency Contact",
    "phone": "9876543222",
    "relationship": "Sibling"
  }
}
```

### **Order Management**

#### **Get Assigned Orders**

```http
GET {{base_url}}{{api_version}}/staff/orders
Authorization: Bearer {{staff_token}}
```

#### **Take New Order**

````http
POST {{base_url}}{{api_version}}/staff/orders
Authorization: Bearer {{staff_token}}
Content-Type: application/json

{
  "tableId": "{{table_id}}",
  "customerInfo": {
    "name": "Customer Name",
        "phone": "9876543223",
    "email": "customer@email.com"
  },
  "items": [
    {
      "menuItem": "{{item_id}}",
      "quantity": 2,
      "specialInstructions": "Extra spicy, no onions",
      "price": 450
    }
  ],
  "notes": "Customer celebrating anniversary"
}
#### **Update Order Status**
```http
PUT {{base_url}}{{api_version}}/staff/orders/{{order_id}}/status
Authorization: Bearer {{staff_token}}
Content-Type: application/json

{
  "status": "served",
  "notes": "Customer satisfied with the meal",
  "servedAt": "2025-01-15T12:30:00Z"
}
````

### **Table Management**

#### **Get Assigned Tables**

```http
GET {{base_url}}{{api_version}}/staff/tables
Authorization: Bearer {{staff_token}}
```

#### **Update Table Status**

```http
PUT {{base_url}}{{api_version}}/staff/tables/{{table_id}}/status
Authorization: Bearer {{staff_token}}
Content-Type: application/json

{
  "status": "cleaning",
  "notes": "Table needs thorough cleaning after large party"
}
```

### **Kitchen Operations**

#### **Get Kitchen Orders**

```http
GET {{base_url}}{{api_version}}/staff/kitchen/orders
Authorization: Bearer {{staff_token}}
```

#### **Update Kitchen Order Status**

```http
PUT {{base_url}}{{api_version}}/staff/kitchen/orders/{{order_id}}/status
Authorization: Bearer {{staff_token}}

Content-Type: application/json
{
  "status": "cooking",
  "estimatedTime": 15,
  "notes": "All ingredients prepared, cooking started"
}
```

### **Customer Service**

#### **Handle Customer Complaint**

```http
POST {{base_url}}{{api_version}}/staff/complaints
Authorization: Bearer {{staff_token}}
Content-Type: application/json

{
  "customerId": "{{customer_id}}",
  "tableId": "{{table_id}}",
  "orderId": "{{order_id}}",
  "type": "food_quality",
  "description": "Customer reported food was too cold",
  "priority": "medium",
  "reportedBy": "{{staff_id}}"
}
```

---

## 🔍 **Search Endpoints**

### **Hotel Searches**

#### **Simple Hotel Search**

```http
GET {{base_url}}{{api_version}}/admin/hotels/search?city=New York&state=NY&name=Grand
Authorization: Bearer {{super_admin_token}}
```

#### **Advanced Hotel Location Search**

```http
GET {{base_url}}{{api_version}}/admin/hotels/search-by-location?city=New York&latitude=40.7128&longitude=-74.0060&radius=25
Authorization: Bearer {{super_admin_token}}
```

#### **User Hotel Search**

```http
GET {{base_url}}{{api_version}}/user/hotels/search-nearby?city=New York&latitude=40.7128&longitude=-74.0060&radius=25
```

### **Branch Searches**

#### **Search Branches by Location**

```http
GET {{base_url}}{{api_version}}/admin/branches/search-by-location?city=New York&state=NY
Authorization: Bearer {{super_admin_token}}
```

#### **Get Branches by Hotel**

```http
GET {{base_url}}{{api_version}}/admin/branches/hotel/{{hotel_id}}?city=New York
Authorization: Bearer {{super_admin_token}}
```

### **Staff & Management Searches**

#### **Search Users**

```http
GET {{base_url}}{{api_version}}/admin/users?search=john&status=active&page=1&limit=10
Authorization: Bearer {{super_admin_token}}
```

#### **Search Managers**

```http
GET {{base_url}}{{api_version}}/admin/managers?search=john&status=active&branch={{branch_id}}
Authorization: Bearer {{super_admin_token}}
```

#### **Search Staff**

```http
GET {{base_url}}{{api_version}}/admin/staff?search=alice&role=waiter&branch={{branch_id}}
Authorization: Bearer {{super_admin_token}}
```

### **Menu Searches**

#### **Search Menu Items**

```http
GET {{base_url}}{{api_version}}/manager/menu/items?search=chicken&category={{category_id}}&isVeg=false
Authorization: Bearer {{manager_token}}
```

#### **Search Food Categories**

```http
GET {{base_url}}{{api_version}}/manager/menu/categories?search=main&status=active
Authorization: Bearer {{manager_token}}
```
