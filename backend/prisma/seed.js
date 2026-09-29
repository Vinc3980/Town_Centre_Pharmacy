/**
 * Idempotent production seed — safe to run on every deploy.
 * Creates the three role accounts and the default medicine categories
 * on a fresh database. Existing rows are left untouched.
 *
 * Run: node prisma/seed.js   (from backend/, after `prisma generate` + build)
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Keep in sync with src/utils/permissions.ts (asserted by unit tests there).
const PERMISSIONS = [
  "view_dashboard",
  "manage_users",
  "manage_medicines",
  "manage_inventory",
  "process_sales",
  "process_refunds",
  "manage_suppliers",
  "view_reports",
  "manage_settings",
  "view_audit_logs",
  "modify_prices",
  "perform_stock_adjustment",
  "manage_expenses",
  "manage_prescriptions",
  "apply_discounts",
  "dispense_controlled_substances",
];

const STAFF_PERMISSIONS = ["view_dashboard", "process_sales", "view_reports"];

const USERS = [
  {
    name: "Nana Adjei (Admin)",
    email: "admin@adompharmacy.gh",
    staffId: "AD-0001",
    role: "admin",
    permissions: PERMISSIONS,
    password: "Admin123!",
  },
  {
    name: "Kwame Osei",
    email: "manager@adompharmacy.gh",
    staffId: "BM-0001",
    role: "branch_manager",
    permissions: PERMISSIONS,
    password: "Manager123!",
  },
  {
    name: "Ama Serwaa",
    email: "staff@adompharmacy.gh",
    staffId: "ST-0001",
    role: "staff",
    permissions: STAFF_PERMISSIONS,
    password: "Staff123!",
  },
];

const CATEGORIES = [
  "Analgesics",
  "Antibiotics",
  "Antimalarials",
  "Vitamins",
  "Cold & Flu",
  "First Aid",
  "Chronic Disease",
];

async function main() {
  for (const user of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      console.log(`skip user ${user.email} (exists)`);
      continue;
    }
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        staffId: user.staffId,
        role: user.role,
        permissions: user.permissions,
        passwordHash,
        isActive: true,
      },
    });
    console.log(`created user ${user.email} (${user.role})`);
  }

  for (const name of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      console.log(`skip category ${name} (exists)`);
      continue;
    }
    await prisma.category.create({ data: { name } });
    console.log(`created category ${name}`);
  }

  console.log("seed complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
