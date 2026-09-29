import { Request, Response } from "express";
import { isDbConnected } from "../config/db";
import { sendSuccess } from "../utils/apiResponse";

export async function healthCheck(_req: Request, res: Response) {
  return sendSuccess(res, "API is healthy", {
    status: "healthy",
    database: isDbConnected() ? "connected" : "disconnected",
    version: process.env.npm_package_version ?? "1.0.0",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
