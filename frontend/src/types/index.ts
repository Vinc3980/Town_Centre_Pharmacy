export interface ApiSuccess<T> {
  success: true;
  message: string;
  data?: T;
}

export interface HealthData {
  database: string;
  uptime: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  branch?: string;
  staffId?: string;
  profilePicture?: string;
  isActive?: boolean;
  permissions?: string[];
  lastLoginAt?: string;
  createdAt?: string;
  salary?: number;
  salaryStartDate?: string;
  salaryReminderDays?: number;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  employmentDate?: string;
}

export interface AuthUser {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  profilePicture?: string;
  staffId?: string;
}

export interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  brand?: string;
  category?: { _id: string; name: string } | string;
  manufacturer?: string;
  dosage?: string;
  strength?: string;
  form?: string;
  barcode?: string;
  sku: string;
  prescriptionRequired: boolean;
  isControlledSubstance?: boolean;
  controlledSubstanceClass?: string | null;
  description?: string;
  supplier?: string;
  imageUrl?: string;
  purchasePrice: number;
  sellingPrice: number;
  minStock: number;
  maxStock: number;
  reorderLevel: number;
  status: "active" | "discontinued";
  totalStock: number;
  batchCount?: number;
  nearestExpiry?: string;
}

export interface SalePayment {
  method: "cash" | "mobile_money" | "card" | "bank_transfer" | "credit" | "other" | "insurance";
  amount: number;
  reference?: string;
  date: string;
}

export interface SaleItemInput {
  medicine: string;
  quantity: number;
  discount?: number;
}

export interface CartLine {
  medicineId: string;
  name: string;
  price: number;
  qty: number;
  stock: number;
  discount: number;
  prescriptionRequired?: boolean;
  isControlledSubstance?: boolean;
  genericName?: string;
}

export interface HeldSale {
  _id: string;
  transactionNumber: string;
  items: { medicine: string; name: string; quantity: number; unitPrice: number; discount: number; subtotal: number }[];
  customer?: { _id: string; name: string; phone: string } | string;
  cashier: { _id: string; name: string } | string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: "held";
  notes?: string;
  createdAt: string;
  requiresPrescription?: boolean;
  hasControlledItems?: boolean;
}

