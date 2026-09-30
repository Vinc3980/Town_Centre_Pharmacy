# API Documentation

## Base URL

```
Production:  https://api.towncentrepharmacy.com/api/v1
Development: http://localhost:5000/api/v1
```

All endpoints are prefixed with `/api/v1`.

## Authentication

Most endpoints require a valid JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Login

```
POST /api/v1/auth/login
```

**Body:**
```json
{
  "email": "owner@towncentrepharmacy.gh",
  "password": "Owner123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "name": "Nana Adjei (Owner)",
      "email": "owner@towncentrepharmacy.gh",
      "role": "owner",
      "permissions": ["view_dashboard", "manage_users", ...]
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

**Rate limited:** 20 requests per 15 minutes per IP.

### Refresh Token

```
POST /api/v1/auth/refresh
```

**Body:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### Logout

```
POST /api/v1/auth/logout
```

Requires `Authorization: Bearer <access_token>`. Invalidates the refresh token by incrementing `refreshTokenVersion`.

### Get Current User

```
GET /api/v1/auth/me
```

Requires authentication. Returns the authenticated user's profile.

## Error Format

All errors follow this structure:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP status codes:

| Code  | Meaning                    |
|-------|----------------------------|
| 400   | Bad request / validation   |
| 401   | Not authenticated          |
| 403   | Insufficient permissions   |
| 404   | Resource not found         |
| 409   | Conflict (duplicate, etc.) |
| 422   | Unprocessable entity       |
| 429   | Rate limit exceeded        |
| 500   | Internal server error      |

## Pagination

List endpoints support query parameters:

| Parameter | Default | Description                     |
|-----------|---------|---------------------------------|
| `page`    | 1       | Page number                     |
| `limit`   | 20      | Items per page (max: 100)       |
| `search`  | â€”       | Full-text search term           |
| `sort`    | -createdAt | Sort field (prefix `-` for descending) |

**Paginated response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

## Endpoints by Module

### Health

| Method | Endpoint       | Auth | Description          |
|--------|----------------|------|----------------------|
| GET    | `/health`      | No   | Legacy health check  |
| GET    | `/api/v1/health` | No | API health check     |

### Auth

| Method | Endpoint           | Auth | Description          |
|--------|--------------------|------|----------------------|
| POST   | `/auth/login`      | No   | Login                |
| POST   | `/auth/refresh`    | No   | Refresh tokens       |
| POST   | `/auth/logout`     | Yes  | Logout               |
| GET    | `/auth/me`         | Yes  | Current user profile |

### Medicines

| Method | Endpoint                        | Auth | Permission            | Description              |
|--------|---------------------------------|------|-----------------------|--------------------------|
| GET    | `/medicines`                    | Yes  | â€”                     | List/search medicines    |
| POST   | `/medicines`                    | Yes  | `manage_medicines`    | Create medicine          |
| PUT    | `/medicines/:id`                | Yes  | `manage_medicines`    | Update medicine          |
| DELETE | `/medicines/:id`                | Yes  | `manage_medicines`    | Delete medicine          |
| POST   | `/medicines/:id/discontinue`    | Yes  | `manage_medicines`    | Discontinue medicine     |
| GET    | `/medicines/barcode/:barcode`   | Yes  | â€”                     | Lookup by barcode        |
| POST   | `/medicines/stock/receive`      | Yes  | `manage_inventory`    | Receive stock (new batch)|
| POST   | `/medicines/stock/adjust`       | Yes  | `perform_stock_adjustment` | Adjust stock levels |
| GET    | `/medicines/reports/low-stock`  | Yes  | `view_reports`        | Low stock report         |
| GET    | `/medicines/reports/expiry`     | Yes  | `view_reports`        | Expiry report            |

**Create medicine body:**
```json
{
  "name": "Paracetamol 500mg",
  "category": "<categoryId>",
  "sku": "SKU-0067",
  "barcode": "890123001001",
  "purchasePrice": 3,
  "sellingPrice": 5,
  "minStock": 10,
  "maxStock": 500,
  "reorderLevel": 25,
  "prescriptionRequired": false,
  "form": "Tablet",
  "supplier": "<supplierId>"
}
```

**Receive stock body:**
```json
{
  "medicineId": "<medicineId>",
  "batchNumber": "B-SKU-0067-1",
  "quantity": 100,
  "purchasePrice": 3,
  "sellingPrice": 5,
  "expiryDate": "2027-01-15",
  "supplier": "<supplierId>"
}
```

### Sales

| Method | Endpoint                    | Auth | Permission        | Description              |
|--------|-----------------------------|------|-------------------|--------------------------|
| GET    | `/sales`                    | Yes  | `view_reports`    | List all sales           |
| POST   | `/sales`                    | Yes  | `process_sales`   | Create sale              |
| GET    | `/sales/:id`                | Yes  | `view_reports`    | Sale detail              |
| GET    | `/sales/:id/receipt`        | Yes  | `view_reports`    | Sale receipt             |
| POST   | `/sales/hold`               | Yes  | `process_sales`   | Hold (park) a sale       |
| GET    | `/sales/held`               | Yes  | `process_sales`   | List held sales          |
| POST   | `/sales/:id/resume`         | Yes  | `process_sales`   | Resume a held sale       |
| DELETE | `/sales/:id/held`           | Yes  | `process_sales`   | Delete held sale         |
| POST   | `/sales/:id/refund`         | Yes  | `process_refunds` | Request refund           |
| POST   | `/sales/:id/void`           | Yes  | `process_refunds` | Void a sale              |
| POST   | `/sales/refunds/:returnId/approve` | Yes | `process_refunds` | Approve refund     |
| GET    | `/sales/refunds/pending`    | Yes  | `process_refunds` | List pending refunds     |

**Create sale body:**
```json
{
  "items": [
    {
      "medicine": "<medicineId>",
      "batch": "<batchId>",
      "name": "Paracetamol 500mg",
      "quantity": 2,
      "unitPrice": 5,
      "discount": 0,
      "subtotal": 10
    }
  ],
  "customer": "<customerId>",
  "paymentMethod": "cash",
  "amountReceived": 50,
  "discount": 0,
  "tax": 0
}
```

### Customers

| Method | Endpoint          | Auth | Permission      | Description       |
|--------|-------------------|------|-----------------|-------------------|
| GET    | `/customers`      | Yes  | â€”               | List customers    |
| POST   | `/customers`      | Yes  | `process_sales` | Create customer   |
| PUT    | `/customers/:id`  | Yes  | `process_sales` | Update customer   |

### Expenses

| Method | Endpoint              | Auth | Permission      | Description          |
|--------|-----------------------|------|-----------------|----------------------|
| GET    | `/expenses`           | Yes  | `manage_expenses` | List expenses      |
| GET    | `/expenses/:id`       | Yes  | `manage_expenses` | Get expense detail |
| POST   | `/expenses`           | Yes  | `manage_expenses` | Create expense     |
| PUT    | `/expenses/:id`       | Yes  | `manage_expenses` | Update expense     |
| POST   | `/expenses/:id/approve` | Yes | `manage_expenses` | Approve expense  |

**Create expense body:** Supports `multipart/form-data` with a `receipt` file field.

### Users

| Method | Endpoint                 | Auth | Permission    | Description          |
|--------|--------------------------|------|---------------|----------------------|
| GET    | `/users`                 | Yes  | `manage_users` | List users          |
| GET    | `/users/:id`             | Yes  | `manage_users` | Get user detail     |
| POST   | `/users`                 | Yes  | `manage_users` | Create user         |
| PUT    | `/users/:id`             | Yes  | `manage_users` | Update user         |
| POST   | `/users/:id/deactivate`  | Yes  | `manage_users` | Deactivate user     |
| POST   | `/users/:id/reactivate`  | Yes  | `manage_users` | Reactivate user     |

### Dashboard

| Method | Endpoint          | Auth | Permission     | Description         |
|--------|-------------------|------|----------------|---------------------|
| GET    | `/dashboard`      | Yes  | `view_dashboard` | Dashboard summary |

Returns today's sales totals, recent transactions, low-stock alerts, and expiring medicine warnings.

### Daily Operations (Sessions & Reports)

| Method | Endpoint                        | Auth | Permission     | Description               |
|--------|---------------------------------|------|----------------|---------------------------|
| POST   | `/daily/sessions`               | Yes  | `process_sales` | Open cash session        |
| POST   | `/daily/sessions/close`         | Yes  | `process_sales` | Close cash session       |
| GET    | `/daily/sessions/current`       | Yes  | `process_sales` | Get current open session |
| GET    | `/daily/sessions`               | Yes  | `view_reports`  | List all sessions        |
| POST   | `/daily/reports/submit`         | Yes  | `process_sales` | Submit daily report      |
| GET    | `/daily/reports/pending`        | Yes  | `view_reports`  | List pending reports     |
| GET    | `/daily/reports`                | Yes  | `view_reports`  | List all reports         |
| GET    | `/daily/reports/:id`            | Yes  | `view_reports`  | Get report detail        |
| POST   | `/daily/reports/:id/approve`    | Yes  | `view_reports`  | Approve report           |
| POST   | `/daily/reports/:id/reject`     | Yes  | `view_reports`  | Reject report            |

### Reports

All report endpoints require `view_reports` permission.

| Method | Endpoint                   | Description                      |
|--------|----------------------------|----------------------------------|
| GET    | `/reports/sales`           | Sales report (by date range)     |
| GET    | `/reports/inventory`       | Inventory summary                |
| GET    | `/reports/expenses`        | Expense report                   |
| GET    | `/reports/profit`          | Profit/loss report               |
| GET    | `/reports/staff`           | Staff performance report         |
| GET    | `/reports/stock-movements` | Stock movement history           |
| GET    | `/reports/expiry`          | Expiry report                    |
| GET    | `/reports/low-stock`       | Low stock report                 |
| GET    | `/reports/daily`           | Daily summary                    |
| GET    | `/reports/purchases`       | Purchase report                  |

Report endpoints accept query parameters for date filtering:
```
GET /api/v1/reports/sales?from=2026-01-01&to=2026-01-31
```

### Audit Logs

| Method | Endpoint          | Auth | Permission         | Description       |
|--------|-------------------|------|--------------------|-------------------|
| GET    | `/audit`          | Yes  | `view_audit_logs`  | List audit logs   |
| GET    | `/audit/:id`      | Yes  | `view_audit_logs`  | Get log detail    |

### Notifications

| Method | Endpoint                  | Auth | Description           |
|--------|---------------------------|------|-----------------------|
| GET    | `/notifications`          | Yes  | List notifications    |
| GET    | `/notifications/unread-count` | Yes | Get unread count  |
| POST   | `/notifications/:id/read` | Yes  | Mark as read          |
| POST   | `/notifications/read-all` | Yes  | Mark all as read      |

### Settings

All settings endpoints require `manage_settings` permission.

| Method | Endpoint                | Description                    |
|--------|-------------------------|--------------------------------|
| GET    | `/settings`             | Get all settings               |
| GET    | `/settings/pharmacy`    | Get pharmacy info              |
| PUT    | `/settings/pharmacy`    | Update pharmacy info           |
| GET    | `/settings/inventory`   | Get inventory settings         |
| PUT    | `/settings/inventory`   | Update inventory settings      |
| GET    | `/settings/sales`       | Get sales settings             |
| PUT    | `/settings/sales`       | Update sales settings          |
| GET    | `/settings/security`    | Get security settings          |
| PUT    | `/settings/security`    | Update security settings       |

### Activity

| Method | Endpoint          | Auth | Description           |
|--------|-------------------|------|-----------------------|
| GET    | `/activity`       | Yes  | Recent activity feed  |

### Profile

| Method | Endpoint          | Auth | Description           |
|--------|-------------------|------|-----------------------|
| GET    | `/profile`        | Yes  | Get own profile       |
| PUT    | `/profile`        | Yes  | Update own profile    |

## File Uploads

Expense receipts are uploaded via `multipart/form-data`:

```bash
curl -X POST http://localhost:5000/api/v1/expenses \
  -H "Authorization: Bearer <token>" \
  -F "category=rent" \
  -F "description=Office rent" \
  -F "amount=500" \
  -F "date=2026-01-15" \
  -F "receipt=@./receipt.pdf"
```

Uploaded files are served at `/uploads/<filename>` (requires authentication).

## Socket.IO Events

Connect to the backend with Socket.IO for real-time updates:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { token: "<accessToken>" }
});

socket.on("sale:created", (sale) => { /* ... */ });
socket.on("notification:new", (notification) => { /* ... */ });
socket.on("stock:low", (data) => { /* ... */ });
```
