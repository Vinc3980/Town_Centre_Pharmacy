export const APP_NAME = "Town Centre Pharmacy";
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const ROLES = ["staff", "branch_manager", "admin"] as const;
export type Role = typeof ROLES[number];
