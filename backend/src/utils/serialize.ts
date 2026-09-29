/**
 * Stage 6: converts Prisma rows to the exact JSON shape the Mongoose API
 * produced, so the frontend needs no changes:
 *   - `_id` (and `id` virtual for User) instead of Prisma's `id`
 *   - FK scalars renamed back to Mongo reference field names
 *     (customerId -> customer, categoryId -> category, ...)
 *   - embedded child docs (sale items, vitals, ...) stripped of their
 *     surrogate keys (id, saleId, seq) exactly like Mongoose `_id: false`
 *   - sensitive User fields removed (they were `select: false` in Mongoose)
 *   - flattened closeAggregates columns re-nested
 *
 * Serialization is applied ONLY at the API boundary (controllers' res.json
 * paths and socket emit payloads) — never before queries or comparisons.
 */

interface Rule {
  noId?: boolean;
  rename?: Record<string, string>;
  drop?: string[];
  keepId?: boolean;
  children?: Record<string, string>; // key -> child model name
}

const SESSION_AGG_KEYS = [
  "totalSales", "cashSales", "mobileMoneySales", "cardSales", "bankTransferSales",
  "refunds", "cashRefunds", "discounts", "expenses", "cashExpenses",
  "expectedCash", "actualCash", "actualMobileMoney", "actualCard",
  "actualBankTransfer", "variance",
] as const;

/**
 * When a renamed FK key holds an object (i.e. the controller populated the
 * relation via Prisma `include`), the sub-object must be serialized with its
 * own model rule so it matches Mongoose's populate output (`_id`, User `id`
 * virtual, sensitive-field stripping).
 */
const REF_MODELS: Record<string, string> = {
  user: "user",
  customer: "customer",
  cashier: "user",
  dispensedBy: "user",
  medicine: "medicine",
  batch: "medicineBatch",
  category: "category",
  supplier: "supplier",
  session: "dailySession",
  sale: "sale",
  pharmacy: "pharmacy",
  reviewedBy: "user",
  recordedBy: "user",
  performedBy: "user",
  requestedBy: "user",
  approvedBy: "user",
  orderedBy: "user",
  receivedBy: "user",
  manager: "user",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function serializeRefValue(model: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => serialize(model, v));
  if (isPlainObject(value)) return serialize(model, value);
  return value;
}

const RULES: Record<string, Rule> = {
  user: {
    keepId: true,
    drop: ["passwordHash", "resetPasswordToken", "resetPasswordExpires"],
  },
  pharmacy: {
    rename: { branchNames: "branches" },
    children: { settings: "pharmacySettings" },
  },
  pharmacySettings: { noId: true, drop: ["pharmacyId"] },
  branch: {},
  category: {},
  supplier: {},
  medicine: { rename: { categoryId: "category", supplierId: "supplier" } },
  medicineBatch: { rename: { medicineId: "medicine", supplierId: "supplier" } },
  inventoryMovement: { rename: { medicineId: "medicine", batchId: "batch", performedById: "performedBy" } },
  notification: { rename: { userId: "user" } },
  dailySession: {
    rename: { userId: "user", approvedById: "approvedBy", closedById: "closedBy" },
  },
  dailyReport: { rename: { sessionId: "session", userId: "user", reviewedById: "reviewedBy" } },
  expense: { rename: { recordedById: "recordedBy", approvedById: "approvedBy" } },
  auditLog: { rename: { userId: "user", pharmacyId: "pharmacy" } },
  sale: {
    rename: { customerId: "customer", cashierId: "cashier", changeAmount: "change", dispensedById: "dispensedBy" },
    children: { items: "saleItem", payments: "salePayment" },
  },
  saleItem: { noId: true, drop: ["saleId", "seq"], rename: { medicineId: "medicine", batchId: "batch" } },
  salePayment: { noId: true, drop: ["saleId", "seq"] },
  customer: { children: { vitals: "customerVital", visits: "customerVisit" } },
  customerVital: { noId: true, drop: ["customerId", "seq"], rename: { recordedById: "recordedBy" } },
  customerVisit: { noId: true, drop: ["customerId", "seq"], rename: { recordedById: "recordedBy" } },
  stockTransfer: {
    rename: { requestedById: "requestedBy", approvedById: "approvedBy" },
    children: { products: "stockTransferItem" },
  },
  stockTransferItem: { noId: true, drop: ["stockTransferId", "seq"], rename: { medicineId: "medicine" } },
  stockAdjustment: { rename: { medicineId: "medicine", requestedById: "requestedBy", approvedById: "approvedBy" } },
  purchaseOrder: {
    rename: { orderedById: "orderedBy", receivedById: "receivedBy" },
    children: { products: "purchaseOrderItem" },
  },
  purchaseOrderItem: { drop: ["purchaseOrderId", "seq"], rename: { medicineId: "medicine" } },
  saleReturn: {
    rename: { saleId: "sale", requestedById: "requestedBy", approvedById: "approvedBy" },
    children: { items: "saleReturnItem" },
  },
  saleReturnItem: { noId: true, drop: ["saleReturnId", "seq"], rename: { medicineId: "medicine", batchId: "batch" } },
  dispensingRecord: {},
  legacyOrphan: { drop: ["collection", "reason"] },
};

function nestCloseAggregates(row: Record<string, unknown>): void {
  const present = row.totalSales !== undefined && row.totalSales !== null;
  const aggregates: Record<string, unknown> = {};
  if (present) {
    for (const key of SESSION_AGG_KEYS) aggregates[key] = row[key] ?? null;
  }
  for (const key of SESSION_AGG_KEYS) delete row[key];
  if (present) row.closeAggregates = aggregates;
  else delete row.closeAggregates;
}

export function serialize(model: string, row: null | undefined): null;
export function serialize<T = Record<string, unknown>>(model: string, row: unknown): T;
export function serialize<T = Record<string, unknown>>(model: string, row: unknown): T | null {
  if (row === null || row === undefined) return null;
  const source = row as Record<string, unknown>;
  const rule = RULES[model] ?? {};
  const out: Record<string, unknown> = { ...source };

  const rawId = source.id;
  delete out.id;
  delete out.legacyId;
  if (rawId !== undefined && !rule.noId) out._id = rawId;
  if (rule.keepId && rawId !== undefined) out.id = rawId;

  if (rule.rename) {
    for (const [from, to] of Object.entries(rule.rename)) {
      if (from in out) {
        // A populated relation (object at the target key) must not be
        // clobbered by the raw FK scalar — populate replaces the id.
        if (isPlainObject(out[to]) && !isPlainObject(out[from])) {
          delete out[from];
        } else {
          out[to] = out[from];
          delete out[from];
        }
      }
    }
  }
  // populated relations: serialize the included sub-document
  for (const [key, refModel] of Object.entries(REF_MODELS)) {
    if (key in out) out[key] = serializeRefValue(refModel, out[key]);
  }
  if (rule.drop) {
    for (const key of rule.drop) delete out[key];
  }
  if (model === "dailySession") nestCloseAggregates(out);
  if (rule.children) {
    for (const [key, childModel] of Object.entries(rule.children)) {
      const value = out[key];
      if (Array.isArray(value)) out[key] = value.map((child) => serialize(childModel, child));
      else if (value !== null && value !== undefined) out[key] = serialize(childModel, value);
    }
  }
  return out as T;
}

export function serializeMany<T = Record<string, unknown>>(model: string, rows: unknown[]): T[] {
  return (rows ?? []).map((row) => serialize<T>(model, row));
}