export interface SaleReceipt {
  name: string;
  address: string;
  phone: string;
  logoUrl?: string | null;
  receipt: string;
  date: string;
  cashier: string;
  customer: string | null;
  items: { name: string; quantity: number; unitPrice: number; discount: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: SalePayment[];
  paymentMethod: string;
  amountReceived?: number;
  change?: number;
  status: string;
}

export interface AuditEntry {
  _id: string;
  description: string;
  createdAt: string;
  action?: string;
  user?: { _id: string; name: string; email: string; role: string } | string;
  userName?: string;
  module?: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  branch?: string;
  [key: string]: unknown;
}

export interface AuditLogResponse {
  data: AuditEntry[];
  pagination: { page: number; limit: number; total: number };
}

export interface StaffPerformance {
  user: string;
  userInfo?: { name: string; email: string; role: string };
  salesCount: number;
  salesValue: number;
  refundCount: number;
  refundValue: number;
  sessionsOpened: number;
  sessionsClosed: number;
  reportsSubmitted: number;
  reportsApproved: number;
}

export interface DashboardSummary {
  totalRevenue: number;
  transactionCount: number;
  grossProfit: number;
  netProfit: number;
  cashTotal: number;
  mobileMoneyTotal: number;
  cardTotal: number;
  bankTransferTotal: number;
  otherTotal: number;
  totalDiscount: number;
  totalTax: number;
  cashReceived: number;
  cashChange: number;
  totalExpenses: number;
  cashExpenses: number;
  inventoryValue: number;
  lowStockCount: number;
  totalMedicines: number;
  expiringSoon: number;
  expired: number;
  activeStaff: number;
  openSessions: number;
  dateRange: { from: string; to: string };
  [key: string]: unknown;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  transactions: number;
  profit: number;
  [key: string]: unknown;
}

export interface PaymentBreakdownItem {
  method: string;
  total: number;
  count: number;
}

export interface TopMedicine {
  _id: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  transactionCount: number;
  category?: string;
}

export interface SalesByStaffItem {
  _id: string;
  name: string;
  email: string;
  role: string;
  totalSales: number;
  totalCost: number;
  profit: number;
  transactionCount: number;
  totalRefunded: number;
}

export interface InventoryAlerts {
  lowStock: { medicineId: string; name: string; currentStock: number; reorderLevel: number; minStock: number }[];
  expiringSoon: { batchNumber: string; medicine: string; quantity: number; expiryDate: string; daysUntilExpiry: number }[];
  expired: { batchNumber: string; medicine: string; quantity: number; expiryDate: string; daysExpired: number }[];
}

export interface SalesByCategory {
  category: string;
  totalRevenue: number;
  totalQuantity: number;
  transactionCount: number;
}

export interface StaffDashboard {
  todaySales: number;
  todayTransactions: number;
  todayCashSales: number;
  pendingRefunds: number;
  currentSession: { id: string; openingCash: number; status: string; date: string } | null;
  todayReport: { id: string; status: string; totalSales: number; variance: number } | null;
}

export interface SaleReturnItem {
  medicine: string;
  batch: string;
  name: string;
  originalQuantity: number;
  returnQuantity: number;
  unitPrice: number;
  subtotal: number;
  condition: "resaleable" | "damaged";
  reason: string;
}

export interface SaleReturn {
  _id: string;
  sale: string | { _id: string; transactionNumber: string; total: number };
  transactionNumber: string;
  items: SaleReturnItem[];
  refundAmount: number;
  status: "pending" | "approved" | "rejected" | "completed";
  requestedBy: string | { _id: string; name: string };
  approvedBy?: string | { _id: string; name: string };
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
}

export interface SaleDetail {
  _id: string;
  transactionNumber: string;
  items: { medicine: string; batch: string; name: string; quantity: number; unitPrice: number; discount: number; subtotal: number }[];
  customer?: { _id: string; name: string; phone: string } | string;
  cashier: { _id: string; name: string } | string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: SalePayment[];
  paymentMethod: string;
  amountReceived?: number;
  change?: number;
  status: string;
  refundReason?: string;
  refundedAmount?: number;
  outstandingAmount?: number;
  createdAt: string;
  prescriptionReference?: string;
  dispensedBy?: { _id: string; name: string } | string;
}

export interface Expense {
  _id: string;
  category: "rent" | "utilities" | "salaries" | "transport" | "supplier_payment" | "maintenance" | "marketing" | "insurance" | "taxes" | "misc";
  description: string;
  amount: number;
  paymentMethod: "cash" | "mobile_money" | "card" | "bank_transfer" | "other";
  recordedBy: { _id: string; name: string } | string;
  approvedBy?: { _id: string; name: string } | string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  receiptUrl?: string;
  date: string;
  createdAt: string;
}

export interface DailySession {
  _id: string;
  user: { _id: string; name: string; email: string; staffId?: string } | string;
  date: string;
  openingCash: number;
  status: "pending_approval" | "open" | "pending_close_approval" | "closed";
  closedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  closeAggregates?: {
    totalSales: number;
    cashSales: number;
    mobileMoneySales: number;
    cardSales: number;
    bankTransferSales: number;
    refunds: number;
    cashRefunds: number;
    discounts: number;
    expenses: number;
    cashExpenses: number;
    expectedCash: number;
    actualCash: number;
    actualMobileMoney: number;
    actualCard: number;
    actualBankTransfer: number;
    variance: number;
  };
  createdAt: string;
}

export interface DailyReport {
  _id: string;
  session: DailySession | string;
  user: { _id: string; name: string; email: string } | string;
  date: string;
  totalSales: number;
  cashSales: number;
  mobileMoneySales: number;
  cardSales: number;
  bankTransferSales: number;
  refunds: number;
  cashRefunds: number;
  discounts: number;
  expenses: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  notes?: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  reviewedBy?: { _id: string; name: string; email: string } | string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface StockAdjustment {
  _id: string;
  referenceNumber: string;
  medicine: { _id: string; name: string; sku: string } | string;
  type: "increase" | "decrease";
  quantity: number;
  reason: string;
  location: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: { _id: string; name: string } | string;
  approvedBy?: { _id: string; name: string } | string;
  reviewNotes?: string;
  notes?: string;
  createdAt: string;
}

export interface StockTransferItem {
  medicine: { _id: string; name: string; sku?: string } | string;
  quantity: number;
}

export interface StockTransfer {
  _id: string;
  referenceNumber: string;
  fromLocation: string;
  toLocation: string;
  products: StockTransferItem[];
  status: "pending" | "in_transit" | "completed" | "cancelled";
  requestedBy: { _id: string; name: string } | string;
  approvedBy?: { _id: string; name: string } | string;
  notes?: string;
  completedAt?: string;
  createdAt: string;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  priority: "info" | "warning" | "critical";
  category: string;
  isRead: boolean;
  targetRoles: string[];
  referenceId?: string;
  createdAt: string;
}

export interface PurchaseOrder {
  _id: string;
  referenceNumber: string;
  supplier: string;
  products: {
    medicine: { _id: string; name: string; sku: string } | string;
    quantity: number;
    unitPrice: number;
  }[];
  totalAmount: number;
  status: "draft" | "sent" | "partially_received" | "received" | "cancelled";
  orderedBy: { _id: string; name: string } | string;
  expectedDeliveryDate?: string;
  receivedAt?: string;
  receivedBy?: { _id: string; name: string } | string;
  notes?: string;
  createdAt: string;
}
