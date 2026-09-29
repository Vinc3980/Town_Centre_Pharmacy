# Database Documentation

## Overview

Adom Pharmacy uses **MongoDB** (via Mongoose 8.x) as its primary data store. The database name is `adom-pharmacy` (configurable via `MONGODB_URI`).

## Collections

### Users

Stores all system users with role-based access control.

| Field                | Type     | Description                              |
|----------------------|----------|------------------------------------------|
| name                 | String   | Full name (required, trimmed)            |
| email                | String   | Unique, lowercase, indexed               |
| phone                | String   | Optional contact number                  |
| passwordHash         | String   | bcrypt hash, excluded by default (`select: false`) |
| role                 | String   | One of: owner, branch_manager, pharmacist, cashier, inventory_officer, auditor |
| permissions          | [String] | Array of permission strings              |
| branch               | String   | Branch assignment (default: "Main Branch") |
| isActive             | Boolean  | Account enabled/disabled                 |
| lastLoginAt          | Date     | Last successful login timestamp          |
| loginAttempts        | Number   | Failed login counter for lockout         |
| lockedUntil          | Date     | Account lockout expiry                   |
| refreshTokenVersion  | Number   | Incremented to invalidate all refresh tokens |

**Indexes:** `email` (unique)

### Pharmacies

Top-level pharmacy entity with nested settings.

| Field                | Type              | Description                        |
|----------------------|-------------------|------------------------------------|
| name                 | String            | Pharmacy name (required)           |
| registrationNumber   | String            | Unique registration ID             |
| phone, email         | String            | Contact details                    |
| address, city, region, country | String | Location fields                   |
| logoUrl              | String            | Optional logo path                 |
| currency             | String            | Default: "GHS"                     |
| timezone             | String            | Default: "Africa/Accra"            |
| status               | String            | active / inactive / suspended      |
| settings             | PharmacySettings  | Nested settings object             |

**Settings sub-document:**

| Setting                            | Default | Description                       |
|------------------------------------|---------|-----------------------------------|
| lowStockThreshold                  | 10      | Units triggering low-stock alert  |
| expiryWarningDays                  | 30      | Days before expiry to warn        |
| receiptFooter                      | "Thank you..." | Receipt footer text         |
| allowNegativeStock                 | false   | Allow selling below zero stock    |
| requireManagerApprovalForRefund    | true    | Require approval for refunds      |
| requireManagerApprovalForStockAdjustment | true | Require approval for adjustments |
| taxRate                            | 0       | Tax percentage                    |
| taxEnabled                         | false   | Enable tax calculation            |
| discountAuthorizationRequired      | true    | Require auth for discounts        |
| minPasswordLength                  | 6       | Minimum password length           |
| sessionExpirationMinutes           | 60      | Session timeout                   |
| maxLoginAttempts                   | 5       | Lockout threshold                 |
| lockoutDurationMinutes             | 15      | Lockout duration                  |

**Indexes:** `name`, `email`, `status`

### Branches

Multi-branch support (prepared for future expansion).

| Field       | Type     | Description                          |
|-------------|----------|--------------------------------------|
| pharmacyId  | ObjectId | Ref → Pharmacy (required)            |
| name        | String   | Branch name                          |
| code        | String   | Unique branch code (uppercase)       |
| address     | String   | Branch address                       |
| phone       | String   | Branch phone                         |
| managerId   | ObjectId | Ref → User (branch manager)          |
| status      | String   | active / inactive                    |

**Indexes:** `pharmacyId`, compound unique on `(pharmacyId, name)` and `(pharmacyId, code)`, `(pharmacyId, status)`

### Categories

Medicine classification categories.

| Field       | Type     | Description                          |
|-------------|----------|--------------------------------------|
| name        | String   | Category name (unique, required)     |
| description | String   | Optional description                 |

### Suppliers

Pharmaceutical suppliers.

| Field           | Type   | Description                        |
|-----------------|--------|------------------------------------|
| name            | String | Supplier name (required)           |
| contactPerson   | String | Primary contact                    |
| phone           | String | Contact phone                      |
| email           | String | Contact email                      |
| address         | String | Physical address                   |
| outstandingBalance | Number | Amount owed (default: 0)       |

### Medicines

Core product catalog.

| Field              | Type     | Description                          |
|--------------------|----------|--------------------------------------|
| name               | String   | Product name (indexed)               |
| genericName        | String   | Generic/drug name                    |
| brand              | String   | Brand name                           |
| category           | ObjectId | Ref → Category (required)            |
| manufacturer       | String   | Manufacturing company                |
| dosage, strength, form | String | Product specifications            |
| barcode            | String   | Barcode number (indexed)             |
| sku                | String   | Stock keeping unit (unique, indexed) |
| prescriptionRequired | Boolean | Whether prescription is needed     |
| description        | String   | Product description                  |
| supplier           | ObjectId | Ref → Supplier                       |
| purchasePrice      | Number   | Cost price (required)                |
| sellingPrice       | Number   | Retail price (required)              |
| minStock, maxStock, reorderLevel | Number | Stock thresholds             |
| status             | String   | active / discontinued                |

