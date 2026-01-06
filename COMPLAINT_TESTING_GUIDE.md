# Complaint Management System - Complete Testing Guide

## 📋 Table of Contents
1. [Environment Setup](#environment-setup)
2. [Authentication Setup](#authentication-setup)
3. [User Endpoints (7)](#user-endpoints)
4. [Staff Endpoints (4)](#staff-endpoints)
5. [Manager Endpoints (7)](#manager-endpoints)
6. [Admin Endpoints (9)](#admin-endpoints)
7. [Test Scenarios](#test-scenarios)
8. [Socket.IO Testing](#socketio-testing)
9. [Expected Behaviors](#expected-behaviors)

---

## 🔧 Environment Setup

### Base URL
```
http://localhost:5000/api/v1
```

### Required Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {{token}}"
}
```

### File Upload Headers
```json
{
  "Content-Type": "multipart/form-data",
  "Authorization": "Bearer {{token}}"
}
```

---

## 🔐 Authentication Setup

### 1. Login as User
**Endpoint:** `POST /auth/login`
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response:** Save `token` as `{{userToken}}`

### 2. Login as Staff
**Endpoint:** `POST /auth/staff/login`
```json
{
  "email": "staff@example.com",
  "password": "password123"
}
```
**Response:** Save `token` as `{{staffToken}}`

### 3. Login as Manager
**Endpoint:** `POST /auth/manager/login`
```json
{
  "email": "manager@example.com",
  "password": "password123"
}
```
**Response:** Save `token` as `{{managerToken}}`

### 4. Login as Admin
**Endpoint:** `POST /auth/admin/login`
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```
**Response:** Save `token` as `{{adminToken}}`

---

## 👤 User Endpoints

### 1. Submit New Complaint
**Endpoint:** `POST /user/complaints`  
**Auth:** Bearer `{{userToken}}`  
**Content-Type:** `multipart/form-data`

**Form Data:**
```
title: "Food not served on time"
description: "Ordered food 45 minutes ago, still waiting. Very disappointed with the service."
category: "service_quality"
priority: "high"
orderId: "673abc123def456789"
requestRefund: true
refundAmount: 500
refundReason: "Unacceptable delay in service"
attachments: [File1, File2, File3] (max 5 files, 5MB each)
```

**Categories:**
- `service`
- `food_quality`
- `cleanliness`
- `staff_behavior`
- `billing_issue`
- `facility_issue`
- `delay`
- `other`

**Priorities:**
- `low`
- `medium`
- `high`
- `urgent`

**Success Response (201):**
```json
{
  "success": true,
  "message": "Complaint submitted successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "title": "Food not served on time",
      "description": "Ordered food 45 minutes ago...",
      "category": "service_quality",
      "priority": "high",
      "status": "pending",
      "attachments": [
        {
          "url": "https://cloudinary.com/...",
          "publicId": "complaints/xxx",
          "uploadedAt": "2026-01-03T10:30:00.000Z"
        }
      ],
      "user": "userId123",
      "hotel": "hotelId456",
      "branch": "branchId789",
      "order": "673abc123def456789",
      "refundRequest": "refundId999",
      "createdAt": "2026-01-03T10:30:00.000Z"
    }
  }
}
```

**🔔 Socket.IO Notification (Manager):**
After submitting, **Manager of the branch** receives real-time notification:
```json
Event: "complaint:new"
Data: {
  "complaint": {
    "complaintId": "CMP-001",
    "title": "Food not served on time",
    "priority": "high",
    "category": "service_quality",
    "user": { "name": "John Doe", "email": "user@example.com" }
  }
}
```
**🧪 Postman Test:** Open WebSocket connection as Manager, submit complaint as User, verify Manager receives notification

**Error Responses:**
- `400` - Validation error (missing required fields)
- `404` - Order not found
- `401` - Unauthorized (no token)

---

### 2. Get My Complaints
**Endpoint:** `GET /user/complaints`  
**Auth:** Bearer `{{userToken}}`

**Query Parameters:**
```
?status=pending
&priority=high
&category=service_quality
&search=food
&page=1
&limit=10
&sortBy=createdAt
&order=desc
```

**All Query Options:**
- `status`: pending, in_progress, resolved, escalated, cancelled, reopened
- `priority`: low, medium, high, urgent
- `category`: service, food_quality, cleanliness, staff_behavior, billing_issue, facility_issue, delay, other
- `search`: text search in title/description
- `page`: page number (default: 1)
- `limit`: items per page (default: 10, max: 50)
- `sortBy`: createdAt, updatedAt, priority
- `order`: asc, desc

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaints": [
      {
        "complaintId": "CMP-001",
        "title": "Food not served on time",
        "status": "pending",
        "priority": "high",
        "category": "service_quality",
        "createdAt": "2026-01-03T10:30:00.000Z",
        "hasUnreadResponses": false
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. Get Complaint Details
**Endpoint:** `GET /user/complaints/:complaintId`  
**Auth:** Bearer `{{userToken}}`

**Example:** `GET /user/complaints/CMP-001`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "title": "Food not served on time",
      "description": "Ordered food 45 minutes ago...",
      "category": "service_quality",
      "priority": "high",
      "status": "pending",
      "attachments": [...],
      "user": {
        "name": "John Doe",
        "email": "user@example.com"
      },
      "hotel": {
        "name": "Grand Hotel"
      },
      "branch": {
        "name": "Downtown Branch"
      },
      "order": {
        "orderId": "ORD-123",
        "totalAmount": 1500
      },
      "assignedTo": {
        "name": "Staff Member",
        "email": "staff@example.com"
      },
      "responses": [
        {
          "message": "We apologize for the delay. Investigating now.",
          "addedBy": {
            "userType": "staff",
            "userId": "staffId123",
            "name": "Staff Member"
          },
          "timestamp": "2026-01-03T11:00:00.000Z",
          "isInternal": false
        }
      ],
      "statusHistory": [...],
      "resolution": null,
      "userRating": null,
      "canReopen": false,
      "createdAt": "2026-01-03T10:30:00.000Z",
      "updatedAt": "2026-01-03T11:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `404` - Complaint not found
- `403` - Not your complaint

---

### 4. Add Follow-Up Message
**Endpoint:** `POST /user/complaints/:complaintId/followup`  
**Auth:** Bearer `{{userToken}}`  
**Content-Type:** `multipart/form-data`

**Form Data:**
```
message: "Still waiting for resolution. This is taking too long."
attachments: [File1, File2] (max 3 files)
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Follow-up message added successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "responses": [
        {
          "message": "Still waiting for resolution...",
          "attachments": [...],
          "addedBy": {
            "userType": "user",
            "userId": "userId123"
          },
          "timestamp": "2026-01-03T12:00:00.000Z"
        }
      ]
    }
  }
}
```

**Error Responses:**
- `400` - Cannot add follow-up to resolved/cancelled complaints
- `404` - Complaint not found

---

### 5. Rate Resolution
**Endpoint:** `PUT /user/complaints/:complaintId/rate`  
**Auth:** Bearer `{{userToken}}`

**Request Body:**
```json
{
  "rating": 4,
  "feedbackComment": "Issue was resolved but took longer than expected. Staff was polite."
}
```

**Validation:**
- `rating`: 1-5 (required)
- `feedbackComment`: string (optional)
- Complaint must be in `resolved` status

**Success Response (200):**
```json
{
  "success": true,
  "message": "Thank you for your feedback",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "userRating": 4,
      "feedbackComment": "Issue was resolved but took longer...",
      "canReopen": false
    }
  }
}
```

**Note:** Rating ≤ 2 automatically enables `canReopen: true`

**Error Responses:**
- `400` - Complaint not resolved yet
- `400` - Already rated

---

### 6. Reopen Complaint
**Endpoint:** `PUT /user/complaints/:complaintId/reopen`  
**Auth:** Bearer `{{userToken}}`

**Request Body:**
```json
{
  "reason": "The issue occurred again. Same problem with delayed service."
}
```

**Validation:**
- Complaint must be `resolved` and `canReopen: true`
- Must be within 7 days of resolution
- Rating must be ≤ 2

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint reopened successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "status": "reopened",
      "canReopen": false,
      "statusHistory": [...]
    }
  }
}
```

**Error Responses:**
- `400` - Cannot reopen (not resolved, rating > 2, or > 7 days)
- `403` - Not your complaint

---

### 7. Get My Complaints Dashboard
**Endpoint:** `GET /user/complaints/dashboard`  
**Auth:** Bearer `{{userToken}}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalComplaints": 15,
      "pendingCount": 3,
      "inProgressCount": 2,
      "resolvedCount": 8,
      "escalatedCount": 1,
      "cancelledCount": 0,
      "reopenedCount": 1
    },
    "priorityBreakdown": {
      "low": 4,
      "medium": 6,
      "high": 4,
      "urgent": 1
    },
    "categoryBreakdown": {
      "service_quality": 5,
      "food_quality": 4,
      "cleanliness": 2,
      "staff_behavior": 1,
      "billing_issue": 2,
      "delay": 1
    },
    "averageResolutionTime": 8.5,
    "averageRating": 3.8,
    "recentComplaints": [
      {
        "complaintId": "CMP-015",
        "title": "Recent complaint",
        "status": "pending",
        "priority": "high",
        "createdAt": "2026-01-03T10:30:00.000Z"
      }
    ]
  }
}
```

---

## 👨‍💼 Staff Endpoints (Read-Only)

### 1. Get My Assigned Complaints
**Endpoint:** `GET /staff/complaints`  
**Auth:** Bearer `{{staffToken}}`

**Query Parameters:**
```
?status=pending
&priority=urgent
&unviewedOnly=true
&page=1
&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaints": [
      {
        "complaintId": "CMP-001",
        "title": "Food not served on time",
        "status": "pending",
        "priority": "high",
        "assignedAt": "2026-01-03T10:35:00.000Z",
        "staffViewedAt": null,
        "isViewed": false,
        "user": {
          "name": "John Doe"
        }
      }
    ],
    "unviewedCount": 3,
    "pagination": {...}
  }
}
```

---

### 2. Get Complaint Details (Staff View)
**Endpoint:** `GET /staff/complaints/:complaintId`  
**Auth:** Bearer `{{staffToken}}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "title": "Food not served on time",
      "description": "...",
      "status": "pending",
      "priority": "high",
      "readOnly": true,
      "assignedTo": {
        "name": "Your Name",
        "email": "staff@example.com"
      },
      "responses": [...],
      "statusHistory": [...],
      "resolution": null
    }
  }
}
```

**Note:** `readOnly: true` flag indicates staff cannot modify

**Error Responses:**
- `403` - Complaint not assigned to you
- `404` - Complaint not found

---

### 3. Mark Complaint as Viewed
**Endpoint:** `PUT /staff/complaints/:complaintId/viewed`  
**Auth:** Bearer `{{staffToken}}`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint marked as viewed",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "staffViewedAt": "2026-01-03T11:30:00.000Z"
    }
  }
}
```

