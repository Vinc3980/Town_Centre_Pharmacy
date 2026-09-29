import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export interface TransactionResult<T> {
  result: T;
  session: Prisma.TransactionClient | null;
}

/**
 * Stage 6: real PostgreSQL transactions (the Mongo standalone fallback is gone).
 * `tx` is a Prisma transaction client — use it as the client for every query
 * that must be part of the transaction.
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx));
}

export async function withOptionalSession<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx));
}
