import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { Permission } from "../utils/permissions";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    const hasAll = permissions.every((p) => req.user!.permissions.includes(p));
    if (!hasAll) return next(new ApiError(403, "You don't have permission to do that"));
    next();
  };
}