**Note:** This is the ONLY write operation staff can perform

---

### 4. Get Staff Complaints Dashboard
**Endpoint:** `GET /staff/complaints/dashboard`  
**Auth:** Bearer `{{staffToken}}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAssigned": 12,
      "pendingCount": 4,
      "inProgressCount": 3,
      "resolvedCount": 5,
      "unviewedCount": 2
    },
    "priorityBreakdown": {
      "low": 3,
      "medium": 5,
      "high": 3,
      "urgent": 1
    },
    "engagementRate": 83.3,
    "recentAssignments": [...]
  }
}
```

---

### Staff Write Operations (All Return 403)

**These endpoints should return 403 Forbidden:**

1. `PUT /staff/complaints/:complaintId/status`
2. `POST /staff/complaints/:complaintId/response`
3. `PUT /staff/complaints/:complaintId/resolve`

**Error Response (403):**
```json
{
  "success": false,
  "message": "Staff have read-only access to complaints. Please contact your manager to update complaint status or add responses."
}
```

---

## 🏢 Manager Endpoints

### 1. Get All Complaints
**Endpoint:** `GET /manager/complaints`  
**Auth:** Bearer `{{managerToken}}`

**Query Parameters:**
```
?status=pending
&priority=urgent
&assignedTo=staffId123
&unassigned=true
&branch=branchId789
&page=1
&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaints": [
      {
        "complaintId": "CMP-001",
        "title": "Food not served on time",
        "status": "pending",
        "priority": "high",
        "category": "service_quality",
        "user": {...},
        "assignedTo": {...},
        "createdAt": "2026-01-03T10:30:00.000Z"
      }
    ],
    "pagination": {...}
  }
}
```

---

### 2. Get Complaint Details (Manager View)
**Endpoint:** `GET /manager/complaints/:complaintId`  
**Auth:** Bearer `{{managerToken}}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "title": "Food not served on time",
      "description": "...",
      "status": "pending",
      "priority": "high",
      "internalNotes": "Customer is a VIP member",
      "responses": [
        {
          "message": "Internal note: Check kitchen logs",
          "isInternal": true,
          "addedBy": {...}
        }
      ],
      "coinCompensation": null,
      "staffViewedAt": "2026-01-03T11:30:00.000Z"
    }
  }
}
```

---

### 3. Assign Complaint to Staff
**Endpoint:** `PUT /manager/complaints/:complaintId/assign/:staffId`  
**Auth:** Bearer `{{managerToken}}`

**Request Body (Optional):**
```json
{
  "notes": "Assigning to senior staff member for immediate attention"
}
```

**Note:** Request body is optional. You can assign without sending any body.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint assigned successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "assignedTo": {
        "name": "Staff Member",
        "email": "staff@example.com"
      },
      "assignedBy": {
        "name": "Manager Name"
      },
      "assignedAt": "2026-01-03T12:00:00.000Z"
    }
  }
}
```

**🔔 Socket.IO Notification (Assigned Staff):**
Staff member receives real-time notification:
```json
Event: "complaint:assigned"
Data: {
  "complaint": {
    "complaintId": "CMP-001",
    "title": "Food not served on time",
    "priority": "high",
    "assignedTo": "staffId123"
  },
  "readOnly": true
}
```
**🧪 Postman Test:** Open WebSocket as Staff, assign complaint as Manager, verify Staff receives notification

**Error Responses:**
- `404` - Staff not found or not in same branch
- `400` - Complaint already assigned

---

### 4. Reassign Complaint
**Endpoint:** `PUT /manager/complaints/:complaintId/reassign/:staffId`  
**Auth:** Bearer `{{managerToken}}`

**Request Body (Optional):**
```json
{
  "reason": "Previous staff member unavailable, reassigning to available team member"
}
```

**Note:** Request body is optional. You can reassign without sending any body.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint reassigned successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "assignedTo": {
        "name": "New Staff Member"
      },
      "staffViewedAt": null,
      "staffNotified": false
    }
  }
}
```

**Note:** Reassignment resets `staffViewedAt` and `staffNotified` flags

---

### 5. Update Complaint Status
**Endpoint:** `PUT /manager/complaints/:complaintId/status`  
**Auth:** Bearer `{{managerToken}}`

**Request Body:**
```json
{
  "status": "in_progress",
  "internalNotes": "Contacted kitchen staff, investigating the delay"
}
```

