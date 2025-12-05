# EventHub API Documentation

## Base URL
`https://api.eventhub.example.com/v1`

## Authentication
Most endpoints require authentication. Include the JWT token in the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

## Customer Endpoints

### Get Customer Profile
```
GET /api/customers/me
```
**Response**
```json
{
  "id": "uuid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "avatarUrl": "https://...",
  "location": "New York, NY"
}
```

### Update Customer Profile
```
PATCH /api/customers/me
```
**Request Body**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "location": "Los Angeles, CA"
}
```

## Vendor Endpoints

### Get Vendor Dashboard
```
GET /api/vendors/dashboard
```
**Response**
```json
{
  "upcomingBookings": [...],
  "recentMessages": [...],
  "revenueStats": {
    "monthly": 12500,
    "pendingPayouts": 3200
  },
  "tasks": [...]
}
```

### Create New Listing
```
POST /api/vendors/listings
```
**Request Body**
```json
{
  "title": "Premium Wedding Photography",
  "description": "Professional wedding photography package...",
  "category": "Photography",
  "location": "New York, NY",
  "pricingStyle": "packages",
  "packages": [
    {
      "name": "Basic Package",
      "description": "6 hours of coverage",
      "price": 1999.99,
      "features": ["6 hours", "Digital gallery", "Online proofing"]
    }
  ]
}
```

## Booking Endpoints

### Search Listings
```
GET /api/listings?location=New+York&category=Photography&date=2025-12-31&guests=100
```

### Create Booking
```
POST /api/bookings
```
**Request Body**
```json
{
  "listingId": "uuid",
  "packageId": "uuid",
  "eventDate": "2025-12-31T18:00:00Z",
  "guestCount": 100,
  "notes": "Please arrive 30 minutes early"
}
```

## CRM Endpoints

### Get Contacts
```
GET /api/vendors/contacts
```

### Create Task
```
POST /api/vendors/tasks
```
**Request Body**
```json
{
  "contactId": "uuid",
  "title": "Follow up on inquiry",
  "description": "Customer asked about wedding package pricing",
  "dueDate": "2025-12-15T18:00:00Z",
  "priority": 1
}
```

## Authentication

### Login
```
POST /api/auth/login
```
**Request Body**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Register
```
POST /api/auth/register
```
**Request Body**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "role": "customer" // or 'vendor'
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```
