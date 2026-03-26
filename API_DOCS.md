# EventHub API Documentation

## Base URL
`https://api.eventhub.example.com/v1`

## Authentication
Most protected endpoints require an Auth0 access token in the `Authorization` header:
```
Authorization: Bearer <auth0_access_token>
```

Email/password login/signup API endpoints are not supported. Authentication is handled through Auth0-managed login flows.

## Vendor Identity Model
- One Auth0 user maps to one `vendor_account`.
- A `vendor_account` can own many `vendor_profiles`.
- New vendor profile creation is handled by onboarding completion (`POST /api/vendor/onboarding/complete`), not by legacy standalone profile-create endpoints.

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

### File Booking Dispute (Customer)
```
POST /api/customer/bookings/:id/dispute
```
Rules:
- Allowed only after event end time.
- Allowed only within 24 hours after event end.
- One dispute per booking.

**Request Body**
```json
{
  "reason": "item_not_as_described",
  "details": "Centerpieces arrived damaged and incomplete."
}
```

### Respond to Dispute (Vendor)
```
POST /api/vendor/bookings/:id/dispute/respond
```
**Request Body**
```json
{
  "response": "We can provide replacement items and partial credit."
}
```

### List Disputes (Admin)
```
GET /api/admin/disputes?status=filed
```

### Resolve Dispute (Admin)
```
POST /api/admin/disputes/:id/resolve
```
**Request Body**
```json
{
  "decision": "refund",
  "adminNotes": "Refund approved due documented damages."
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