**Valid Status Transitions:**
- `pending` → `in_progress`, `cancelled`
- `in_progress` → `resolved`, `escalated`, `cancelled`
- `escalated` → `in_progress`, `resolved`
- `reopened` → `in_progress`, `resolved`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint status updated successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "status": "in_progress",
      "statusHistory": [
        {
          "status": "in_progress",
          "updatedBy": "managerId123",
          "updatedByModel": "Manager",
          "timestamp": "2026-01-03T12:30:00.000Z",
          "notes": "Contacted kitchen staff..."
        }
      ]
    }
  }
}
```

---

### 6. Add Response to Complaint
**Endpoint:** `POST /manager/complaints/:complaintId/response`  
**Auth:** Bearer `{{managerToken}}`

**Request Body:**
```json
{
  "message": "We sincerely apologize for the delay. Our kitchen was experiencing high volume. Your meal is now being prepared on priority.",
  "isInternal": false
}
```

**Fields:**
- `message`: string (required)
- `isInternal`: boolean (default: false)
  - `true`: Only visible to manager/staff
  - `false`: Visible to user

**Success Response (200):**
```json
{
  "success": true,
  "message": "Response added successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "responses": [
        {
          "message": "We sincerely apologize...",
          "addedBy": {
            "userType": "manager",
            "userId": "managerId123",
            "name": "Manager Name"
          },
          "isInternal": false,
          "timestamp": "2026-01-03T12:45:00.000Z"
        }
      ]
    }
  }
}
```

---

### 7. Resolve Complaint (with Coin Compensation)
**Endpoint:** `PUT /manager/complaints/:complaintId/resolve`  
**Auth:** Bearer `{{managerToken}}`

**Request Body:**
```json
{
  "resolution": "Issue resolved. Meal was served with complimentary dessert. Kitchen staff has been briefed to prevent future delays.",
  "internalNotes": "Spoke with head chef about staffing during peak hours"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint resolved successfully. Customer rewarded with 200 coins.",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "status": "resolved",
      "resolution": "Issue resolved. Meal was served...",
      "resolvedBy": {
        "name": "Manager Name"
      },
      "resolvedAt": "2026-01-03T13:00:00.000Z",
      "coinCompensation": 200,
      "canReopen": true
    },
    "coinTransaction": {
      "transactionId": "TXN-123",
      "amount": 200,
      "type": "credit",
      "source": "complaint_resolution"
    }
  }
}
```

**🔔 Socket.IO Notification (User):**
User receives real-time notification about resolution:
```json
Event: "complaint:resolved"
Data: {
  "complaint": {
    "complaintId": "CMP-001",
    "status": "resolved",
    "resolution": "Issue resolved. Meal was served...",
    "canReopen": true
  },
  "coinCompensation": 200
}
```
**🧪 Postman Test:** Open WebSocket as User, resolve complaint as Manager, verify User receives notification with coin amount

**Coin Compensation Amounts:**
- `low` priority: **50 coins**
- `medium` priority: **100 coins**
- `high` priority: **200 coins**
- `urgent` priority: **500 coins**

**Error Responses:**
- `400` - Complaint not in resolvable status
- `400` - Resolution text required

---

## 🏢 Admin Endpoints

### 1. Get All Complaints (Hotel-wide/Cross-hotel)
**Endpoint:** `GET /admin/complaints`  
**Auth:** Bearer `{{adminToken}}`

**Query Parameters:**
```
?status=escalated
&priority=urgent
&hotelId=hotelId123
&branchId=branchId456
&assignedTo=staffId789
&unassigned=true
&escalated=true
&page=1
&limit=20
&sortBy=createdAt
&sortOrder=desc
&search=food
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaints": [
      {
        "complaintId": "CMP-001",
        "title": "Food not served on time",
        "status": "escalated",
        "priority": "high",
        "category": "service_quality",
        "user": {
          "name": "John Doe",
          "email": "user@example.com"
        },
        "hotel": {
          "name": "Grand Hotel",
          "hotelId": "HTL-001"
        },
        "branch": {
          "name": "Downtown Branch",
          "branchId": "BRN-001"
        },
        "assignedTo": {
          "name": "Staff Member"
        },
        "createdAt": "2026-01-03T10:30:00.000Z"
      }
    ],
    "statusBreakdown": {
      "pending": 15,
      "in_progress": 8,
      "resolved": 42,
      "escalated": 3
    },
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalComplaints": 68,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Note:** 
- **Super Admin:** Can view all complaints across all hotels
- **Branch Admin:** Can only view complaints from their hotels

---

### 2. Get Escalated Complaints
**Endpoint:** `GET /admin/complaints/escalated`  
**Auth:** Bearer `{{adminToken}}`

**Query Parameters:**
```
?page=1
&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaints": [
      {
        "complaintId": "CMP-005",
        "title": "Urgent: Food poisoning suspected",
        "status": "escalated",
        "priority": "urgent",
        "escalatedAt": "2026-01-02T10:00:00.000Z",
        "escalationReason": "Auto-escalated: urgent priority complaint unresolved for 2 days",
        "user": {...},
        "hotel": {...},
        "branch": {...}
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalEscalated": 3,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. Get Complaint Analytics
**Endpoint:** `GET /admin/complaints/analytics`  
**Auth:** Bearer `{{adminToken}}`

**Query Parameters:**
```
?startDate=2026-01-01
&endDate=2026-01-31
&hotelId=hotelId123
&branchId=branchId456
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalComplaints": 68,
    "statusBreakdown": {
      "pending": 15,
      "in_progress": 8,
      "resolved": 42,
      "escalated": 3
    },
    "priorityBreakdown": {
      "low": 20,
      "medium": 30,
      "high": 15,
      "urgent": 3
    },
    "categoryBreakdown": {
      "food_quality": 25,
      "service": 18,
      "cleanliness": 10,
      "staff_behavior": 5,
      "billing": 8,
      "other": 2
    },
    "averageResolutionTime": {
      "hours": 18.5,
      "days": 0.8
    },
    "recentComplaints": [...]
  }
}
```

---

### 4. Get Complaint Details
**Endpoint:** `GET /admin/complaints/:complaintId`  
**Auth:** Bearer `{{adminToken}}`

**Example:** `GET /admin/complaints/CMP-001`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "title": "Food not served on time",
      "description": "Ordered food 45 minutes ago...",
      "category": "service_quality",
      "priority": "high",
      "status": "escalated",
      "internalNotes": "VIP customer, handle with priority",
      "user": {...},
      "hotel": {...},
      "branch": {...},
      "order": {...},
      "assignedTo": {...},
      "refundRequest": {...},
      "responses": [...],
      "statusHistory": [...],
      "createdAt": "2026-01-03T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `404` - Complaint not found
- `403` - Branch admin cannot access complaints from other hotels

---

### 5. Update Complaint Status
**Endpoint:** `PUT /admin/complaints/:complaintId/status`  
**Auth:** Bearer `{{adminToken}}`

**Request Body:**
```json
{
  "status": "in_progress",
  "internalNotes": "Escalated to kitchen manager. Investigating delay causes."
}
```

**Valid Status Transitions:**
- `pending` → `in_progress`, `cancelled`
- `in_progress` → `resolved`, `escalated`, `cancelled`
- `escalated` → `in_progress`, `resolved`
- `reopened` → `in_progress`, `resolved`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "status": "in_progress",
      "statusHistory": [
        {
          "status": "in_progress",
          "updatedBy": "adminId123",
          "updatedByModel": "Admin",
          "timestamp": "2026-01-03T14:00:00.000Z",
          "notes": "Escalated to kitchen manager..."
        }
      ]
    }
  }
}
```

---

### 6. Assign Complaint to Staff
**Endpoint:** `PUT /admin/complaints/:complaintId/assign/:staffId`  
**Auth:** Bearer `{{adminToken}}`

**Request Body (Optional):**
```json
{
  "notes": "Assigning to senior staff member for immediate resolution"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint assigned successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "assignedTo": {
        "name": "Senior Staff",
        "staffId": "STF-001"
      },
      "assignedBy": "adminId123",
      "assignedAt": "2026-01-03T14:15:00.000Z",
      "staffViewedAt": null
    }
  }
}
```

**Error Responses:**
- `404` - Staff not found or complaint not found
- `400` - Staff not from same branch as complaint
- `400` - Complaint already assigned to this staff

---

### 7. Reassign Complaint
**Endpoint:** `PUT /admin/complaints/:complaintId/reassign/:staffId`  
**Auth:** Bearer `{{adminToken}}`

**Request Body (Optional):**
```json
{
  "reason": "Previous staff member unavailable, reassigning to available staff"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Complaint reassigned successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "assignedTo": {
        "name": "New Staff Member"
      },
      "assignedAt": "2026-01-03T14:30:00.000Z",
      "staffViewedAt": null,
      "staffNotified": false
    }
  }
}
```

**Note:** Reassignment resets `staffViewedAt` and `staffNotified` flags

---

### 8. Add Response to Complaint
**Endpoint:** `POST /admin/complaints/:complaintId/response`  
**Auth:** Bearer `{{adminToken}}`

**Request Body:**
```json
{
  "message": "We sincerely apologize for the inconvenience. Your complaint has been escalated to our management team for immediate action.",
  "isInternal": false
}
```

