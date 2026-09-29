import { Response } from "express";

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data?: T;
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errorId?: string;
  errors?: unknown;
}

export function sendSuccess<T>(res: Response, message: string, data?: T, statusCode = 200, meta?: ApiSuccess<T>["meta"]) {
  const body: ApiSuccess<T> = { success: true, message };
  if (data !== undefined) body.data = data;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendError(res: Response, message: string, statusCode = 500, errors?: unknown, errorId?: string | number) {
  const body: ApiErrorBody = { success: false, message };
  if (errorId !== undefined) body.errorId = String(errorId);
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}
