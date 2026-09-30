# Admin Manual

## Overview

This manual covers administrative tasks for system owners and branch managers. Admin features require the `manage_users`, `manage_settings`, or `view_audit_logs` permissions.

## User Management

### Viewing Users

1. Navigate to **Settings** â†’ **User Management** (or **Users** in sidebar)
2. Browse the list of all system users
3. Use search to find users by name or email
4. View each user's role, status, and last login

### Creating a New User

1. Click **Add User**
2. Fill in the form:
   - **Name** â€” Full name
   - **Email** â€” Login email (must be unique)
   - **Phone** â€” Contact number (optional)
   - **Password** â€” Initial password (must meet minimum length requirement)
   - **Role** â€” Select from the dropdown
   - **Branch** â€” Assign to a branch (default: Main Branch)
3. Click **Save**

The new user can log in immediately with the provided credentials.

### Understanding Roles

| Role               | Capabilities |
|--------------------|--------------|
| **Owner**          | Full system access. Can manage users, settings, and all modules. |
| **Branch Manager** | Can manage medicines, inventory, sales, refunds, suppliers, expenses, and view reports/audit logs. Cannot manage users or settings. |
| **Pharmacist**     | Can process sales, refunds, manage prescriptions, inventory, and view reports. |
| **Cashier**        | Can only process sales and view the dashboard. |
| **Inventory Officer** | Can manage medicines, inventory, stock adjustments, and suppliers. |
| **Auditor**        | Read-only access to dashboard, reports, and audit logs. |

### Role Assignment Guidelines

- Assign the **least privileged role** needed for the user's job function
- Use **owner** sparingly â€” typically only the pharmacy owner/proprietor
- **Branch manager** for shift supervisors and floor managers
- **Pharmacist** for licensed pharmacists who handle prescriptions
- **Cashier** for front-desk sales staff
- **Inventory officer** for warehouse/stock room staff
- **Auditor** for accountants and compliance reviewers

### Deactivating a User

1. Go to the user's profile
2. Click **Deactivate**
3. Confirm the action

A deactivated user:
- Cannot log in
- Is hidden from active user lists
- Existing records (sales, audit logs) retain the user's name for historical accuracy

### Reactivating a User

1. Filter the user list to show inactive users
2. Click **Reactivate** on the desired user
3. The user can log in again

### Password Policies

- Minimum password length is configurable (default: 6 characters)
- Passwords are stored as bcrypt hashes â€” never in plain text
- Consider enforcing periodic password changes via policy

---

## Pharmacy Settings

### General Information

1. Go to **Settings** â†’ **Pharmacy**
2. Update the pharmacy details:
   - **Name** â€” Official pharmacy name
   - **Registration Number** â€” Regulatory registration ID
   - **Phone / Email** â€” Contact details
   - **Address / City / Region / Country** â€” Location
   - **Logo** â€” Upload for receipt branding
   - **Currency** â€” Display currency (default: GHS)
   - **Timezone** â€” For date/time display (default: Africa/Accra)
3. Save changes

This information appears on receipts and reports.

---

## Security Settings

### Configuring Password Policy

1. Go to **Settings** â†’ **Security**
2. Set **Minimum Password Length** (minimum: 4, recommended: 8+)
3. Save

### Configuring Session Management

1. Set **Session Expiration Minutes** â€” How long before idle users are logged out (default: 60 minutes)
2. Set **Max Login Attempts** â€” Failed attempts before lockout (default: 5)
3. Set **Lockout Duration Minutes** â€” How long the account stays locked (default: 15)
4. Save

### Configuring Refund Approval

- **Require Manager Approval for Refund** â€” When enabled, all refunds enter a pending state and must be approved by a manager or owner before processing
- Toggle this based on your trust level and staffing

### Configuring Stock Adjustment Approval

- **Require Manager Approval for Stock Adjustment** â€” When enabled, manual stock adjustments need manager sign-off
- Recommended for pharmacies with inventory shrinkage concerns

---

## Inventory Settings

### Low Stock Threshold

Set the default number of units that triggers a low-stock alert:
- Default: 10 units
- Adjust based on your average daily sales volume
- Higher values give more lead time for reordering

### Expiry Warning Days

Set how many days before expiry to start warning:
- Default: 30 days
- Increase for medications with longer lead times
- Decrease for fast-moving products

### Allow Negative Stock

- **Disabled (default):** Sales cannot reduce stock below zero
- **Enabled:** Allows overselling (useful for pre-orders or drop-shipping)