**Fields:**
- `message`: string (5-1000 characters, required)
- `isInternal`: boolean (default: false)
  - `true`: Only visible to admin/manager/staff
  - `false`: Visible to user

**Success Response (200):**
```json
{
  "success": true,
  "message": "Response added successfully",
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "responses": [
        {
          "message": "We sincerely apologize...",
          "addedBy": {
            "userType": "admin",
            "userId": "adminId123",
            "name": "Admin Name"
          },
          "isInternal": false,
          "timestamp": "2026-01-03T14:45:00.000Z"
        }
      ]
    }
  }
}
```

---

### 9. Resolve Complaint (with Coin Compensation)
**Endpoint:** `PUT /admin/complaints/:complaintId/resolve`  
**Auth:** Bearer `{{adminToken}}`

**Request Body:**
```json
{
  "resolution": "Issue investigated and resolved. Kitchen manager has implemented new protocols to prevent delays. Customer compensated with complimentary dessert and priority seating.",
  "internalNotes": "Updated kitchen SOP document. Staff training scheduled for next week."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "complaint": {
      "complaintId": "CMP-001",
      "status": "resolved",
      "resolution": "Issue investigated and resolved...",
      "resolvedBy": "adminId123",
      "resolvedByModel": "Admin",
      "resolvedAt": "2026-01-03T15:00:00.000Z",
      "coinCompensation": 200,
      "canReopen": true
    },
    "coinTransaction": {
      "transactionId": "TXN-456",
      "amount": 200,
      "type": "credit",
      "source": "complaint_resolution"
    },
    "message": "Complaint resolved successfully. Customer rewarded with 200 coins."
  }
}
```

**Coin Compensation (Same as Manager):**
- `low` priority: **50 coins**
- `medium` priority: **100 coins**
- `high` priority: **200 coins**
- `urgent` priority: **500 coins**

**Error Responses:**
- `404` - Complaint not found
- `400` - Cannot resolve complaint with current status
- `400` - Resolution must be at least 10 characters

---

## 🧪 Test Scenarios

### Scenario 1: Happy Path - User Submits & Resolved (With Socket.IO Testing)

#### 🔌 Postman Setup for This Scenario:
**Tab 1:** WebSocket connection for Manager notifications
**Tab 2:** WebSocket connection for Staff notifications  
**Tab 3:** WebSocket connection for User notifications
**Tab 4-12:** REST API calls

#### Step-by-Step with Socket Events:

**1. User submits complaint** (POST /user/complaints)
   - **REST API:** POST /user/complaints
   - With 2 attachments
   - Priority: high
   - RequestRefund: true
   
   **🔔 Socket.IO Test (Manager WebSocket Tab):**
   ```
   Event: complaint:new
   Data received:
   {
     "complaint": {
       "complaintId": "CMP-001",
       "title": "Food not served on time",
       "priority": "high",
       "category": "service_quality",
       "user": { "name": "John Doe", "email": "user@example.com" }
     }
   }
   ```
   **✅ Verify:** Manager WebSocket receives `complaint:new` within 500ms

**2. Manager assigns to staff** (PUT /manager/complaints/:id/assign/:staffId)
   - **REST API:** PUT /manager/complaints/CMP-001/assign/staffId123
   
   **🔔 Socket.IO Test (Staff WebSocket Tab):**
   ```
   Event: complaint:assigned
   Data received:
   {
     "complaint": {
       "complaintId": "CMP-001",
       "title": "Food not served on time",
       "priority": "high",
       "assignedTo": "staffId123"
     },
     "readOnly": true
   }
   ```
   **✅ Verify:** Staff WebSocket receives `complaint:assigned` with `readOnly: true`

**3. Staff views complaint** (GET /staff/complaints/:id)
   - **REST API:** GET /staff/complaints/CMP-001

**4. Staff marks as viewed** (PUT /staff/complaints/:id/viewed)
   - **REST API:** PUT /staff/complaints/CMP-001/viewed
   
   **🔔 Socket.IO Test (Manager WebSocket Tab):**
   ```
   Event: complaint:viewed
   Data received:
   {
     "complaintId": "CMP-001",
     "staff": { "name": "Staff Member", "staffId": "staffId123" },
     "viewedAt": "2026-01-04T10:30:00.000Z"
   }
   ```
   **✅ Verify:** Manager receives `complaint:viewed` notification

**5. Manager updates status** (PUT /manager/complaints/:id/status) → `in_progress`
   - **REST API:** PUT /manager/complaints/CMP-001/status
   
   **🔔 Socket.IO Test (User + Staff WebSocket Tabs):**
   ```
   Event: complaint:updated
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "in_progress" },
     "updateType": "status_changed"
   }
   ```
   **✅ Verify:** Both User and Staff receive `complaint:updated` event

**6. Manager adds response** (POST /manager/complaints/:id/response)
   - **REST API:** POST /manager/complaints/CMP-001/response
   
   **🔔 Socket.IO Test (User + Staff WebSocket Tabs):**
   ```
   Event: complaint:updated
   Data received:
   {
     "complaint": { "complaintId": "CMP-001" },
     "updateType": "response_added"
   }
   ```

**7. User adds follow-up** (POST /user/complaints/:id/followup)
   - **REST API:** POST /user/complaints/CMP-001/followup
   
   **🔔 Socket.IO Test (Staff + Manager WebSocket Tabs):**
   ```
   Event: complaint:updated
   Data received:
   {
     "complaint": { "complaintId": "CMP-001" },
     "updateType": "followup_added"
   }
   ```

**8. Manager resolves** (PUT /manager/complaints/:id/resolve) → User gets 200 coins
   - **REST API:** PUT /manager/complaints/CMP-001/resolve
   
   **🔔 Socket.IO Test (User WebSocket Tab):**
   ```
   Event: complaint:resolved
   Data received:
   {
     "complaint": {
       "complaintId": "CMP-001",
       "status": "resolved",
       "resolution": "Issue has been resolved...",
       "canReopen": true
     },
     "coinCompensation": 200
   }
   ```
   **✅ Verify:** User receives `complaint:resolved` with 200 coins

**9. User rates resolution** (PUT /user/complaints/:id/rate) → Rating: 5
   - **REST API:** PUT /user/complaints/CMP-001/rate

**Expected:** Complaint closed, user happy, 200 coins awarded, all notifications received in real-time

---

### Scenario 2: Staff Read-Only Enforcement
1. **Manager assigns complaint to staff**
2. **Staff views complaint** (GET /staff/complaints/:id) → `readOnly: true`
3. **Staff tries to update status** (PUT /staff/complaints/:id/status)
   - **Expected:** `403 Forbidden` with message about read-only access
4. **Staff tries to add response** (POST /staff/complaints/:id/response)
   - **Expected:** `403 Forbidden`
5. **Staff tries to resolve** (PUT /staff/complaints/:id/resolve)
   - **Expected:** `403 Forbidden`
6. **Staff marks as viewed** (PUT /staff/complaints/:id/viewed)
   - **Expected:** `200 OK` (only allowed write operation)

**Expected:** Staff can only view and mark as viewed, all write operations blocked

---

### Scenario 3: Complaint Reopening (With Socket.IO Testing)

#### 🔌 Postman Setup:
**Tab 1:** WebSocket for User  
**Tab 2:** WebSocket for Manager  
**Tab 3-6:** REST API calls

**1. User submits complaint** → Priority: medium
   - **REST API:** POST /user/complaints (priority: medium)

**2. Manager resolves** → User gets 100 coins
   - **REST API:** PUT /manager/complaints/:id/resolve
   
   **🔔 Socket.IO Test (User WebSocket):**
   ```
   Event: complaint:resolved
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "resolved" },
     "coinCompensation": 100
   }
   ```

**3. User rates with 2 stars** (PUT /user/complaints/:id/rate) → `canReopen: true`
   - **REST API:** PUT /user/complaints/:id/rate (rating: 2)

**4. User reopens within 1 day** (PUT /user/complaints/:id/reopen)
   - **REST API:** PUT /user/complaints/:id/reopen
   - **Expected:** Status changes to `reopened`
   
   **🔔 Socket.IO Test (Manager WebSocket):**
   ```
   Event: complaint:reopened
   Data received:
   {
     "complaint": {
       "complaintId": "CMP-001",
       "status": "reopened",
       "priority": "high",
       "reopenReason": "User not satisfied with resolution"
     }
   }
   ```
   **✅ Verify:** Manager receives `complaint:reopened` notification

