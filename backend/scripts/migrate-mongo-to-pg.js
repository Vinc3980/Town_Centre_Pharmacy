/**
 * Stage 5: MongoDB -> PostgreSQL data migration.
 * Source: verified mongodump backup (json exports), NOT the live database.
 * Order: dependencies first; every Mongo _id is preserved as legacyId.
 * Failures are logged to scripts/migration-errors.log; counts + spot checks
 * are verified against the same JSON source files.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient();
const BACKUP_JSON = "C:/Users/koran/mongodb_backups/adom-pharmacy-20260928-160211/json";
const ERROR_LOG = path.join(__dirname, "migration-errors.log");
const errors = [];
const notes = [];
const QUARANTINED = {}; // source collection -> rows sent to legacy_orphans
const KEPT = {}; // source collection -> docs kept in their real table

function logNote(scope, message) {
  const line = `[${new Date().toISOString()}] [NOTE ${scope}] ${message}`;
  notes.push(line);
  fs.appendFileSync(ERROR_LOG, line + "\n");
}

function logError(scope, id, message) {
  const line = `[${new Date().toISOString()}] [${scope}] ${id ?? "-"}: ${message}`;
  errors.push(line);
  fs.appendFileSync(ERROR_LOG, line + "\n");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(BACKUP_JSON, file), "utf8"));
}

function oidOf(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v.$oid) return v.$oid;
  return null;
}

function dateOf(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.$date != null) {
      const d = v.$date;
      if (typeof d === "string") return new Date(d);
      if (d && typeof d === "object") {
        if (d.$numberLong != null) return new Date(Number(d.$numberLong));
        if (d.$numberDouble != null) return new Date(Number(d.$numberDouble));
      }
      return null;
    }
    return null;
  }
  const parsed = new Date(v);
  return isNaN(parsed) ? null : parsed;
}

function deepConvert(v) {
  if (Array.isArray(v)) return v.map(deepConvert);
  if (v && typeof v === "object") {
    if (v.$oid) return v.$oid;
    if (v.$date) {
      const d = dateOf(v);
      return d ? d.toISOString() : null;
    }
    if (v.$numberLong != null) return Number(v.$numberLong);
    if (v.$numberInt != null) return Number(v.$numberInt);
    if (v.$numberDouble != null) return Number(v.$numberDouble);
    if (v.$numberDecimal != null) return Number(v.$numberDecimal);
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepConvert(v[k]);
    return out;
  }
  return v;
}

function strArr(v, fallback = []) {
  return Array.isArray(v) ? v.filter((s) => typeof s === "string") : fallback;
}

// legacy-id -> new-uuid maps, per source collection
const M = {};
function mapKey(name) {
  if (!M[name]) M[name] = new Map();
  return M[name];
}
function ref(name, v, { required = true, scope = "", docId = "" } = {}) {
  const o = oidOf(v);
  if (!o) {
    if (required) {
      logError(scope || name, docId, `missing required ref in ${name}`);
      throw new Error(`missing ref ${name}`);
    }
    return null;
  }
  const mapped = mapKey(name).get(o);
  if (!mapped) {
    if (required) {
      logError(scope || name, docId, `dangling ref ${name}=${o}`);
      throw new Error(`dangling ref ${name}`);
    }
    return null;
  }
  return mapped;
}

async function insertMany(model, rows, scope) {
  if (!rows.length) return;
  try {
    await prisma[model].createMany({ data: rows });
  } catch (e) {
    // fall back to row-by-row so a single bad row does not sink the batch
    for (const row of rows) {
      try {
        await prisma[model].create({ data: row });
      } catch (err) {
        logError(scope, row.legacyId, `${model} insert failed: ${err.message.split("\n")[0]}`);
      }
    }
  }
}

async function freshGuard() {
  const existing =
    (await prisma.user.count()) +
    (await prisma.medicine.count()) +
    (await prisma.sale.count()) +
    (await prisma.pharmacy.count());
  if (existing > 0) {
    throw new Error("Target database is not empty — refusing to migrate into existing data.");
  }
}

async function migrate() {
  const newId = () => randomUUID();

  // ---- 1. pharmacies -----------------------------------------------------
  const pharmacies = readJson("pharmacies.json");
  for (const p of pharmacies) {
    const id = newId();
    mapKey("pharmacies").set(oidOf(p._id), id);
    await insertMany("pharmacy", [
      {
        id,
        legacyId: oidOf(p._id),
        name: p.name,
        registrationNumber: p.registrationNumber,
        phone: p.phone,
        email: p.email,
        address: p.address,
        city: p.city,
        region: p.region,
        country: p.country,
        logoUrl: p.logoUrl ?? null,
        currency: p.currency,
        timezone: p.timezone,
        status: p.status ?? "active",
        branchNames: strArr(p.branches),
        paymentMethods: strArr(p.paymentMethods),
        createdAt: dateOf(p.createdAt) ?? new Date(),
        updatedAt: dateOf(p.updatedAt) ?? new Date(),
      },
    ], "pharmacies");
    const s = p.settings || {};
    await insertMany("pharmacySettings", [
      {
        id: newId(),
        pharmacyId: id,
        lowStockThreshold: s.lowStockThreshold ?? 10,
        expiryWarningDays: s.expiryWarningDays ?? 30,
        receiptFooter: s.receiptFooter ?? "Thank you for choosing Adom Pharmacy",
        allowNegativeStock: s.allowNegativeStock ?? false,
        requireManagerApprovalForRefund: s.requireManagerApprovalForRefund ?? true,
        requireManagerApprovalForStockAdjustment: s.requireManagerApprovalForStockAdjustment ?? true,
        taxRate: s.taxRate ?? 0,
        taxEnabled: s.taxEnabled ?? false,
        discountAuthorizationRequired: s.discountAuthorizationRequired ?? true,
        minPasswordLength: s.minPasswordLength ?? 6,
        sessionExpirationMinutes: s.sessionExpirationMinutes ?? 60,
        maxLoginAttempts: s.maxLoginAttempts ?? 5,
        lockoutDurationMinutes: s.lockoutDurationMinutes ?? 15,
      },
    ], "pharmacy_settings");
  }

  // ---- 2. users (no inbound deps) ---------------------------------------
  const SINGLE_PHARMACY_ID = [...mapKey("pharmacies").values()][0];
  const quarantined = [];
  const quarantine = (collection, doc, reason) => {
    quarantined.push({ collection, legacyId: oidOf(doc._id), reason, doc: deepConvert(doc) });
    QUARANTINED[collection] = (QUARANTINED[collection] || 0) + 1;
  };
  const users = readJson("users.json");
  for (const u of users) {
    mapKey("users").set(oidOf(u._id), newId());
  }
  await insertMany("user", users.map((u) => ({
    id: mapKey("users").get(oidOf(u._id)),
    legacyId: oidOf(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    staffId: u.staffId,
    profilePicture: u.profilePicture ?? null,
    passwordHash: u.passwordHash,
    role: u.role,
    permissions: strArr(u.permissions),
    branch: u.branch ?? "Main Branch",
    isActive: u.isActive ?? true,
    lastLoginAt: dateOf(u.lastLoginAt),
    loginAttempts: u.loginAttempts ?? 0,
    lockedUntil: dateOf(u.lockedUntil),
    refreshTokenVersion: u.refreshTokenVersion ?? 0,
    resetPasswordToken: u.resetPasswordToken ?? null,
    resetPasswordExpires: dateOf(u.resetPasswordExpires),
    salary: u.salary ?? null,
    salaryStartDate: dateOf(u.salaryStartDate),
    salaryReminderDays: u.salaryReminderDays ?? null,
    lastSalaryReminderAt: dateOf(u.lastSalaryReminderAt),
    dateOfBirth: dateOf(u.dateOfBirth),
    gender: u.gender ?? null,
    address: u.address ?? null,
    emergencyContactName: u.emergencyContactName ?? null,
    emergencyContactPhone: u.emergencyContactPhone ?? null,
    emergencyContactRelation: u.emergencyContactRelation ?? null,
    nationalId: u.nationalId ?? null,
    employmentDate: dateOf(u.employmentDate),
    createdAt: dateOf(u.createdAt) ?? new Date(),
    updatedAt: dateOf(u.updatedAt) ?? new Date(),
  })), "users");

  // ---- 3. categories, suppliers -----------------------------------------
  const categories = readJson("categories.json");
  for (const c of categories) mapKey("categories").set(oidOf(c._id), newId());
  await insertMany("category", categories.map((c) => ({
    id: mapKey("categories").get(oidOf(c._id)),
    legacyId: oidOf(c._id),
    name: c.name,
    description: c.description ?? null,
    createdAt: dateOf(c.createdAt) ?? new Date(),
    updatedAt: dateOf(c.updatedAt) ?? new Date(),
  })), "categories");

  const suppliers = readJson("suppliers.json");
  for (const s of suppliers) mapKey("suppliers").set(oidOf(s._id), newId());
  await insertMany("supplier", suppliers.map((s) => ({
    id: mapKey("suppliers").get(oidOf(s._id)),
    legacyId: oidOf(s._id),
    name: s.name,
    contactPerson: s.contactPerson ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address ?? null,
    outstandingBalance: s.outstandingBalance ?? 0,
    createdAt: dateOf(s.createdAt) ?? new Date(),
    updatedAt: dateOf(s.updatedAt) ?? new Date(),
  })), "suppliers");

  // ---- 4. branches -------------------------------------------------------
  // Both branches predate the pharmacy reseed: their pharmacyId is dangling.
  // There is exactly one pharmacy, so the ref is unambiguous -> remap to it.
  const branches = readJson("branches.json");
  await insertMany("branch", branches.map((b) => {
    const docId = oidOf(b._id);
    const rawPharmacy = oidOf(b.pharmacyId);
    let pharmacyId = mapKey("pharmacies").get(rawPharmacy);
    if (!pharmacyId) {
      pharmacyId = SINGLE_PHARMACY_ID;
      logNote("branches", `${docId}: pharmacyId ${rawPharmacy} is pre-reseed -> remapped to current pharmacy`);
    }
    let managerId = null;
    if (b.managerId) {
      managerId = mapKey("users").get(oidOf(b.managerId)) || null;
      if (!managerId) logNote("branches", `${docId}: managerId ${oidOf(b.managerId)} dangling -> NULL`);
    }
    return {
      id: (() => { const i = newId(); mapKey("branches").set(docId, i); return i; })(),
      legacyId: docId,
      pharmacyId,
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      managerId,
      status: b.status ?? "active",
      createdAt: dateOf(b.createdAt) ?? new Date(),
      updatedAt: dateOf(b.updatedAt) ?? new Date(),
    };
  }), "branches");

  // ---- 5. medicines, medicine_batches ------------------------------------
  const medicines = readJson("medicines.json");
  for (const m of medicines) mapKey("medicines").set(oidOf(m._id), newId());
  await insertMany("medicine", medicines.map((m) => {
    const docId = oidOf(m._id);
    return {
      id: mapKey("medicines").get(docId),
      legacyId: docId,
      name: m.name,
      genericName: m.genericName ?? null,
      brand: m.brand ?? null,
      categoryId: ref("categories", m.category, { scope: "medicines", docId }),
      manufacturer: m.manufacturer ?? null,
      dosage: m.dosage ?? null,
      strength: m.strength ?? null,
      form: m.form ?? null,
      barcode: m.barcode ?? null,
      sku: m.sku,
      prescriptionRequired: m.prescriptionRequired ?? false,
      description: m.description ?? null,
      supplierId: m.supplier ? ref("suppliers", m.supplier, { required: false, scope: "medicines", docId }) : null,
      imageUrl: m.imageUrl ?? null,
      purchasePrice: m.purchasePrice,
      sellingPrice: m.sellingPrice,
      minStock: m.minStock ?? 10,
      maxStock: m.maxStock ?? 500,
      reorderLevel: m.reorderLevel ?? 20,
      status: m.status ?? "active",
      createdAt: dateOf(m.createdAt) ?? new Date(),
      updatedAt: dateOf(m.updatedAt) ?? new Date(),
    };
  }), "medicines");

  const batches = readJson("medicinebatches.json");
  for (const b of batches) mapKey("medicinebatches").set(oidOf(b._id), newId());
  await insertMany("medicineBatch", batches.map((b) => {
    const docId = oidOf(b._id);
    return {
      id: mapKey("medicinebatches").get(docId),
      legacyId: docId,
      medicineId: ref("medicines", b.medicine, { scope: "medicinebatches", docId }),
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      purchasePrice: b.purchasePrice,
      sellingPrice: b.sellingPrice,
      manufacturingDate: dateOf(b.manufacturingDate),
      expiryDate: dateOf(b.expiryDate),
      supplierId: b.supplier ? ref("suppliers", b.supplier, { required: false, scope: "medicinebatches", docId }) : null,
      dateReceived: dateOf(b.dateReceived) ?? new Date(),
      createdAt: dateOf(b.createdAt) ?? new Date(),
      updatedAt: dateOf(b.updatedAt) ?? new Date(),
    };
  }), "medicine_batches");

  // ---- 6. customers + embedded vitals/visits -----------------------------
  const customers = readJson("customers.json");
  const vitalRows = [];
  const visitRows = [];
  for (const c of customers) mapKey("customers").set(oidOf(c._id), newId());
  for (const c of customers) {
    const id = mapKey("customers").get(oidOf(c._id));
    (c.vitals || []).forEach((v, seq) => vitalRows.push({
      id: newId(),
      customerId: id,
      seq,
      date: dateOf(v.date) ?? new Date(),
      bloodPressure: v.bloodPressure ?? null,
      heartRate: v.heartRate ?? null,
      temperature: v.temperature ?? null,
      weight: v.weight ?? null,
      height: v.height ?? null,
      notes: v.notes ?? null,
      recordedById: v.recordedBy ? ref("users", v.recordedBy, { required: false, scope: "customer_vitals", docId: oidOf(c._id) }) : null,
    }));
    (c.visits || []).forEach((v, seq) => visitRows.push({
      id: newId(),
      customerId: id,
      seq,
      date: dateOf(v.date) ?? new Date(),
      reason: v.reason,
      tests: v.tests ?? null,
      results: v.results ?? null,
      notes: v.notes ?? null,
      recordedById: v.recordedBy ? ref("users", v.recordedBy, { required: false, scope: "customer_visits", docId: oidOf(c._id) }) : null,
    }));
  }
  await insertMany("customer", customers.map((c) => {
    const docId = oidOf(c._id);
    return {
      id: mapKey("customers").get(docId),
      legacyId: docId,
      name: c.name,
      phone: c.phone,
      email: c.email ?? null,
      dateOfBirth: dateOf(c.dateOfBirth),
      gender: c.gender ?? null,
      bloodGroup: c.bloodGroup ?? null,
      address: c.address ?? null,
      emergencyContact: c.emergencyContact ?? null,
      emergencyPhone: c.emergencyPhone ?? null,
      allergies: strArr(c.allergies),
      medicalConditions: strArr(c.medicalConditions),
      notes: c.notes ?? null,
      profileImage: c.profileImage ?? "",
      outstandingBalance: c.outstandingBalance ?? 0,
      createdAt: dateOf(c.createdAt) ?? new Date(),
      updatedAt: dateOf(c.updatedAt) ?? new Date(),
    };
  }), "customers");
  await insertMany("customerVital", vitalRows, "customer_vitals");
  await insertMany("customerVisit", visitRows, "customer_visits");

  // ---- 7. sales + items + payments ---------------------------------------
  const sales = readJson("sales.json");
  const itemRows = [];
  const payRows = [];
  for (const s of sales) mapKey("sales").set(oidOf(s._id), newId());
  for (const s of sales) {
    const saleId = mapKey("sales").get(oidOf(s._id));
    const docId = oidOf(s._id);
    (s.items || []).forEach((it, seq) => itemRows.push({
      id: newId(),
      saleId,
      seq,
      medicineId: ref("medicines", it.medicine, { scope: "sale_items", docId }),
      batchId: ref("medicinebatches", it.batch, { scope: "sale_items", docId }),
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount ?? 0,
      subtotal: it.subtotal,
    }));
    (s.payments || []).forEach((p, seq) => payRows.push({
      id: newId(),
      saleId,
      seq,
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
      date: dateOf(p.date) ?? new Date(),
    }));
  }
  await insertMany("sale", sales.map((s) => {
    const docId = oidOf(s._id);
    return {
      id: mapKey("sales").get(docId),
      legacyId: docId,
      transactionNumber: s.transactionNumber,
      customerId: s.customer ? ref("customers", s.customer, { required: false, scope: "sales", docId }) : null,
      cashierId: ref("users", s.cashier, { scope: "sales", docId }),
      branch: s.branch ?? "Main Branch",
      subtotal: s.subtotal,
      discount: s.discount ?? 0,
      tax: s.tax ?? 0,
      total: s.total,
      costOfGoods: s.costOfGoods,
      paymentMethod: s.paymentMethod ?? "cash",
      amountReceived: s.amountReceived ?? null,
      changeAmount: s.change ?? null,
      status: s.status ?? "completed",
      refundReason: s.refundReason ?? null,
      refundedAmount: s.refundedAmount ?? 0,
      outstandingAmount: s.outstandingAmount ?? 0,
      dueDate: dateOf(s.dueDate),
      createdAt: dateOf(s.createdAt) ?? new Date(),
      updatedAt: dateOf(s.updatedAt) ?? new Date(),
    };
  }), "sales");
  await insertMany("saleItem", itemRows, "sale_items");
  await insertMany("salePayment", payRows, "sale_payments");

  // ---- 8. inventory_movements --------------------------------------------
  // Required refs (medicine, performer) are pre-reseed on all rows: quarantine
  // any row that cannot be fully linked; keep rows that resolve.
  const movements = readJson("inventorymovements.json");
  const keptMovements = [];
  for (const m of movements) {
    const docId = oidOf(m._id);
    const medicineId = mapKey("medicines").get(oidOf(m.medicine));
    const performedById = mapKey("users").get(oidOf(m.performedBy));
    if (!medicineId || !performedById) {
      const missing = [!medicineId && `medicine=${oidOf(m.medicine)}`, !performedById && `performedBy=${oidOf(m.performedBy)}`].filter(Boolean).join(" ");
      quarantine("inventorymovements", m, `dangling required refs: ${missing}`);
      continue;
    }
    keptMovements.push(m);
    mapKey("inventorymovements").set(docId, newId());
  }
  KEPT.inventorymovements = keptMovements;
  await insertMany("inventoryMovement", keptMovements.map((m) => {
    const docId = oidOf(m._id);
    const medicineId = mapKey("medicines").get(oidOf(m.medicine));
    const performedById = mapKey("users").get(oidOf(m.performedBy));
    let batchId = null;
    if (m.batch) {
      batchId = mapKey("medicinebatches").get(oidOf(m.batch)) || null;
      if (!batchId) logNote("inventory_movements", `${docId}: batch ${oidOf(m.batch)} dangling -> NULL`);
    }
    return {
      id: mapKey("inventorymovements").get(docId),
      legacyId: docId,
      medicineId,
      batchId,
      type: m.type,
      quantityChange: m.quantityChange,
      reason: m.reason ?? null,
      performedById,
      createdAt: dateOf(m.createdAt) ?? new Date(),
    };
  }), "inventory_movements");

  // ---- 9. notifications ---------------------------------------------------
  const notifications = readJson("notifications.json");
  await insertMany("notification", notifications.map((n) => {
    const docId = oidOf(n._id);
    return {
      id: (() => { const i = newId(); mapKey("notifications").set(docId, i); return i; })(),
      legacyId: docId,
      title: n.title,
      message: n.message,
      priority: n.priority ?? "info",
      category: n.category,
      userId: n.user ? ref("users", n.user, { required: false, scope: "notifications", docId }) : null,
      isRead: n.isRead ?? false,
      targetRoles: strArr(n.targetRoles, ["admin"]),
      referenceId: n.referenceId ?? null,
      createdAt: dateOf(n.createdAt) ?? new Date(),
    };
  }), "notifications");

  // ---- 10. daily_sessions (closeAggregates -> columns) --------------------
  const sessions = readJson("dailysessions.json");
  const keptSessions = [];
  for (const s of sessions) {
    const userId = mapKey("users").get(oidOf(s.user));
    if (!userId) {
      quarantine("dailysessions", s, `dangling required ref: user=${oidOf(s.user)}`);
      continue;
    }
    keptSessions.push(s);
    mapKey("dailysessions").set(oidOf(s._id), newId());
  }
  KEPT.dailysessions = keptSessions;
  const optionalUser = (raw, scope, docId, field) => {
    if (!raw) return null;
    const id = mapKey("users").get(oidOf(raw)) || null;
    if (!id) logNote(scope, `${docId}: ${field} ${oidOf(raw)} dangling -> NULL`);
    return id;
  };
  await insertMany("dailySession", keptSessions.map((s) => {
    const docId = oidOf(s._id);
    const a = s.closeAggregates || {};
    return {
      id: mapKey("dailysessions").get(docId),
      legacyId: docId,
      userId: mapKey("users").get(oidOf(s.user)),
      date: dateOf(s.date) ?? new Date(),
      openingCash: s.openingCash,
      status: s.status ?? "pending_approval",
      closedAt: dateOf(s.closedAt),
      totalSales: a.totalSales ?? null,
      cashSales: a.cashSales ?? null,
      mobileMoneySales: a.mobileMoneySales ?? null,
      cardSales: a.cardSales ?? null,
      bankTransferSales: a.bankTransferSales ?? null,
      refunds: a.refunds ?? null,
      cashRefunds: a.cashRefunds ?? null,
      discounts: a.discounts ?? null,
      expenses: a.expenses ?? null,
      cashExpenses: a.cashExpenses ?? null,
      expectedCash: a.expectedCash ?? null,
      actualCash: a.actualCash ?? null,
      actualMobileMoney: a.actualMobileMoney ?? null,
      actualCard: a.actualCard ?? null,
      actualBankTransfer: a.actualBankTransfer ?? null,
      variance: a.variance ?? null,
      approvedById: optionalUser(s.approvedBy, "daily_sessions", docId, "approvedBy"),
      approvedAt: dateOf(s.approvedAt),
      closedById: optionalUser(s.closedBy, "daily_sessions", docId, "closedBy"),
      createdAt: dateOf(s.createdAt) ?? new Date(),
      updatedAt: dateOf(s.updatedAt) ?? new Date(),
    };
  }), "daily_sessions");

  // ---- 11. daily_reports --------------------------------------------------
  const reports = readJson("dailyreports.json");
  await insertMany("dailyReport", reports.map((r) => {
    const docId = oidOf(r._id);
    return {
      id: (() => { const i = newId(); mapKey("dailyreports").set(docId, i); return i; })(),
      legacyId: docId,
      sessionId: ref("dailysessions", r.session, { scope: "daily_reports", docId }),
      userId: ref("users", r.user, { scope: "daily_reports", docId }),
      date: dateOf(r.date),
      totalSales: r.totalSales,
      cashSales: r.cashSales,
      mobileMoneySales: r.mobileMoneySales,
      cardSales: r.cardSales,
      bankTransferSales: r.bankTransferSales,
      refunds: r.refunds,
      cashRefunds: r.cashRefunds,
      discounts: r.discounts,
      expenses: r.expenses,
      cashExpenses: r.cashExpenses,
      expectedCash: r.expectedCash,
      actualCash: r.actualCash ?? 0,
      variance: r.variance ?? 0,
      notes: r.notes ?? null,
      status: r.status ?? "draft",
      reviewedById: r.reviewedBy ? ref("users", r.reviewedBy, { required: false, scope: "daily_reports", docId }) : null,
      reviewNotes: r.reviewNotes ?? null,
      reviewedAt: dateOf(r.reviewedAt),
      createdAt: dateOf(r.createdAt) ?? new Date(),
      updatedAt: dateOf(r.updatedAt) ?? new Date(),
    };
  }), "daily_reports");

  // ---- 12. expenses --------------------------------------------------------
  const expenses = readJson("expenses.json");
  await insertMany("expense", expenses.map((e) => {
    const docId = oidOf(e._id);
    return {
      id: (() => { const i = newId(); mapKey("expenses").set(docId, i); return i; })(),
      legacyId: docId,
      category: e.category,
      description: e.description,
      amount: e.amount,
      paymentMethod: e.paymentMethod ?? "cash",
      recordedById: ref("users", e.recordedBy, { scope: "expenses", docId }),
      approvedById: e.approvedBy ? ref("users", e.approvedBy, { required: false, scope: "expenses", docId }) : null,
      status: e.status ?? "pending",
      rejectionReason: e.rejectionReason ?? null,
      receiptUrl: e.receiptUrl ?? null,
      date: dateOf(e.date) ?? new Date(),
      createdAt: dateOf(e.createdAt) ?? new Date(),
      updatedAt: dateOf(e.updatedAt) ?? new Date(),
    };
  }), "expenses");

  // ---- 13. audit_logs (before/after -> jsonb) -----------------------------
  const auditlogs = readJson("auditlogs.json");
  await insertMany("auditLog", auditlogs.map((a) => {
    const docId = oidOf(a._id);
    return {
      id: (() => { const i = newId(); mapKey("auditlogs").set(docId, i); return i; })(),
      legacyId: docId,
      userId: ref("users", a.user, { scope: "audit_logs", docId }),
      userName: a.userName,
      pharmacyId: a.pharmacy ? ref("pharmacies", a.pharmacy, { required: false, scope: "audit_logs", docId }) : null,
      branch: a.branch ?? null,
      action: a.action,
      module: a.module,
      entity: a.entity ?? null,
      entityId: a.entityId ?? null,
      description: a.description,
      before: a.before !== undefined ? deepConvert(a.before) : undefined,
      after: a.after !== undefined ? deepConvert(a.after) : undefined,
      ipAddress: a.ipAddress ?? null,
      userAgent: a.userAgent ?? null,
      createdAt: dateOf(a.createdAt) ?? new Date(),
    };
  }), "audit_logs");

  // ---- 14. stock_transfers + items ----------------------------------------
  const transfers = readJson("stocktransfers.json");
  const transferItemRows = [];
  const keptTransfers = [];
  for (const t of transfers) {
    const requesterOk = !!mapKey("users").get(oidOf(t.requestedBy));
    const medicinesOk = (t.products || []).every((p) => mapKey("medicines").get(oidOf(p.medicine)));
    if (!requesterOk || !medicinesOk) {
      const missing = [!requesterOk && `requestedBy=${oidOf(t.requestedBy)}`, !medicinesOk && "products[].medicine"].filter(Boolean).join(" ");
      quarantine("stocktransfers", t, `dangling required refs: ${missing}`);
      continue;
    }
    keptTransfers.push(t);
    mapKey("stocktransfers").set(oidOf(t._id), newId());
  }
  KEPT.stocktransfers = keptTransfers;
  for (const t of keptTransfers) {
    const id = mapKey("stocktransfers").get(oidOf(t._id));
    (t.products || []).forEach((p, seq) => transferItemRows.push({
      id: newId(),
      stockTransferId: id,
      seq,
      medicineId: mapKey("medicines").get(oidOf(p.medicine)),
      quantity: p.quantity,
    }));
  }
  await insertMany("stockTransfer", keptTransfers.map((t) => {
    const docId = oidOf(t._id);
    return {
      id: mapKey("stocktransfers").get(docId),
      legacyId: docId,
      referenceNumber: t.referenceNumber,
      fromLocation: t.fromLocation,
      toLocation: t.toLocation,
      status: t.status ?? "pending",
      requestedById: mapKey("users").get(oidOf(t.requestedBy)),
      approvedById: optionalUser(t.approvedBy, "stock_transfers", docId, "approvedBy"),
      notes: t.notes ?? null,
      completedAt: dateOf(t.completedAt),
      createdAt: dateOf(t.createdAt) ?? new Date(),
      updatedAt: dateOf(t.updatedAt) ?? new Date(),
    };
  }), "stock_transfers");
  await insertMany("stockTransferItem", transferItemRows, "stock_transfer_items");

  // ---- 15. stock_adjustments ----------------------------------------------
  const adjustments = readJson("stockadjustments.json");
  await insertMany("stockAdjustment", adjustments.map((a) => {
    const docId = oidOf(a._id);
    return {
      id: (() => { const i = newId(); mapKey("stockadjustments").set(docId, i); return i; })(),
      legacyId: docId,
      referenceNumber: a.referenceNumber,
      medicineId: ref("medicines", a.medicine, { scope: "stock_adjustments", docId }),
      type: a.type,
      quantity: a.quantity,
      reason: a.reason,
      location: a.location,
      status: a.status ?? "pending",
      requestedById: ref("users", a.requestedBy, { scope: "stock_adjustments", docId }),
      approvedById: a.approvedBy ? ref("users", a.approvedBy, { required: false, scope: "stock_adjustments", docId }) : null,
      reviewNotes: a.reviewNotes ?? null,
      notes: a.notes ?? null,
      createdAt: dateOf(a.createdAt) ?? new Date(),
      updatedAt: dateOf(a.updatedAt) ?? new Date(),
    };
  }), "stock_adjustments");

  // ---- 16. purchase_orders + items -----------------------------------------
  const pos = readJson("purchaseorders.json");
  const poItemRows = [];
  for (const po of pos) mapKey("purchaseorders").set(oidOf(po._id), newId());
  for (const po of pos) {
    const id = mapKey("purchaseorders").get(oidOf(po._id));
    (po.products || []).forEach((p, seq) => poItemRows.push({
      id: newId(),
      purchaseOrderId: id,
      seq,
      medicineId: ref("medicines", p.medicine, { scope: "purchase_order_items", docId: oidOf(po._id) }),
      quantity: p.quantity,
      unitPrice: p.unitPrice,
    }));
  }
  await insertMany("purchaseOrder", pos.map((po) => {
    const docId = oidOf(po._id);
    return {
      id: mapKey("purchaseorders").get(docId),
      legacyId: docId,
      referenceNumber: po.referenceNumber,
      supplier: po.supplier,
      totalAmount: po.totalAmount,
      status: po.status ?? "draft",
      orderedById: ref("users", po.orderedBy, { scope: "purchase_orders", docId }),
      expectedDeliveryDate: dateOf(po.expectedDeliveryDate),
      receivedAt: dateOf(po.receivedAt),
      receivedById: po.receivedBy ? ref("users", po.receivedBy, { required: false, scope: "purchase_orders", docId }) : null,
      notes: po.notes ?? null,
      createdAt: dateOf(po.createdAt) ?? new Date(),
      updatedAt: dateOf(po.updatedAt) ?? new Date(),
    };
  }), "purchase_orders");
  await insertMany("purchaseOrderItem", poItemRows, "purchase_order_items");

  // ---- 17. sale_returns + items ---------------------------------------------
  const returns = readJson("salereturns.json");
  const returnItemRows = [];
  for (const r of returns) mapKey("salereturns").set(oidOf(r._id), newId());
  for (const r of returns) {
    const id = mapKey("salereturns").get(oidOf(r._id));
    (r.items || []).forEach((it, seq) => returnItemRows.push({
      id: newId(),
      saleReturnId: id,
      seq,
      medicineId: ref("medicines", it.medicine, { scope: "sale_return_items", docId: oidOf(r._id) }),
      batchId: ref("medicinebatches", it.batch, { scope: "sale_return_items", docId: oidOf(r._id) }),
      name: it.name,
      originalQuantity: it.originalQuantity,
      returnQuantity: it.returnQuantity,
      unitPrice: it.unitPrice,
      subtotal: it.subtotal,
      condition: it.condition ?? "resaleable",
      reason: it.reason,
    }));
  }
  await insertMany("saleReturn", returns.map((r) => {
    const docId = oidOf(r._id);
    return {
      id: mapKey("salereturns").get(docId),
      legacyId: docId,
      saleId: ref("sales", r.sale, { scope: "sale_returns", docId }),
      transactionNumber: r.transactionNumber,
      refundAmount: r.refundAmount,
      status: r.status ?? "pending",
      requestedById: ref("users", r.requestedBy, { scope: "sale_returns", docId }),
      approvedById: r.approvedBy ? ref("users", r.approvedBy, { required: false, scope: "sale_returns", docId }) : null,
      rejectionReason: r.rejectionReason ?? null,
      processedAt: dateOf(r.processedAt),
      createdAt: dateOf(r.createdAt) ?? new Date(),
      updatedAt: dateOf(r.updatedAt) ?? new Date(),
    };
  }), "sale_returns");
  await insertMany("saleReturnItem", returnItemRows, "sale_return_items");

  // ---- 18. dispensing_records (all refs are pre-dataset orphans: text) ------
  const disp = readJson("dispensingrecords.json");
  await insertMany("dispensingRecord", disp.map((d) => {
    const docId = oidOf(d._id);
    return {
      id: (() => { const i = newId(); mapKey("dispensingrecords").set(docId, i); return i; })(),
      legacyId: docId,
      legacyPharmacyId: oidOf(d.pharmacyId),
      legacyPrescriptionId: oidOf(d.prescriptionId),
      legacyMedicineId: oidOf(d.medicineId),
      legacyBatchId: oidOf(d.batchId),
      legacyPharmacistId: oidOf(d.pharmacistId),
      quantity: d.quantity,
      dispensedAt: dateOf(d.dispensedAt) ?? new Date(),
      createdAt: dateOf(d.createdAt) ?? new Date(),
    };
  }), "dispensing_records");

  // ---- 19. quarantine: rows that cannot satisfy FK constraints --------------
  await insertMany("legacyOrphan", quarantined.map((q) => ({
    id: newId(),
    collection: q.collection,
    legacyId: q.legacyId,
    reason: q.reason,
    doc: q.doc,
  })), "legacy_orphans");
}

async function verify() {
  const results = [];
  const check = async (label, expected, actual, note = "") => {
    const ok = expected === actual;
    results.push({ label, expected, actual, ok, note });
    return ok;
  };

  // counts: collection -> [table, expectedCount-from-JSON]
  const counts = [
    ["pharmacies", "pharmacy", readJson("pharmacies.json").length],
    ["branches", "branch", readJson("branches.json").length],
    ["users", "user", readJson("users.json").length],
    ["categories", "category", readJson("categories.json").length],
    ["suppliers", "supplier", readJson("suppliers.json").length],
    ["medicines", "medicine", readJson("medicines.json").length],
    ["medicinebatches", "medicineBatch", readJson("medicinebatches.json").length],
    ["customers", "customer", readJson("customers.json").length],
    ["sales", "sale", readJson("sales.json").length],
    ["inventorymovements", "inventoryMovement", (KEPT.inventorymovements || []).length],
    ["notifications", "notification", readJson("notifications.json").length],
    ["dailysessions", "dailySession", (KEPT.dailysessions || []).length],
    ["dailyreports", "dailyReport", readJson("dailyreports.json").length],
    ["expenses", "expense", readJson("expenses.json").length],
    ["auditlogs", "auditLog", readJson("auditlogs.json").length],
    ["stocktransfers", "stockTransfer", (KEPT.stocktransfers || []).length],
    ["stockadjustments", "stockAdjustment", readJson("stockadjustments.json").length],
    ["purchaseorders", "purchaseOrder", readJson("purchaseorders.json").length],
    ["salereturns", "saleReturn", readJson("salereturns.json").length],
    ["dispensingrecords", "dispensingRecord", readJson("dispensingrecords.json").length],
  ];
  for (const [coll, model, expected] of counts) {
    await check(coll, expected, await prisma[model].count());
  }

  // child tables: expected = total embed lengths in source JSON
  const salesJson = readJson("sales.json");
  const customersJson = readJson("customers.json");
  const transfersJson = readJson("stocktransfers.json");
  const posJson = readJson("purchaseorders.json");
  const returnsJson = readJson("salereturns.json");
  const sum = (arr, f) => arr.reduce((n, x) => n + f(x), 0);
  await check("sale_items", sum(salesJson, (s) => (s.items || []).length), await prisma.saleItem.count());
  await check("sale_payments", sum(salesJson, (s) => (s.payments || []).length), await prisma.salePayment.count());
  await check("customer_vitals", sum(customersJson, (c) => (c.vitals || []).length), await prisma.customerVital.count());
  await check("customer_visits", sum(customersJson, (c) => (c.visits || []).length), await prisma.customerVisit.count());
  await check("stock_transfer_items", sum(KEPT.stocktransfers || [], (t) => (t.products || []).length), await prisma.stockTransferItem.count());
  await check("purchase_order_items", sum(posJson, (p) => (p.products || []).length), await prisma.purchaseOrderItem.count());
  await check("sale_return_items", sum(returnsJson, (r) => (r.items || []).length), await prisma.saleReturnItem.count());
  await check("pharmacy_settings", readJson("pharmacies.json").length, await prisma.pharmacySettings.count());

  // spot checks (aggregates computed from source JSON vs SQL)
  const num = (v) => (v == null ? 0 : Number(v));
  const medJson = readJson("medicines.json");
  const medAgg = await prisma.medicine.aggregate({ _sum: { purchasePrice: true, sellingPrice: true }, _count: true });
  await check("medicines:COUNT", medJson.length, medAgg._count);
  await check("medicines:SUM(purchasePrice)", Math.round(sum(medJson, (m) => num(m.purchasePrice)) * 100) / 100, Math.round((medAgg._sum.purchasePrice || 0) * 100) / 100);
  await check("medicines:SUM(sellingPrice)", Math.round(sum(medJson, (m) => num(m.sellingPrice)) * 100) / 100, Math.round((medAgg._sum.sellingPrice || 0) * 100) / 100);
  await check("medicines:COUNT(prescriptionRequired)", medJson.filter((m) => m.prescriptionRequired).length, await prisma.medicine.count({ where: { prescriptionRequired: true } }));

  const saleAgg = await prisma.sale.aggregate({ _sum: { total: true, subtotal: true, costOfGoods: true, discount: true }, _count: true });
  await check("sales:COUNT", salesJson.length, saleAgg._count);
  await check("sales:SUM(total)", Math.round(sum(salesJson, (s) => num(s.total)) * 100) / 100, Math.round((saleAgg._sum.total || 0) * 100) / 100);
  await check("sales:SUM(subtotal)", Math.round(sum(salesJson, (s) => num(s.subtotal)) * 100) / 100, Math.round((saleAgg._sum.subtotal || 0) * 100) / 100);
  await check("sales:SUM(costOfGoods)", Math.round(sum(salesJson, (s) => num(s.costOfGoods)) * 100) / 100, Math.round((saleAgg._sum.costOfGoods || 0) * 100) / 100);
  for (const st of ["completed", "partially_refunded", "refunded", "voided", "held"]) {
    await check(`sales:status=${st}`, salesJson.filter((s) => s.status === st).length, await prisma.sale.count({ where: { status: st } }));
  }

  const custJson = readJson("customers.json");
  const custAgg = await prisma.customer.aggregate({ _sum: { outstandingBalance: true }, _count: true });
  await check("customers:COUNT", custJson.length, custAgg._count);
  await check("customers:SUM(outstandingBalance)", Math.round(sum(custJson, (c) => num(c.outstandingBalance)) * 100) / 100, Math.round((custAgg._sum.outstandingBalance || 0) * 100) / 100);

  const userJson = readJson("users.json").slice().sort((a, b) => a.email.localeCompare(b.email));
  const userRows = await prisma.user.findMany({ select: { email: true, role: true, permissions: true, isActive: true, staffId: true }, orderBy: { email: "asc" } });
  const usersEqual = userJson.length === userRows.length && userJson.every((u, i) =>
    u.email === userRows[i].email && u.role === userRows[i].role &&
    JSON.stringify(u.permissions || []) === JSON.stringify(userRows[i].permissions) &&
    (u.isActive ?? true) === userRows[i].isActive && u.staffId === userRows[i].staffId);
  await check("users:FULL-ROW(email,role,permissions,isActive,staffId)", true, usersEqual);

  const batchJson = readJson("medicinebatches.json");
  const batchAgg = await prisma.medicineBatch.aggregate({ _sum: { quantity: true }, _count: true });
  await check("medicinebatches:COUNT", batchJson.length, batchAgg._count);
  await check("medicinebatches:SUM(quantity)", sum(batchJson, (b) => num(b.quantity)), batchAgg._sum.quantity || 0);

  const movJson = KEPT.inventorymovements || [];
  const movAgg = await prisma.inventoryMovement.aggregate({ _sum: { quantityChange: true }, _count: true });
  await check("inventorymovements:COUNT", movJson.length, movAgg._count);
  await check("inventorymovements:SUM(quantityChange)", sum(movJson, (m) => num(m.quantityChange)), movAgg._sum.quantityChange || 0);

  const expJson = readJson("expenses.json");
  await check("expenses:COUNT", expJson.length, await prisma.expense.count());
  await check("expenses:SUM(amount)", Math.round(sum(expJson, (e) => num(e.amount)) * 100) / 100, Math.round(((await prisma.expense.aggregate({ _sum: { amount: true } }))._sum.amount || 0) * 100) / 100);

  await check("auditlogs:COUNT", readJson("auditlogs.json").length, await prisma.auditLog.count());
  await check("auditlogs:COUNT(with before-snapshot)", readJson("auditlogs.json").filter((a) => a.before !== undefined).length, await prisma.auditLog.count({ where: { before: { not: Prisma.DbNull } } }));

  const notifJson = readJson("notifications.json");
  await check("notifications:COUNT", notifJson.length, await prisma.notification.count());
  await check("notifications:COUNT(isRead)", notifJson.filter((n) => n.isRead).length, await prisma.notification.count({ where: { isRead: true } }));

  const sessJson = KEPT.dailysessions || [];
  await check("dailysessions:COUNT", sessJson.length, await prisma.dailySession.count());
  await check("dailysessions:SUM(openingCash)", sum(sessJson, (s) => num(s.openingCash)), ((await prisma.dailySession.aggregate({ _sum: { openingCash: true } }))._sum.openingCash) || 0);

  const branchJson = readJson("branches.json").slice().sort((a, b) => a.code.localeCompare(b.code));
  const branchRows = await prisma.branch.findMany({ select: { code: true, name: true, status: true }, orderBy: { code: "asc" } });
  const branchesEqual = branchJson.length === branchRows.length && branchJson.every((b, i) => b.code === branchRows[i].code && b.name === branchRows[i].name && (b.status || "active") === branchRows[i].status);
  await check("branches:FULL-ROW(code,name,status)", true, branchesEqual);

  // quarantine reconciliation: source docs = table rows + quarantined rows
  for (const [coll, n] of Object.entries(QUARANTINED)) {
    await check(`legacy_orphans:${coll}`, n, await prisma.legacyOrphan.count({ where: { collection: coll } }));
  }
  await check("legacy_orphans:TOTAL", Object.values(QUARANTINED).reduce((a, b) => a + b, 0), await prisma.legacyOrphan.count());
  for (const coll of ["inventorymovements", "dailysessions", "stocktransfers"]) {
    await check(`reconcile:${coll} source==kept+quarantined`, readJson(coll + ".json").length, (KEPT[coll] || []).length + (QUARANTINED[coll] || 0));
  }

  // every legacyId preserved on every migrated table
  const legacyChecks = [
    ["pharmacy", readJson("pharmacies.json").length],
    ["user", readJson("users.json").length],
    ["medicine", readJson("medicines.json").length],
    ["medicineBatch", readJson("medicinebatches.json").length],
    ["customer", readJson("customers.json").length],
    ["sale", readJson("sales.json").length],
    ["auditLog", readJson("auditlogs.json").length],
    ["dispensingRecord", readJson("dispensingrecords.json").length],
  ];
  for (const [model, expected] of legacyChecks) {
    await check(`${model}:legacyId NOT NULL`, expected, await prisma[model].count({ where: { legacyId: { not: null } } }));
  }

  return results;
}

async function main() {
  if (fs.existsSync(ERROR_LOG)) fs.unlinkSync(ERROR_LOG);
  console.log("== Stage 5: MongoDB -> PostgreSQL migration ==");
  console.log("source:", BACKUP_JSON);
  await freshGuard();
  const t0 = Date.now();
  await migrate();
  console.log(`load finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`quarantined rows: ${JSON.stringify(QUARANTINED)}`);
  console.log(`remap/NULL notes: ${notes.length}, errors: ${errors.length}`);
  const results = await verify();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}  expected=${r.expected} actual=${r.actual}`);
  }
  console.log(`\nverify: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILED CHECKS:", failed.map((f) => f.label).join(", "));
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  logError("FATAL", "", e.stack || e.message);
  console.error("FATAL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