### Approval Requirements

- **Require Manager Approval for Stock Adjustment:** All manual adjustments need sign-off
- **Require Manager Approval for Refunds:** All refunds need manager approval

---

## Sales Settings

### Tax Configuration

1. **Tax Enabled** â€” Toggle tax calculation on/off
2. **Tax Rate** â€” Percentage applied to sales (e.g., 15 for 15%)
3. Save

When enabled, tax is calculated on each sale and included in totals and reports.

### Discount Authorization

- **Discount Authorization Required:** When enabled, only users with `apply_discounts` permission can apply discounts at the POS
- Recommended: Enable to prevent unauthorized price reductions

### Receipt Footer

Customize the text printed at the bottom of receipts:
- Default: "Thank you for choosing Town Centre Pharmacy"
- Common additions: Return policy, contact info, license number

---

## Audit Log Review

### Viewing Audit Logs

1. Go to **Audit** from the sidebar
2. Browse the chronological log of all system actions
3. Use **filters** to narrow by:
   - **Module** (auth, sales, inventory, etc.)
   - **Action** (USER_LOGIN, SALE_CREATED, etc.)
   - **User** (specific staff member)
   - **Date range**

### What Gets Logged

Every significant action creates an audit record:

| Event Type          | What's Logged                              |
|---------------------|--------------------------------------------|
| User login/logout   | IP address, user-agent, success/failure    |
| Sale created        | Items, amounts, cashier, customer          |
| Sale voided/refunded| Original sale, reason, approver            |
| Medicine created/updated | Before/after state, user              |
| Stock received      | Medicine, batch, quantity, supplier        |
| Stock adjusted      | Medicine, old qty, new qty, reason         |
| Expense created/approved | Category, amount, approver            |
| Settings changed    | Before/after values, user                  |
| User created/deactivated | Target user, role, action              |

### Using Audit Logs for Compliance

- Review logs periodically for unusual activity
- Check for multiple failed login attempts (security concern)
- Verify that price changes are authorized
- Confirm refund approvals follow policy
- Export logs for external auditors if needed

### Interpreting Log Entries

Each audit log entry contains:

```json
{
  "user": "User who performed the action",
  "userName": "Denormalized name",
  "action": "SALE_CREATED",
  "module": "sales",
  "entity": "Sale",
  "entityId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "description": "Kwame Osei completed a sale for GHS 85.00",
  "before": null,
  "after": { /* sale snapshot */ },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "createdAt": "2026-01-15T14:30:00Z"
}
```

---

## System Monitoring

### Health Check

Monitor API availability:
```
GET /api/v1/health
```

Response when healthy:
```json
{ "success": true, "message": "API is healthy" }
```

### Key Metrics to Monitor

| Metric                    | Warning Threshold           |
|---------------------------|-----------------------------|
| Failed login attempts     | > 10 per hour               |
| Stock variance            | Any non-zero variance       |
| Refund rate               | > 5% of sales               |
| Expired medicine          | Any units past expiry       |
| API response time         | > 2 seconds                 |
| Database connection       | Failures or timeouts        |

### Log Monitoring

Logs are output in JSON format (via Pino) for easy parsing:
- **Development:** Pretty-printed to console
- **Production:** JSON to stdout (use a log aggregator like Datadog, Logtail, or ELK stack)

### Recommended Monitoring Tools

- **Uptime monitoring:** UptimeRobot, BetterStack
- **Error tracking:** Sentry
- **Log aggregation:** Datadog, Logtail, Papertrail
- **Database monitoring:** MongoDB Atlas built-in monitoring

---

## Troubleshooting

### User Cannot Log In

1. Check if the account is active (not deactivated)
2. Check if the account is locked (too many failed attempts)
3. Verify the email is correct (case-insensitive)
4. Check if the password meets minimum length requirements
5. Review audit logs for the login attempt details

### Sale Shows Zero Stock

1. Check if `allowNegativeStock` is enabled in sales settings
2. Verify the batch has sufficient quantity
3. Check if other POS terminals sold the same stock simultaneously
4. Consider performing a stock adjustment if the count is wrong

### Reports Show Incorrect Totals

1. Verify daily sessions were properly closed
2. Check for voided or refunded sales in the period
3. Ensure all expenses were recorded and approved
4. Check the date range filters

### Notifications Not Appearing

1. Verify Socket.IO connection (check browser console)
2. Check the user's role is in `targetRoles` for the notification
3. Ensure the notification wasn't already marked as read