**5. Manager resolves again** → User gets another 100 coins
   - **REST API:** PUT /manager/complaints/:id/resolve
   
   **🔔 Socket.IO Test (User WebSocket):**
   ```
   Event: complaint:resolved
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "resolved" },
     "coinCompensation": 100
   }
   ```

**6. User rates with 5 stars** → `canReopen: false`
   - **REST API:** PUT /user/complaints/:id/rate (rating: 5)

**Expected:** User can reopen only if rating ≤ 2, total 200 coins earned, all notifications received

---

### Scenario 4: Reassignment Workflow (With Socket.IO Testing)

#### 🔌 Postman Setup:
**Tab 1:** WebSocket for Staff A  
**Tab 2:** WebSocket for Staff B  
**Tab 3-5:** REST API calls

**1. Manager assigns to Staff A**
   - **REST API:** PUT /manager/complaints/:id/assign/staffA_id
   
   **🔔 Socket.IO Test (Staff A WebSocket):**
   ```
   Event: complaint:assigned
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "assignedTo": "staffA_id" },
     "readOnly": true
   }
   ```
   **✅ Verify:** Staff A receives assignment notification

**2. Staff A views complaint** → `staffViewedAt` set
   - **REST API:** PUT /staff/complaints/:id/viewed

**3. Manager reassigns to Staff B** (PUT /manager/complaints/:id/reassign/:staffBId)
   - **REST API:** PUT /manager/complaints/:id/reassign/staffB_id
   - **Expected:** `staffViewedAt: null`, `staffNotified: false`
   
   **🔔 Socket.IO Test (Staff A WebSocket):**
   ```
   Event: complaint:reassigned
   Data received:
   {
     "complaint": { "complaintId": "CMP-001" },
     "action": "removed",
     "message": "Complaint has been reassigned to another staff member"
   }
   ```
   **✅ Verify:** Staff A receives `complaint:reassigned` with `action: removed`
   
   **🔔 Socket.IO Test (Staff B WebSocket):**
   ```
   Event: complaint:assigned
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "assignedTo": "staffB_id" },
     "readOnly": true
   }
   ```
   **✅ Verify:** Staff B receives `complaint:assigned` notification

**4. Staff B marks as viewed**
   - **REST API:** PUT /staff/complaints/:id/viewed

**Expected:** Reassignment resets tracking flags, both staff receive appropriate notifications

---

### Scenario 5: Auto-Escalation (With Socket.IO Testing)

#### 🔌 Postman Setup:
**Tab 1:** WebSocket for Manager  
**Tab 2:** WebSocket for Admin  
**Tab 3-4:** REST API calls

**1. User submits urgent priority complaint**
   - **REST API:** POST /user/complaints (priority: urgent)

**2. Wait 24 hours** (or manually trigger scheduled job)

**3. Trigger escalation job** (Terminal or manually)
   ```bash
   # Manually trigger in scheduledJobs.js (for testing)
   await scheduledJobsService.performComplaintEscalation();
   ```
   
   **🔔 Socket.IO Test (Manager WebSocket):**
   ```
   Event: complaint:escalated
   Data received:
   {
     "complaint": {
       "complaintId": "CMP-001",
       "title": "Urgent: Food poisoning suspected",
       "priority": "urgent",
       "status": "escalated",
       "escalatedAt": "2026-01-05T10:30:00.000Z"
     },
     "escalationReason": "Auto-escalated: urgent priority complaint unresolved for 26 hours"
   }
   ```
   **✅ Verify:** Manager receives `complaint:escalated` notification
   
   **🔔 Socket.IO Test (Admin WebSocket):**
   ```
   Event: complaint:escalated
   Data received: (same as above)
   ```
   **✅ Verify:** Admin also receives escalation notification

**4. Check complaint status** (GET /user/complaints/:id)
   - **Expected:** Status changed to `escalated`
   - **Expected:** `escalationReason` populated
   - **Expected:** Management notified

**Expected:** All high/urgent complaints > 24 hours old escalated, real-time notifications sent

---

### Scenario 6: Admin Cross-Hotel Access
1. **Super Admin logs in**
2. **Get all complaints** (GET /admin/complaints)
   - **Expected:** Complaints from ALL hotels visible
3. **Filter by specific hotel** (GET /admin/complaints?hotelId=hotel1)
   - **Expected:** Only hotel1 complaints visible
4. **Get escalated complaints** (GET /admin/complaints/escalated)
   - **Expected:** All escalated complaints across hotels
5. **Admin resolves cross-hotel complaint** (PUT /admin/complaints/:id/resolve)
   - **Expected:** Success, coins awarded

**Expected:** Super admin has full cross-hotel access, branch admin limited to own hotels

---

### Scenario 7: Admin Override Manager Decision (With Socket.IO Testing)

#### 🔌 Postman Setup:
**Tab 1:** WebSocket for User  
**Tab 2:** WebSocket for Staff  
**Tab 3:** WebSocket for Manager  
**Tab 4-10:** REST API calls

**1. Manager resolves complaint with 100 coins** (medium priority)
   - **REST API:** PUT /manager/complaints/:id/resolve

**2. User unhappy, rates 1 star**
   - **REST API:** PUT /user/complaints/:id/rate (rating: 1)

**3. Admin reopens complaint** (Update status to reopened)
   - **REST API:** PUT /admin/complaints/:id/status (status: reopened)
   
   **🔔 Socket.IO Test (User WebSocket):**
   ```
   Event: complaint:updated
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "reopened" },
     "updateType": "admin_override",
     "message": "Admin has reopened your complaint for further investigation"
   }
   ```
   
   **🔔 Socket.IO Test (Manager WebSocket):**
   ```
   Event: complaint:admin_action
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "reopened" },
     "action": "reopened",
     "admin": { "name": "Admin Name" }
   }
   ```

**4. Admin reassigns to different staff**
   - **REST API:** PUT /admin/complaints/:id/assign/newStaffId
   
   **🔔 Socket.IO Test (New Staff WebSocket):**
   ```
   Event: complaint:assigned
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "assignedTo": "newStaffId" },
     "readOnly": true
   }
   ```

**5. Admin adds internal note** about escalation
   - **REST API:** POST /admin/complaints/:id/response (isInternal: true)
   
   **🔔 Socket.IO Test (Manager WebSocket Only):**
   ```
   Event: complaint:internal_note
   Data received:
   {
     "complaint": { "complaintId": "CMP-001" },
     "note": "Admin escalation - urgent review required"
   }
   ```
   **✅ Verify:** User does NOT receive notification (internal note)

**6. Admin resolves with updated resolution** → Another 100 coins
   - **REST API:** PUT /admin/complaints/:id/resolve
   
   **🔔 Socket.IO Test (User WebSocket):**
   ```
   Event: complaint:resolved
   Data received:
   {
     "complaint": { "complaintId": "CMP-001", "status": "resolved" },
     "coinCompensation": 100,
     "resolvedBy": "Admin"
   }
   ```

**7. User satisfied, rates 5 stars**
   - **REST API:** PUT /user/complaints/:id/rate (rating: 5)

**Expected:** Admin can override manager actions, full control over complaint lifecycle, proper notifications to all parties

---

### Scenario 8: File Upload Validation
1. **Submit complaint with 6 attachments**
   - **Expected:** `400 Error` - Max 5 files allowed
2. **Submit with 6MB file**
   - **Expected:** `400 Error` - Max 5MB per file
3. **Submit with valid 3 files (2MB, 1.5MB, 3MB)**
   - **Expected:** `201 Created` - All files uploaded to Cloudinary
4. **Add follow-up with 4 attachments**
   - **Expected:** `400 Error` - Max 3 files for follow-up

**Expected:** File validation enforced

---

### Scenario 7: Search & Filtering
1. **Create 10 complaints** with different:
   - Status: pending (3), in_progress (2), resolved (5)
   - Priority: low (2), medium (4), high (3), urgent (1)
   - Category: service_quality (4), food_quality (6)
