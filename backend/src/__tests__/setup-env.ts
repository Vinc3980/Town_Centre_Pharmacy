import dotenv from "dotenv";

dotenv.config();

const real = process.env.DATABASE_URL;
if (!real) throw new Error("DATABASE_URL missing — run tests with backend/.env present");

const testUrl =
  process.env.TEST_DATABASE_URL ??
  real.replace(/\/[^/?]+(\?|$)/, `/${process.env.TEST_DB_NAME ?? "adom_pharmacy_test"}$1`);

process.env.DATABASE_URL = testUrl;