**Indexes:** `name`, `barcode`, `sku` (unique)

### MedicineBatches

Individual stock batches with expiry tracking.

| Field            | Type     | Description                          |
|------------------|----------|--------------------------------------|
| medicine         | ObjectId | Ref → Medicine (indexed)             |
| batchNumber      | String   | Batch identifier (indexed)           |
| quantity         | Number   | Current stock (min: 0)               |
| purchasePrice    | Number   | Batch cost price                     |
| sellingPrice     | Number   | Batch retail price                   |
| manufacturingDate | Date    | When produced                        |
| expiryDate       | Date     | Expiration date (indexed)            |
| supplier         | ObjectId | Ref → Supplier                       |
| dateReceived     | Date     | When stock was received              |

**Static method:** `findFefo(medicineId)` — returns batches sorted by expiry date (First Expiry, First Out), excluding zero-stock batches.

**Indexes:** `medicine`, `batchNumber`, `expiryDate`

### Sales

Transaction records for all sales.

| Field            | Type           | Description                          |
|------------------|----------------|--------------------------------------|
| transactionNumber| String         | Unique invoice number (indexed)      |
| items            | [SaleItem]     | Embedded array of line items         |
| customer         | ObjectId       | Ref → Customer (optional)            |
| cashier          | ObjectId       | Ref → User (required, indexed)       |
| branch           | String         | Branch name                          |
| subtotal         | Number         | Pre-tax total                        |
| discount         | Number         | Total discount applied               |
| tax              | Number         | Total tax applied                    |
| total            | Number         | Final amount                         |
| costOfGoods      | Number         | Total cost for profit calculation    |
| payments         | [SalePayment]  | Embedded payment records             |
| paymentMethod    | String         | Primary payment method               |
| amountReceived   | Number         | Amount tendered (cash)               |
| change           | Number         | Change given                         |
| status           | String         | completed / partially_refunded / refunded / voided / held |
| refundReason     | String         | Reason for refund                    |
| refundedAmount   | Number         | Amount refunded                      |

**SaleItem:** `{ medicine, batch, name, quantity, unitPrice, discount, subtotal }`

**SalePayment:** `{ method: cash|mobile_money|card|bank_transfer|other, amount, reference, date }`

**Indexes:** `transactionNumber` (unique), `cashier`, `status`, `createdAt` (descending)

### SaleReturns

Refund/return requests and their approval status.

| Field            | Type              | Description                        |
|------------------|-------------------|------------------------------------|
| sale             | ObjectId          | Ref → Sale (indexed)               |
| transactionNumber| String            | Unique return ID                   |
| items            | [SaleReturnItem]  | Items being returned               |
| refundAmount     | Number            | Total refund value                 |
| status           | String            | pending / approved / rejected / completed |
| requestedBy      | ObjectId          | Ref → User who requested           |
| approvedBy       | ObjectId          | Ref → User who approved            |
| rejectionReason  | String            | Why rejected                       |
| processedAt      | Date              | When approved/rejected             |

**SaleReturnItem:** `{ medicine, batch, name, originalQuantity, returnQuantity, unitPrice, subtotal, condition: resaleable|damaged, reason }`

**Indexes:** `sale`, `status` (unique on `transactionNumber`), `createdAt` (descending)

### Customers

Customer records for sales tracking.

| Field              | Type   | Description                        |
|--------------------|--------|------------------------------------|
| name               | String | Customer name (required)           |
| phone              | String | Phone number (indexed)             |
| outstandingBalance | Number | Amount owed (default: 0)           |
| notes              | String | Optional notes                     |

**Indexes:** `phone`

### InventoryMovements

Audit trail for all stock changes.

| Field          | Type     | Description                          |
|----------------|----------|--------------------------------------|
| medicine       | ObjectId | Ref → Medicine (indexed)             |
| batch          | ObjectId | Ref → MedicineBatch                  |
| type           | String   | receive / sale / adjustment / transfer / damaged / expired / return |
| quantityChange | Number   | Positive for inbound, negative for outbound |
| reason         | String   | Explanation for the movement         |
| performedBy    | ObjectId | Ref → User (required)                |

**Indexes:** `medicine`

### Expenses

Operating expense records.

| Field          | Type     | Description                          |
|----------------|----------|--------------------------------------|
| category       | String   | rent / utilities / salaries / transport / supplier_payment / maintenance / marketing / insurance / taxes / misc |
| description    | String   | Expense description (required)       |
| amount         | Number   | Expense amount (required)            |
| paymentMethod  | String   | cash / mobile_money / card / bank_transfer / other |
| recordedBy     | ObjectId | Ref → User (required)                |
| approvedBy     | ObjectId | Ref → User (who approved)            |
| status         | String   | pending / approved / rejected        |
| rejectionReason| String   | Why rejected                         |
| receiptUrl     | String   | Path to uploaded receipt             |
| date           | Date     | Expense date (indexed)               |

