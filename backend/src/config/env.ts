import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing env var ${name}`);
  return value;
}

function getJwtSecret(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${name} must be set in production. Generate with: openssl rand -hex 64`);
    }
    console.warn(`⚠️  Using insecure default ${name}. Set ${name} env var for production.`);
  }
  return value ?? fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  jwtAccessSecret: getJwtSecret("JWT_ACCESS_SECRET", "dev-access-secret"),
  jwtRefreshSecret: getJwtSecret("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? process.env.CLIENT_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173"),
  get isProduction() {
    return this.nodeEnv === "production";
  },
};

export type Env = typeof env;