2. **Test filters:**
   - GET `/user/complaints?status=pending` → Returns 3
   - GET `/user/complaints?priority=high` → Returns 3
   - GET `/user/complaints?category=food_quality` → Returns 6
   - GET `/user/complaints?search=food` → Returns matches with "food"
3. **Test pagination:**
   - GET `/user/complaints?limit=5&page=1` → First 5
   - GET `/user/complaints?limit=5&page=2` → Next 5

**Expected:** Accurate filtering and pagination

---

### Scenario 8: Dashboard Aggregation
1. **Create diverse complaints** (different statuses, priorities)
2. **Get user dashboard** (GET /user/complaints/dashboard)
   - **Verify:** Counts match actual complaints
   - **Verify:** Average resolution time calculated
   - **Verify:** Average rating calculated
3. **Get staff dashboard** (GET /staff/complaints/dashboard)
   - **Verify:** Only assigned complaints counted
   - **Verify:** Engagement rate = (viewed / total assigned) * 100

**Expected:** Accurate aggregated statistics

---

### Scenario 9: Unauthorized Access
1. **User A creates complaint**
2. **User B tries to view** (GET /user/complaints/:complaintIdA)
   - **Expected:** `403 Forbidden` - Not your complaint
3. **Staff C (not assigned) tries to view**
   - **Expected:** `403 Forbidden` - Complaint not assigned to you
4. **Manager D (different branch) tries to access**
   - **Expected:** `403 Forbidden` - Different branch

**Expected:** Strict access control enforced

---

### Scenario 10: Refund Integration
1. **Submit complaint with refund request:**
   ```json
   {
     "title": "Wrong order delivered",
     "requestRefund": true,
     "refundAmount": 750,
     "refundReason": "Completely wrong items received"
   }
   ```
2. **Verify refund created:**
   - Query RefundRequest model
   - Check `complaint` field links to complaint
   - Check `attachments` shared with complaint
3. **Resolve complaint**
4. **Check refund status updated** (if integrated)

**Expected:** Refund request auto-created with complaint

---

## 🔌 Socket.IO Testing

> **⚠️ Important:** Socket.IO notifications are currently in Phase 7/8 implementation. The TODO comments in controllers indicate where notifications will be triggered. Use this guide when Socket.IO integration is complete.

### Method 1: Testing with Postman (Recommended)

Postman now supports WebSocket connections, which Socket.IO uses under the hood.

#### Step 1: Create WebSocket Request in Postman
1. Click **New** → **WebSocket Request**
2. Enter URL: `ws://localhost:5000/socket.io/?EIO=4&transport=websocket`
3. Click **Connect**

#### Step 2: Authenticate Connection
After connecting, send authentication message:
```json
{
  "type": "auth",
  "token": "{{userToken}}"
}
```

#### Step 3: Join Room
Send join event based on role:
```json
{
  "event": "complaint:join",
  "data": {
    "userId": "your_user_id"
  }
}
```

#### Step 4: Listen for Events
Keep the WebSocket connection open and watch for incoming messages:
- `complaint:new` - New complaint created (Manager/Admin)
- `complaint:assigned` - Complaint assigned to you (Staff)
- `complaint:updated` - Complaint status changed (User/Staff)
- `complaint:resolved` - Complaint resolved with coins (User)
- `complaint:escalated` - Complaint escalated (Manager/Admin)
- `complaint:reassigned` - Reassignment notification (Staff)
- `complaint:viewed` - Staff viewed complaint (Manager)

#### Step 5: Test Notifications
1. Keep WebSocket connection open in Postman
2. In another Postman tab, trigger REST API calls:
   - **Test Manager Notification:** Submit new complaint (POST /user/complaints)
   - **Test Staff Notification:** Assign complaint (PUT /manager/complaints/:id/assign/:staffId)
   - **Test User Notification:** Resolve complaint (PUT /manager/complaints/:id/resolve)
3. Watch WebSocket tab for real-time messages

---

### Method 2: Testing with Browser Console

#### Step 1: Include Socket.IO Client
Create an HTML file `socket-test.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Complaint Socket.IO Test</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>Socket.IO Complaint Testing</h1>
  <div id="logs"></div>
  
  <script>
    const token = 'PASTE_YOUR_JWT_TOKEN_HERE'; // From login response
    const userId = 'PASTE_YOUR_USER_ID_HERE';
    const role = 'user'; // or 'staff', 'manager', 'admin'
    
    // Connect to Socket.IO
    const socket = io('http://localhost:5000', {
      auth: { token },
      transports: ['websocket']
    });
    
    const log = (message) => {
      const div = document.getElementById('logs');
      div.innerHTML += `<p><strong>[${new Date().toLocaleTimeString()}]</strong> ${message}</p>`;
      console.log(message);
    };
    
    // Connection events
    socket.on('connect', () => {
      log('✅ Connected to server!');
      
      // Join room based on role
      if (role === 'user') {
        socket.emit('complaint:join', { userId });
        log(`📡 Joined user room: ${userId}`);
      } else if (role === 'staff') {
        socket.emit('complaint:join', { staffId: userId });
        log(`📡 Joined staff room: ${userId}`);
      } else if (role === 'manager') {
        socket.emit('complaint:join', { managerId: userId, branchId: 'your_branch_id' });
        log(`📡 Joined manager room`);
      }
    });
    
    socket.on('disconnect', () => {
      log('❌ Disconnected from server');
    });
    
    socket.on('connect_error', (error) => {
      log('⚠️ Connection error: ' + error.message);
    });
    
    // Complaint events
    socket.on('complaint:new', (data) => {
      log(`🆕 NEW COMPLAINT: ${data.complaint.complaintId} - ${data.complaint.title}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:assigned', (data) => {
      log(`📌 ASSIGNED: ${data.complaint.complaintId} - Priority: ${data.complaint.priority}`);
      log(`   Read-only: ${data.readOnly}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:updated', (data) => {
      log(`🔄 UPDATED: ${data.complaint.complaintId} - Type: ${data.updateType}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:resolved', (data) => {
      log(`✅ RESOLVED: ${data.complaint.complaintId}`);
      log(`   💰 Coins awarded: ${data.coinCompensation}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:escalated', (data) => {
      log(`🚨 ESCALATED: ${data.complaint.complaintId}`);
      log(`   Reason: ${data.escalationReason}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:reassigned', (data) => {
      log(`🔀 REASSIGNED: ${data.complaint.complaintId} - Action: ${data.action}`);
      console.log('Full data:', data);
    });
    
    socket.on('complaint:viewed', (data) => {
      log(`👁️ VIEWED: ${data.complaintId} by ${data.staff.name}`);
      console.log('Full data:', data);
    });
    
    // Test functions
    window.testAcknowledge = (complaintId) => {
      socket.emit('complaint:notification:ack', { complaintId, userId });
      log(`✓ Acknowledged: ${complaintId}`);
    };
  </script>
</body>
</html>
```

#### Step 2: Open in Browser
1. Replace `token`, `userId`, and `role` with your actual values
2. Open the HTML file in a browser
3. Open Developer Console (F12) to see detailed logs
4. Trigger REST API calls from Postman to see notifications

---

### Method 3: Testing with Node.js Script

Create `test-socket.js`:
```javascript
import io from 'socket.io-client';

// Configuration
const SERVER_URL = 'http://localhost:5000';
const TOKEN = 'PASTE_YOUR_JWT_TOKEN_HERE';
const USER_ID = 'PASTE_YOUR_USER_ID_HERE';
const ROLE = 'manager'; // user, staff, manager, admin

// Connect to Socket.IO
const socket = io(SERVER_URL, {
  auth: { token: TOKEN },
  transports: ['websocket']
});

// Connection handlers
socket.on('connect', () => {
  console.log('✅ Connected to server!');
  console.log('Socket ID:', socket.id);
  
  // Join room based on role
  if (ROLE === 'user') {
    socket.emit('complaint:join', { userId: USER_ID });
    console.log(`📡 Joined user room: ${USER_ID}`);
  } else if (ROLE === 'staff') {
    socket.emit('complaint:join', { staffId: USER_ID });
    console.log(`📡 Joined staff room: ${USER_ID}`);
  } else if (ROLE === 'manager') {
    socket.emit('complaint:join', { 
      managerId: USER_ID, 
      branchId: 'your_branch_id' 
    });
    console.log(`📡 Joined manager room`);
  }
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('⚠️ Connection error:', error.message);
});

