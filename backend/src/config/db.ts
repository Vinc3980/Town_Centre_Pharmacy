import { logger } from "../utils/logger";
import { pingDb } from "./prisma";

let pgHealthy = false;

function databaseName(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/\/([^/?]+)(\?|$)/);
  return match?.[1] ?? "postgres";
}

export async function connectDB(): Promise<void> {
  pgHealthy = await pingDb();
  if (!pgHealthy) throw new Error("PostgreSQL connection failed");
  logger.info({ db: databaseName() }, "PostgreSQL connected");
}

export function isDbConnected(): boolean {
  return pgHealthy;
}

export function dbStatus(): string {
  return pgHealthy ? "connected" : "disconnected";
}
