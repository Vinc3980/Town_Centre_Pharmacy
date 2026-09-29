import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Permission } from "../utils/permissions";

export interface AccessTokenPayload {
  sub: string;
  role: string;
  permissions: Permission[];
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires as jwt.SignOptions["expiresIn"] });
}

export function signRefreshToken(userId: string, tokenVersion: number) {
  return jwt.sign({ sub: userId, v: tokenVersion }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string; v: number };
}