// Complaint event listeners
socket.on('complaint:new', (data) => {
  console.log('\n🆕 NEW COMPLAINT RECEIVED:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Title:', data.complaint.title);
  console.log('Priority:', data.complaint.priority);
  console.log('User:', data.complaint.user?.name);
  console.log('---');
});

socket.on('complaint:assigned', (data) => {
  console.log('\n📌 COMPLAINT ASSIGNED TO YOU:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Title:', data.complaint.title);
  console.log('Priority:', data.complaint.priority);
  console.log('Read-only mode:', data.readOnly);
  console.log('---');
});

socket.on('complaint:updated', (data) => {
  console.log('\n🔄 COMPLAINT UPDATED:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Update type:', data.updateType);
  console.log('New status:', data.complaint.status);
  console.log('---');
});

socket.on('complaint:resolved', (data) => {
  console.log('\n✅ COMPLAINT RESOLVED:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Resolution:', data.complaint.resolution);
  console.log('💰 Coins awarded:', data.coinCompensation);
  console.log('Can reopen:', data.complaint.canReopen);
  console.log('---');
});

socket.on('complaint:escalated', (data) => {
  console.log('\n🚨 COMPLAINT ESCALATED:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Priority:', data.complaint.priority);
  console.log('Escalation reason:', data.escalationReason);
  console.log('---');
});

socket.on('complaint:reassigned', (data) => {
  console.log('\n🔀 COMPLAINT REASSIGNED:');
  console.log('Complaint ID:', data.complaint.complaintId);
  console.log('Action:', data.action); // 'removed' or 'assigned'
  console.log('---');
});

socket.on('complaint:viewed', (data) => {
  console.log('\n👁️ STAFF VIEWED COMPLAINT:');
  console.log('Complaint ID:', data.complaintId);
  console.log('Staff:', data.staff.name);
  console.log('Viewed at:', data.viewedAt);
  console.log('---');
});

// Keep script running
console.log('\n🎧 Listening for complaint notifications...');
console.log('Press Ctrl+C to exit\n');
```

Run the script:
```bash
node test-socket.js
```

---

### Socket.IO Event Reference

#### Events You Can Emit (Client → Server)

| Event | Data | Description |
|-------|------|-------------|
| `complaint:join` | `{ userId, staffId, managerId, branchId }` | Join room to receive notifications |
| `complaint:leave` | `{ userId, staffId, managerId }` | Leave notification room |
| `complaint:notification:ack` | `{ complaintId, userId }` | Acknowledge notification received |

#### Events You Will Receive (Server → Client)

| Event | When Triggered | Data Payload | Who Receives |
|-------|----------------|--------------|--------------|
| `complaint:new` | User submits complaint | `{ complaint, user }` | **Manager** (same branch) |
| `complaint:assigned` | Manager assigns to staff | `{ complaint, readOnly: true }` | **Assigned Staff** |
| `complaint:updated` | Status/response changes | `{ complaint, updateType }` | **User** + **Assigned Staff** |
| `complaint:resolved` | Complaint resolved | `{ complaint, coinCompensation }` | **User** |
| `complaint:escalated` | Auto-escalation triggers | `{ complaint, escalationReason }` | **Manager** + **Admin** |
| `complaint:reassigned` | Staff reassigned | `{ complaint, action }` | **Old Staff** + **New Staff** |
| `complaint:viewed` | Staff marks as viewed | `{ complaintId, staff, viewedAt }` | **Manager** (same branch) |

---

### Testing Notification Flow

#### Test 1: User → Manager Notification
**Setup:**
1. Open Socket test as Manager role
2. Join manager room with branchId
3. Keep connection open

**Action:**
- Submit new complaint as User (POST /user/complaints)

**Expected:**
- Manager receives `complaint:new` event with complaint details
- Notification includes user name, priority, category

---

#### Test 2: Manager → Staff Notification
**Setup:**
1. Open Socket test as Staff role
2. Join staff room with staffId
3. Keep connection open

**Action:**
- Manager assigns complaint (PUT /manager/complaints/:id/assign/:staffId)

**Expected:**
- Staff receives `complaint:assigned` event
- Payload includes `readOnly: true` flag
- Shows complaint priority and user details

---

#### Test 3: Staff → Manager Viewed Notification
**Setup:**
1. Open Socket test as Manager role
2. Keep connection open

**Action:**
- Staff marks complaint as viewed (PUT /staff/complaints/:id/viewed)

**Expected:**
- Manager receives `complaint:viewed` event
- Shows which staff member viewed it
- Includes timestamp

---

#### Test 4: Resolution → User Notification
**Setup:**
1. Open Socket test as User role
2. Keep connection open

**Action:**
- Manager resolves complaint (PUT /manager/complaints/:id/resolve)

**Expected:**
- User receives `complaint:resolved` event
- Shows coin compensation amount (50-500)
- Includes resolution message
- Shows `canReopen` status

---

#### Test 5: Auto-Escalation → Manager/Admin
**Setup:**
1. Open Socket test as Manager role
2. Create high priority complaint
3. Wait 24+ hours (or trigger manually)

**Action:**
- Run scheduled escalation job

**Expected:**
- Manager receives `complaint:escalated` event
- Shows escalation reason
- Priority marked as urgent

---

### Troubleshooting Socket.IO

#### Issue: Connection Fails
**Cause:** CORS or authentication error
**Solution:**
```javascript
// Check server.js has correct CORS setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  }
});

// Verify token is valid (check expiry)
```

#### Issue: Not Receiving Notifications
**Cause:** Not joined to correct room
**Solution:**
```javascript
// Verify you joined the room first
socket.emit('complaint:join', { userId: 'correct_user_id' });

// Check room name matches server implementation
// User room: `user:${userId}`
// Staff room: `staff:${staffId}`
// Manager room: `manager:${managerId}` or `branch:${branchId}`
```

#### Issue: Notifications Received Multiple Times
**Cause:** Multiple socket connections or duplicate listeners
**Solution:**
```javascript
// Remove old listeners before adding new ones
socket.off('complaint:new');
socket.on('complaint:new', handleNewComplaint);

