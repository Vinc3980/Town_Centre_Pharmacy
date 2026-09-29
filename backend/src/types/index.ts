import { Request } from "express";

export interface AuthUser {
  id: string;
  pharmacyId?: string;
  roles: string[];
  permissions: string[];
}

export type AuthRequest = Request & { user?: AuthUser };

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
