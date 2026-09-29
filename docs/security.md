# Security

## Overview

Adom Pharmacy implements defense-in-depth security across authentication, authorization, input validation, network hardening, and audit logging.

## Authentication

### JWT Tokens

The system uses a **dual-token strategy**:

| Token          | Lifetime | Purpose                                    |
|----------------|----------|--------------------------------------------|
| Access token   | 15 minutes | Authenticates API requests               |
| Refresh token  | 7 days   | Obtains new access tokens without re-login |

**Token generation:**
```typescript
// backend/src/services/tokenService.ts
// Access tokens signed with JWT_ACCESS_SECRET
// Refresh tokens signed with JWT_REFRESH_SECRET
// Both secrets must be set in production
```

**Token verification (`requireAuth` middleware):**
1. Extracts `Bearer <token>` from `Authorization` header
2. Verifies signature and expiry using `jwt.verify()`
3. Attaches decoded payload to `req.user`
4. Returns 401 if missing, invalid, or expired

**Refresh token rotation:**
- Each user has a `refreshTokenVersion` counter
- On refresh, the token's version is compared to the stored version
- On logout or password change, the version is incremented, invalidating all existing refresh tokens

### Password Storage

- Passwords are hashed using **bcryptjs** with a salt rounds of 10
- The `passwordHash` field has `select: false` — it is never returned in API responses by default

## Authorization

### Role-Based Access Control (RBAC)

Six roles with progressively more permissions:

| Role               | Permissions |
|--------------------|-------------|
| **owner**          | All 15 permissions |
| **branch_manager** | view_dashboard, manage_medicines, manage_inventory, process_sales, process_refunds, manage_suppliers, view_reports, view_audit_logs, modify_prices, perform_stock_adjustment, manage_expenses, manage_prescriptions, apply_discounts |
| **pharmacist**     | view_dashboard, process_sales, process_refunds, manage_prescriptions, manage_inventory, view_reports, apply_discounts |
| **cashier**        | view_dashboard, process_sales |
| **inventory_officer** | view_dashboard, manage_medicines, manage_inventory, perform_stock_adjustment, manage_suppliers, view_reports |
| **auditor**        | view_dashboard, view_reports, view_audit_logs |

### All 15 Permissions

| Permission                | Description                              |
|---------------------------|------------------------------------------|
| `view_dashboard`          | Access dashboard metrics                 |
| `manage_users`            | Create, update, deactivate users         |
| `manage_medicines`        | CRUD on medicines                        |
| `manage_inventory`        | Receive stock, manage batches            |
| `process_sales`           | Create and manage sales                  |
| `process_refunds`         | Request, approve, void refunds           |
| `manage_suppliers`        | Manage supplier records                  |
| `view_reports`            | Access all report endpoints              |
| `manage_settings`         | Modify pharmacy settings                 |
| `view_audit_logs`         | View audit trail                         |
| `modify_prices`           | Override medicine prices at sale time     |
| `perform_stock_adjustment`| Manually adjust stock counts             |
| `manage_expenses`         | CRUD on expenses                         |
| `manage_prescriptions`    | Handle prescription-related sales        |
| `apply_discounts`         | Apply discounts to sales                 |

### Enforcement

Permissions are enforced at the route level via the `requirePermission` middleware:

```typescript
// backend/src/middleware/permit.ts
export function requirePermission(...permissions: Permission[]) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    const hasAll = permissions.every((p) => req.user.permissions.includes(p));
    if (!hasAll) return next(new ApiError(403, "You don't have permission to do that"));
    next();
  };
}
```

Usage in routes:
```typescript
router.post("/", requirePermission("manage_medicines"), createMedicine);
router.post("/stock/adjust", requirePermission("perform_stock_adjustment"), adjustStock);
```

### Account Lockout

When enabled in pharmacy settings:

1. After `maxLoginAttempts` (default: 5) consecutive failed logins, the account is locked
2. Lockout lasts `lockoutDurationMinutes` (default: 15 minutes)
3. The `loginAttempts` counter is tracked on the User model
4. The `lockedUntil` timestamp is checked before allowing login

## Input Validation

### Zod Schemas

All external input is validated using **Zod** schemas before processing:

```typescript
// Example from validators/
const createMedicineSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().regex(/^[0-9a-f]{24}$/), // MongoDB ObjectId
  sku: z.string().min(1).max(50),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  // ...
});
```

Validation middleware catches:
- Missing required fields
- Wrong types (string where number expected)
- Out-of-range values
- Invalid formats (email, ObjectId, date)
- Extra unexpected fields

### Request Size Limits

