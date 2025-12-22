# Unified Login Endpoint

## Overview
A single authentication endpoint that automatically detects whether the user is an Admin, Manager, or Staff member based on their credentials.

## Endpoint
```
POST /api/v1/auth/login
```

## Request Body
```json
{
  "identifier": "string",  // Email, employeeId (MGR-YYYY-XXXX), or staffId (STF-XXX-YYYY-XXXX)
  "password": "string"
}
```

**Alternative field names (for flexibility):**
- `identifier` (recommended)
- `email` (accepts email addresses)
- `employeeId` (accepts manager IDs like MGR-2025-0001)
- `staffId` (accepts staff IDs like STF-WTR-2025-0001)

All field names work interchangeably - use whichever fits your frontend best!

## How It Works
The system automatically detects the user type based on the identifier pattern:
- **Email format** (contains "@"): Searches Admin → Manager → Staff
- **Manager ID** (starts with "MGR-"): Directly searches Manager model
- **Staff ID** (starts with "STF-"): Directly searches Staff model

## Response Format

### For Admin Login
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "userType": "admin",
    "admin": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "admin@hotel.com",
      "role": "admin",
      "department": "Management",
      "permissions": {...},
      "assignedBranches": [...],
      "lastLogin": "2025-12-23T10:30:00Z"
    },
    "createdHotels": [...]
  },
  "message": "Admin logged in successfully",
  "success": true
}
```

### For Manager Login
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "userType": "manager",
    "manager": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Jane Smith",
      "email": "manager@hotel.com",
      "employeeId": "MGR-2025-0001",
      "phone": "+1234567890",
      "role": "branch_manager",
      "department": "Operations",
      "status": "active",
      "permissions": {...},
      "hotel": {...},
      "branch": {...}
    },
    "isFirstLogin": false,
    "wasInactive": false,
    "requirePasswordChange": false
  },
  "message": "Manager logged in successfully",
  "success": true
}
```

### For Staff Login
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "userType": "staff",
    "staff": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Bob Johnson",
      "email": "staff@hotel.com",
      "staffId": "STF-WTR-2025-0001",
      "phone": "+1234567890",
      "role": "waiter",
      "department": "Service",
      "status": "active",
      "currentShift": {...},
      "permissions": {...},
      "hotel": {...},
      "branch": {...},
      "manager": {...}
    },
    "isFirstLogin": false,
    "wasInactive": false,
    "requirePasswordChange": false
  },
  "message": "Staff logged in successfully",
  "success": true
}
```

## Example Usage

### Login with Email (Works for all roles)
```bash
# Using "identifier" field (recommended)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "admin@hotel.com",
    "password": "your_password"
  }'

# Or using "email" field (also works)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hotel.com",
    "password": "your_password"
  }'
```

### Login with Manager Employee ID
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "MGR-2025-0001",
    "password": "your_password"
  }'
```

### Login with Staff ID
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "STF-WTR-2025-0001",
    "password": "your_password"
  }'
```

## Frontend Integration

### JavaScript/React Example
```javascript
const loginUser = async (identifier, password) => {
  try {
    const response = await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier, password }),
      credentials: 'include', // Include cookies
    });

    const result = await response.json();

    if (result.success) {
      const { userType, accessToken } = result.data;
      
      // Store token
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('userType', userType);

      // Redirect based on user type
      switch (userType) {
        case 'admin':
          window.location.href = '/admin/dashboard';
          break;
        case 'manager':
          window.location.href = '/manager/dashboard';
          break;
        case 'staff':
          window.location.href = '/staff/dashboard';
          break;
      }
    }
  } catch (error) {
    console.error('Login failed:', error);
  }
};
```

## Security Features
✅ Account locking after failed attempts
✅ Email verification requirement (Admin only)
✅ Auto-reactivation of inactive accounts (Manager/Staff)
✅ Password strength validation
✅ JWT tokens with expiration
✅ HTTP-only cookies for token storage
✅ First login detection

## Error Responses

### Invalid Credentials
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "success": false
}
```

### Account Locked
```json
{
  "statusCode": 423,
  "message": "Account is temporarily locked due to too many failed login attempts",
  "success": false
}
```

### Email Not Verified (Admin)
```json
{
  "statusCode": 403,
  "message": "Please verify your email first before logging in. Check your email for the verification OTP.",
  "success": false
}
```

## Backward Compatibility
All existing login endpoints remain fully functional:
- `POST /api/v1/auth/admin/login` - Admin login
- `POST /api/v1/auth/manager/login` - Manager login
- `POST /api/v1/auth/staff/login` - Staff login

You can use either the new unified endpoint or the existing separate endpoints based on your preference.
