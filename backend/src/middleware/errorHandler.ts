import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { sendError } from "../utils/apiResponse";
import { logger } from "../utils/logger";

function sanitizeErrorForLog(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const sanitized: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    };
    return sanitized;
  }
  return { type: typeof err };
}

function getRequestId(req: Request): string | undefined {
  const id = req.id;
  return id !== undefined ? String(id) : undefined;
}

export function notFound(req: Request, res: Response) {
  return sendError(res, "Route not found", 404, undefined, getRequestId(req));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = getRequestId(req);
  if (err instanceof ZodError) {
    return sendError(res, "Validation failed", 400, err.errors.map((e) => ({ field: e.path.join("."), message: e.message })), requestId);
  }
  if (err instanceof ApiError) {
    return sendError(res, err.message, err.statusCode, err.errors, requestId);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2023") {
    return sendError(res, "Not found", 404, undefined, requestId);
  }
  logger.error({ err: sanitizeErrorForLog(err), requestId }, "Unhandled error");
  return sendError(res, "Something went wrong on our end", 500, undefined, requestId);
}
