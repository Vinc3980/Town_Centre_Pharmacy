# User Manual

## Login

1. Navigate to the application URL
2. Enter your **email** and **password**
3. Click **Sign In**

You will be redirected to the Dashboard after successful login.

## Logout

1. Click your **profile icon** in the top-right corner
2. Select **Logout**
3. You will be redirected to the login page

Your session will also expire after 15 minutes of inactivity. The system will prompt you to refresh your session.

---

## Dashboard

The dashboard provides a real-time overview of pharmacy operations.

**Key metrics displayed:**
- Today's total sales (GHS)
- Number of transactions today
- Total revenue (this month)
- Profit margin
- Low stock alerts
- Expiring medicine warnings

**Recent activity** shows the latest sales and system events.

Use the navigation sidebar to access all modules.

---

## Point of Sale (POS)

The POS is where cashiers process customer purchases.

### Making a Sale

1. Go to **POS** from the sidebar
2. **Add items** by:
   - Scanning a barcode (if barcode scanner connected)
   - Typing a product name in the search box
   - Clicking on items from the product grid
3. Adjust **quantities** using the +/- buttons or typing a number
4. Apply **discounts** if authorized (percentage or fixed amount)
5. Select a **customer** (optional) — useful for tracking purchase history
6. Select **payment method**: Cash, Mobile Money, Card, or Bank Transfer
7. Enter the **amount received** (for cash payments)
8. Click **Complete Sale**

The receipt will be displayed and can be printed.

### Holding a Sale

If a customer needs to step away:
1. Click **Hold Sale**
2. The sale is saved and you can continue with another customer
3. To resume, click **Held Sales** and select the transaction

### Prescription Medications

Medicines marked as `prescriptionRequired` will display a warning. Ensure a valid prescription is on file before completing the sale.

### Sale Limits

- Minimum stock: Sales cannot reduce stock below zero (configurable)
- Expiry check: Batches near expiry are flagged
- FEFO: Stock is deducted from the earliest-expiring batch first

---

## Sales Management

### View Sales

1. Go to **Sales** from the sidebar
2. Browse the list of all transactions
3. Use **filters** to narrow by date range, payment method, or status
4. Click on any sale to view its **detail** and **receipt**

### Refunds

1. Open the sale to be refunded
2. Click **Request Refund**
3. Select the items and quantities to return
4. Choose the **condition**: Resaleable or Damaged
5. Provide a **reason** for the return
6. Submit the request

If manager approval is required, the refund enters a **pending** state until approved.

### Voiding a Sale

Sales can be voided if they were created in error. This requires `process_refunds` permission.

---

## Inventory Management

### View Inventory

1. Go to **Inventory** from the sidebar
2. Browse all medicines with current stock levels
3. Use search and filters to find specific products

### Medicine Information

Each medicine record includes:
- Name, generic name, brand
- Category and manufacturer
- SKU and barcode
- Purchase and selling prices
- Stock thresholds (min, max, reorder level)
- Current batch details with expiry dates

### Receiving Stock

1. Click **Receive Stock**
2. Select the **medicine**
3. Enter **batch number**, **quantity**, **prices**, and **expiry date**
4. Select the **supplier**
5. Submit — the batch is added and inventory movement is logged

### Stock Adjustments

If physical counts differ from system records:
1. Click **Adjust Stock**
2. Select the **medicine** and **batch**
3. Enter the **new quantity** or **adjustment amount**
4. Provide a **reason** (required)
5. Submit — the adjustment is logged for audit

### Low Stock Alerts

Medicines below their `reorderLevel` appear in the low stock report. The dashboard also highlights these.

### Expiry Tracking

Medicines approaching their `expiryDate` are flagged:
- **Warning:** Within 30 days (configurable)
- **Critical:** Expired or within 7 days

---

## Customer Management

### View Customers

1. Go to **Customers** from the sidebar
2. Browse the customer list
3. Search by name or phone number

### Add a Customer

1. Click **Add Customer**
2. Enter **name** and **phone number** (required)
3. Add optional **notes**
4. Save

### Customer Profiles

Each customer profile tracks:
- Purchase history
- Outstanding balance (for credit sales)
- Contact information

---

## Expense Tracking

### Record an Expense

