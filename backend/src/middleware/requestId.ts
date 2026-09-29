import { Request, Response, NextFunction } from "express";

let counter = 0;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.headers["x-request-id"] as string | undefined ?? `req-${++counter}-${Date.now()}`;
  req.id = id;
  res.setHeader("X-Request-ID", id);
  next();
}