**Indexes:** `status`, `category`, `createdAt` (descending)

### DailySessions

Cash register session tracking.

| Field           | Type            | Description                       |
|-----------------|-----------------|-----------------------------------|
| user            | ObjectId        | Ref → User (indexed)              |
| date            | Date            | Session date                      |
| openingCash     | Number          | Starting cash amount (min: 0)     |
| status          | String          | open / closed                     |
| closedAt        | Date            | When closed                       |
| closeAggregates | CloseAggregates | Nested closing summary            |

**CloseAggregates:** `{ totalSales, cashSales, mobileMoneySales, cardSales, bankTransferSales, refunds, cashRefunds, discounts, expenses, cashExpenses, expectedCash, actualCash, variance }`

**Indexes:** `(user, date)` descending, `status`

### DailyReports

End-of-day reports submitted by cashiers.

| Field              | Type     | Description                          |
|--------------------|----------|--------------------------------------|
| session            | ObjectId | Ref → DailySession (indexed)         |
| user               | ObjectId | Ref → User (required)                |
| date               | Date     | Report date                          |
| totalSales, cashSales, mobileMoneySales, cardSales, bankTransferSales | Number | Sales breakdown |
| refunds, cashRefunds | Number | Refund totals                      |
| discounts          | Number   | Total discounts                      |
| expenses, cashExpenses | Number | Expense totals                   |
| expectedCash       | Number   | Calculated expected cash on hand     |
| actualCash         | Number   | Counted cash on hand                 |
| variance           | Number   | expectedCash - actualCash            |
| notes              | String   | Optional notes                       |
| status             | String   | draft / submitted / approved / rejected |
| reviewedBy         | ObjectId | Ref → User who reviewed              |
| reviewNotes        | String   | Reviewer comments                    |
| reviewedAt         | Date     | When reviewed                        |

**Indexes:** `(user, date)` descending, `status`

### Notifications

In-app notification system.

| Field       | Type     | Description                          |
|-------------|----------|--------------------------------------|
| title       | String   | Notification title (required)        |
| message     | String   | Notification body (required)         |
| priority    | String   | info / warning / critical            |
| category    | String   | low_stock / expiring_medicine / sale / refund / daily_report / security / system |
| user        | ObjectId | Ref → User (specific recipient)      |
| isRead      | Boolean  | Read status (default: false)         |
| targetRoles | [String] | Roles to notify (default: ["owner"]) |
| referenceId | String   | Related entity ID                    |

**Indexes:** `(user, isRead, createdAt)`, `(targetRoles, isRead, createdAt)`, `(category, referenceId)`

### AuditLogs

Immutable audit trail for all system actions.

| Field       | Type     | Description                          |
|-------------|----------|--------------------------------------|
| user        | ObjectId | Ref → User (indexed)                 |
| userName    | String   | Denormalized user name               |
| pharmacy    | ObjectId | Ref → Pharmacy                       |
| branch      | String   | Branch name                          |
| action      | String   | Action identifier (indexed) e.g. SALE_CREATED, USER_LOGIN |
| module      | String   | Module name (indexed) e.g. sales, auth, inventory |
| entity      | String   | Entity type (indexed)                |
| entityId    | String   | Entity ID (indexed)                  |
| description | String   | Human-readable description           |
| before      | Mixed    | State before mutation (JSON snapshot)|
| after       | Mixed    | State after mutation (JSON snapshot) |
| ipAddress   | String   | Client IP address                    |
| userAgent   | String   | Client user-agent string             |

**Indexes:** `user`, `action`, `module`, `entity`, `entityId`, `(module, action)`, `(user, createdAt)` descending, `createdAt` descending

## Relationships

```
Pharmacy ──1:N──► Branch
Pharmacy ──1:N──► User (via branch assignment)

Category ──1:N──► Medicine
Supplier ──1:N──► Medicine
Medicine ──1:N──► MedicineBatch

MedicineBatch ──used in──► Sale.items
Medicine ──used in──► Sale.items

Sale ──1:N──► SaleReturn
Sale ──N:1──► Customer
Sale ──N:1──► User (cashier)

User ──1:N──► DailySession
User ──1:N──► DailyReport
User ──1:N──► Expense (recordedBy / approvedBy)
User ──1:N──► AuditLog

DailySession ──1:1──► DailyReport
```

## Seed Data Summary

Running `npm run seed` creates:

- 6 users (one per role)
- 7 medicine categories
- 3 suppliers
- ~66 medicines with variants (generic, extra strength)
- ~100+ batches with randomized expiry dates
- 24 customers
- ~80 sales spanning 20 days
- 12 expenses
- 3 sample notifications
- 2 audit log entries