1. Go to **Expenses** from the sidebar
2. Click **Add Expense**
3. Fill in:
   - **Category** (rent, utilities, salaries, transport, maintenance, marketing, etc.)
   - **Description**
   - **Amount**
   - **Date**
   - **Payment method**
4. Optionally upload a **receipt** image or PDF
5. Submit for approval

### Approve Expenses

If you have `manage_expenses` permission:
1. Review pending expenses
2. Click **Approve** or **Reject** (with reason)
3. Approved expenses are included in daily closing reports

---

## Daily Closing

At the end of each shift, cashiers perform a daily closing process.

### 1. Open a Session

1. Go to **Daily Closing** from the sidebar
2. Click **Open Session**
3. Enter the **opening cash** amount (cash in the register at start of day)
4. The session begins tracking all sales

### 2. Process Sales

All sales processed during the session are automatically recorded against it.

### 3. Close Session

1. Click **Close Session** when your shift ends
2. Enter the **actual cash** counted in the register
3. The system calculates:
   - **Expected cash** (opening cash + cash sales - cash refunds - cash expenses)
   - **Variance** (expected - actual)
4. Review the summary and confirm

### 4. Submit Daily Report

1. After closing, click **Submit Report**
2. Review the breakdown:
   - Total sales (by payment method)
   - Refunds
   - Discounts
   - Expenses
   - Cash variance
3. Add **notes** if needed
4. Submit for manager/owner approval

Managers can approve or reject reports from the **Reports** section.

---

## Reports

Reports provide detailed analytics across all pharmacy operations.

### Available Reports

| Report           | Description                                      |
|------------------|--------------------------------------------------|
| **Sales**        | Revenue, transaction counts, trends over time    |
| **Inventory**    | Current stock levels, valuation, movement history |
| **Expenses**     | Operating costs by category and period            |
| **Profit**       | Profit/loss analysis (revenue minus costs)       |
| **Staff**        | Individual cashier/employee performance metrics  |
| **Stock Movements** | Full audit trail of stock changes              |
| **Expiry**       | Medicines approaching or past expiry             |
| **Low Stock**    | Items below reorder level                        |
| **Daily**        | Day-by-day summary                               |
| **Purchases**    | Procurement history from suppliers               |

### Using Reports

1. Navigate to **Reports** from the sidebar
2. Select the report type
3. Set the **date range** (from/to)
4. Click **Generate** or the report loads automatically
5. Export options: Print, PDF, CSV (where available)

---

## Notifications

The notification system alerts you to important events.

### Types of Notifications

| Category            | Description                                |
|---------------------|--------------------------------------------|
| Low stock           | Medicine below reorder level               |
| Expiring medicine   | Batches approaching expiry                 |
| Sale                | Completed sale events                      |
| Refund              | Refund requests and approvals              |
| Daily report        | Report submissions and reviews             |
| Security            | Login attempts, account lockouts           |
| System              | General system events                      |

### Notification Bell

- The bell icon in the header shows unread notification count
- Click to view the notification list
- Mark individual notifications as read or mark all as read

### Real-time Updates

Notifications arrive in real-time via Socket.IO. No page refresh is needed.

---

## Settings

Settings are managed by users with the `manage_settings` permission (owner, branch_manager).

### Pharmacy Settings

- **Name, registration number, contact details**
- **Address and location**
- **Logo** (uploaded for receipts)
- **Currency** (default: GHS)
- **Timezone** (default: Africa/Accra)

### Inventory Settings

- **Low stock threshold** — units triggering alerts
- **Expiry warning days** — days before expiry to warn
- **Allow negative stock** — whether sales can exceed available stock
- **Require manager approval for stock adjustment**

### Sales Settings

- **Tax rate** — percentage applied to sales
- **Tax enabled** — toggle tax calculation
- **Discount authorization required** — require approval for discounts
- **Receipt footer** — text printed at bottom of receipts

### Security Settings

- **Minimum password length**
- **Session expiration minutes**
- **Max login attempts** — before account lockout
- **Lockout duration minutes**
- **Require manager approval for refunds**

---

## Keyboard Shortcuts

The POS screen supports keyboard shortcuts for faster operation:

- **F2** — Focus search box
- **F8** — Complete sale
- **F9** — Hold sale
- **Escape** — Cancel/close dialog
- **+/-** — Adjust quantity