// Or disconnect old socket before creating new one
if (socket) socket.disconnect();
```

---

### Production Testing Checklist

- [ ] Test with valid JWT token
- [ ] Test with expired token (should reject)
- [ ] Test without token (should reject)
- [ ] User receives notifications only for their complaints
- [ ] Staff receives notifications only for assigned complaints
- [ ] Manager receives notifications for branch complaints
- [ ] Admin receives escalation notifications
- [ ] Notifications include all required data fields
- [ ] Real-time latency < 500ms
- [ ] Reconnection works after disconnect
- [ ] Multiple clients can connect simultaneously
- [ ] Room isolation works (no cross-contamination)
- [ ] Acknowledgment system working
- [ ] Memory leaks checked (disconnect cleans up)

---

## 📊 Expected Behaviors

### User Role
✅ Can submit complaints with attachments  
✅ Can view only their own complaints  
✅ Can add follow-up messages  
✅ Can rate resolution (only once)  
✅ Can reopen if rating ≤ 2 within 7 days  
✅ Receives coins on resolution (50-500 based on priority)  
✅ Can create refund request with complaint  
❌ Cannot view other users' complaints  
❌ Cannot update status or assign staff  

### Staff Role
✅ Can view complaints assigned to them  
✅ Can mark complaints as viewed (only write operation)  
✅ Receives real-time notifications for assignments/updates  
✅ Can see all complaint details including responses  
❌ **Cannot update complaint status** (403)  
❌ **Cannot add responses** (403)  
❌ **Cannot resolve complaints** (403)  
❌ Cannot view complaints not assigned to them  

### Manager Role
✅ Can view all complaints in their branch  
✅ Can assign/reassign complaints to staff  
✅ Can update complaint status  
✅ Can add responses (internal and public)  
✅ Can resolve complaints (triggers coin compensation)  
✅ Can view internal notes  
✅ Receives escalation alerts  
❌ Cannot view complaints from other branches (unless admin)  

### Admin Role
✅ Can view all complaints (hotel-wide or cross-hotel for super admin)  
✅ Can view escalated complaints dashboard  
✅ Can assign/reassign complaints across branches  
✅ Can update complaint status with admin authority  
✅ Can add responses (internal and public)  
✅ Can resolve complaints (triggers coin compensation)  
✅ Can override manager decisions  
✅ Can access complaint analytics with filtering  
✅ **Super Admin:** Full cross-hotel access  
✅ **Branch Admin:** Hotel-wide access for their hotels  
❌ Branch admin cannot access other hotels' complaints  

---

## 🐛 Error Testing

### Test Invalid Inputs
1. **Missing required fields:**
   ```json
   {
     "title": ""  // Empty title
   }
   ```
   **Expected:** `400 - "title" is required`

2. **Invalid enum values:**
   ```json
   {
     "priority": "super_urgent"  // Invalid priority
   }
   ```
   **Expected:** `400 - priority must be one of [low, medium, high, urgent]`

3. **Invalid complaint ID:**
   ```
   GET /user/complaints/INVALID-ID
   ```
   **Expected:** `404 - Complaint not found`

### Test Edge Cases
1. **Rate already rated complaint** → `400 - Already rated`
2. **Reopen after 8 days** → `400 - Cannot reopen after 7 days`
3. **Assign non-existent staff** → `404 - Staff not found`
4. **Update with invalid status transition** → `400 - Invalid status transition`

---

## 📝 Postman Collection Structure

### Folder Structure
```
Complaint Management System/
├── 🔐 Authentication/
│   ├── Login User
│   ├── Login Staff
│   ├── Login Manager
│   └── Login Admin
├── 👤 User Endpoints/
│   ├── Submit Complaint
│   ├── Get My Complaints
│   ├── Get Complaint Details
│   ├── Add Follow-Up
│   ├── Rate Resolution
│   ├── Reopen Complaint
│   └── Get Dashboard
├── 👨‍💼 Staff Endpoints/
│   ├── Get My Assigned Complaints
│   ├── Get Complaint Details
│   ├── Mark as Viewed
│   ├── Get Dashboard
│   └── ❌ Write Operations (403 Tests)/
│       ├── Update Status (Should Fail)
│       ├── Add Response (Should Fail)
│       └── Resolve (Should Fail)
├── 🏢 Manager Endpoints/
│   ├── Get All Complaints
│   ├── Get Complaint Details
│   ├── Assign to Staff
│   ├── Reassign Complaint
│   ├── Update Status
│   ├── Add Response
│   └── Resolve Complaint
└── 🔑 Admin Endpoints/
    ├── Get All Complaints (Cross-Hotel)
    ├── Get Escalated Complaints
    ├── Get Complaint Analytics
    ├── Get Complaint Details
    ├── Update Status
    ├── Assign to Staff
    ├── Reassign Complaint
    ├── Add Response
    └── Resolve Complaint
```

### Environment Variables
```
baseUrl: http://localhost:5000/api/v1
userToken: <token from user login>
staffToken: <token from staff login>
managerToken: <token from manager login>
adminToken: <token from admin login>
testComplaintId: <save from create response>
testStaffId: <staff ID for assignment>
testHotelId: <hotel ID for admin filtering>
testBranchId: <branch ID for admin filtering>
```

---

## ✅ Testing Checklist

### User Endpoints
- [ ] Submit complaint without attachments
- [ ] Submit complaint with 5 attachments
- [ ] Submit complaint with refund request
- [ ] Get complaints with no filters
- [ ] Get complaints with status filter
- [ ] Get complaints with search
- [ ] Get complaint details
- [ ] Try to view another user's complaint (should fail)
- [ ] Add follow-up message
- [ ] Rate resolved complaint
- [ ] Try to rate unresolved complaint (should fail)
- [ ] Reopen complaint with low rating
- [ ] Try to reopen without low rating (should fail)
- [ ] Get dashboard statistics

### Staff Endpoints
- [ ] Get assigned complaints
- [ ] Filter by unviewed only
- [ ] Get complaint details
- [ ] Try to view unassigned complaint (should fail)
- [ ] Mark complaint as viewed
- [ ] **Try to update status (should return 403)**
- [ ] **Try to add response (should return 403)**
- [ ] **Try to resolve (should return 403)**
- [ ] Get staff dashboard

### Manager Endpoints
- [ ] Get all branch complaints
- [ ] Filter by assigned staff
- [ ] Filter by unassigned
- [ ] Get complaint details with internal notes
- [ ] Assign complaint to staff
- [ ] Reassign complaint to different staff
- [ ] Update status to in_progress
- [ ] Add public response
- [ ] Add internal response
- [ ] Resolve complaint with low priority (50 coins)
- [ ] Resolve complaint with high priority (200 coins)
- [ ] Resolve complaint with urgent priority (500 coins)
- [ ] Verify coin transaction created

### Admin Endpoints
- [ ] Login as super admin
- [ ] Get all complaints (cross-hotel)
- [ ] Filter complaints by hotelId
- [ ] Filter complaints by branchId
- [ ] Get escalated complaints only
- [ ] Get unassigned complaints
- [ ] Get complaint analytics (overall)
- [ ] Get complaint analytics (hotel-specific)
- [ ] Get complaint analytics (date range)
- [ ] Get complaint details (cross-hotel)
- [ ] Update complaint status as admin
- [ ] Assign complaint to staff (cross-branch)
- [ ] Reassign complaint as admin
- [ ] Add internal response as admin
- [ ] Add public response as admin
- [ ] Resolve complaint as admin (verify coins)
- [ ] Login as branch admin
- [ ] Verify branch admin sees only their hotels
- [ ] Try to access other hotel complaint (should fail)
- [ ] Override manager decision (reopen resolved complaint)
- [ ] Verify admin actions tracked in statusHistory

### Integration Tests
- [ ] Verify refund request created with complaint
- [ ] Verify attachments uploaded to Cloudinary
- [ ] Verify file cleanup after upload
- [ ] Test pagination with 20+ complaints
- [ ] Verify status history tracking
- [ ] Test auto-escalation (manual trigger)
- [ ] Verify Socket.IO notifications

### Error Handling
- [ ] Submit complaint without auth token (401)
- [ ] Submit with missing required fields (400)
- [ ] Upload file > 5MB (400)
- [ ] Upload > 5 files (400)
- [ ] Invalid status transition (400)
- [ ] Access other user's complaint (403)
- [ ] Staff write operations (403)

---

## 🚀 Quick Start Testing

### 1. Setup Environment
```bash
# Start server
npm start

# Ensure MongoDB and Redis are running
```

### 2. Create Test Users
```javascript
// Create user, staff, manager, and admin accounts
// Or use existing accounts from your database
```

### 3. Login and Get Tokens
```bash
# Login as each role and save tokens
# User, Staff, Manager, Admin (Super Admin & Branch Admin)
```

### 4. Run Test Scenarios
```bash
# Follow Scenario 1-8 step by step
# Verify responses match expected results
```

### 5. Test Admin Cross-Hotel Access
```bash
# Test super admin can access all hotels
# Test branch admin limited to their hotels
# Verify RBAC permissions working
```

### 6. Test Socket.IO
```bash
# Use Socket.IO client or Postman WebSocket
# Connect with token
# Join rooms and listen for events
```

---

## 📌 Notes
- All timestamps are in ISO 8601 format (UTC)
- File uploads require `multipart/form-data` Content-Type
- Attachments stored in Cloudinary (auto-deleted on error)
- Coin compensation awarded automatically on resolution
- Auto-escalation runs every 6 hours (configurable)
- Staff notifications are real-time via Socket.IO
- Refund requests share attachments with complaints
- Status transitions validated server-side
- 7-day reopen window enforced
- Rating ≤ 2 enables reopening
- **Admin has hotel-wide access** (super admin = all hotels, branch admin = own hotels)
- Admin actions tracked with `resolvedByModel: "Admin"`
- RBAC permissions required: `viewReports`, `manageUsers`, `manageStaff`, `viewAnalytics`

---

**Last Updated:** January 3, 2026  
**Version:** 2.0.0 (Added Admin Endpoints)  
**Author:** Backend Development Team
