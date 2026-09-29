import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { verifyAccessToken, AccessTokenPayload } from "../services/tokenService";
import { ApiError } from "../utils/ApiError";
import { Permission } from "../utils/permissions";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(401, "Not authenticated"));
  }
  try {
    const token = header.split(" ")[1];
    const payload = verifyAccessToken(token);
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { permissions: true, role: true, isActive: true },
    });
    if (!dbUser || dbUser.isActive === false) {
      return next(new ApiError(401, "Session expired, please log in again"));
    }
    payload.permissions = dbUser.permissions as Permission[];
    payload.role = dbUser.role;
    req.user = payload;
    next();
  } catch {
    next(new ApiError(401, "Session expired, please log in again"));
  }
}