- JSON body: **1 MB** maximum (`express.json({ limit: "1mb" })`)
- URL-encoded bodies: Supported
- File uploads: Configured via Multer (default limits apply)

## Rate Limiting

Two rate limiters are configured:

| Endpoint              | Window   | Max Requests | Purpose              |
|-----------------------|----------|--------------|----------------------|
| `/api/*` (all)        | 15 min   | 300          | General API throttle |
| `/api/v1/auth/login`  | 15 min   | 20           | Login brute-force prevention |

**Configuration:**
```typescript
// General limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Login-specific limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts, please try again later" },
});
```

Rate limit headers (`RateLimit-*` / `X-RateLimit-*`) are returned with every response.

## CORS Configuration

```typescript
app.use(cors({
  origin: env.corsOrigin,  // e.g., "http://localhost:5173" or "https://adompharmacy.com"
  credentials: true,        // Allow cookies/auth headers
}));
```

- In development: `http://localhost:5173`
- In production: Set `CORS_ORIGIN` to your deployed frontend domain
- Only one origin is allowed (not a wildcard)

## Helmet / CSP Headers

Helmet is configured with strict Content Security Policy directives:

| Directive         | Value                                        |
|-------------------|----------------------------------------------|
| `defaultSrc`      | `'self'`                                     |
| `scriptSrc`       | `'self'`                                     |
| `styleSrc`        | `'self'`, `'unsafe-inline'`, `https:`        |
| `imgSrc`          | `'self'`, `data:`, `https:`                  |
| `fontSrc`         | `'self'`, `https:`, `data:`                  |
| `connectSrc`      | `'self'`                                     |
| `frameAncestors`  | `'self'`                                     |
| `formAction`      | `'self'`                                     |
| `objectSrc`       | `'none'`                                     |

Additional security headers:
- `crossOriginEmbedderPolicy: true`
- `crossOriginOpenerPolicy: same-origin`
- `crossOriginResourcePolicy: same-origin`
- `referrerPolicy: no-referrer`
- `upgradeInsecureRequests`: enabled in production

## MongoDB Injection Prevention

```typescript
import mongoSanitize from "express-mongo-sanitize";

app.use(mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    logger.warn({ key, ip: req.ip }, "NoSQL injection attempt blocked");
  },
}));
```

This middleware sanitizes incoming request data by replacing `$` and `.` characters in keys with `_`, preventing MongoDB operator injection (e.g., `{"$gt": ""}` queries).

## Audit Logging

Every significant system action is recorded in the `AuditLog` collection:

```typescript
{
  user: ObjectId,        // Who performed the action
  userName: String,      // Denormalized name
  action: String,        // e.g., "SALE_CREATED", "USER_LOGIN", "MEDICINE_UPDATED"
  module: String,        // e.g., "sales", "auth", "inventory"
  entity: String,        // e.g., "Sale", "User", "Medicine"
  entityId: String,      // ID of the affected document
  description: String,   // Human-readable description
  before: Mixed,         // State before mutation (for updates)
  after: Mixed,          // State after mutation
  ipAddress: String,     // Client IP
  userAgent: String,     // Client user-agent
}
```

Audit logs are **append-only** — they cannot be modified or deleted through the API.

## Additional Security Measures

### HTTPS (Production)

- All production deployments should use HTTPS
- Set `NODE_ENV=production` to enforce strict security defaults
- JWT secrets are **required** in production (app won't start without them)

### Session Management

- Access tokens expire in 15 minutes (configurable via `JWT_ACCESS_EXPIRES`)
- Refresh tokens expire in 7 days (configurable via `JWT_REFRESH_EXPIRES`)
- Logout invalidates the refresh token version
- The `requireAuth` middleware verifies tokens on every protected request

### File Upload Security

- Multer handles file uploads with size limits
- Uploaded files are served behind authentication (`requireAuth` on static route)
- File types should be validated at the application level

### Personal Data Storage (Ghana Card)

- Customer national ID numbers are stored in `customers.ghanaCardNumber` as **plain text**
- This is a deliberate, documented decision: values are captured for credit-sale identity checks and must remain readable by pharmacy staff — no encryption-at-rest or hashing is applied at the application layer
- The field is optional and is only required by the POS when a credit sale is charged (walk-in customers without a card cannot be put on credit)
- Like other customer PII (name, phone, address, allergies), it is protected by authentication/authorization on the API, never returned outside customer endpoints, and must be handled per your data-retention policy
- If regulatory requirements change, column-level encryption can be added without changing the API contract

### Error Handling

- Global error handler catches unhandled errors
- Structured `ApiError` class provides consistent error responses
- In production, stack traces are not exposed to clients
- Errors are logged via Pino for monitoring
