/**
 * Security utility functions for input sanitization and validation.
 */

/**
 * Escapes special regex characters in a string to prevent ReDoS attacks.
 * Uses user input as literal text in $regex queries.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Allowed fields that can be updated via client input on Medicine.
 * Prevents mass assignment of internal/protected fields.
 */
export const MEDICINE_UPDATABLE_FIELDS = [
  "name", "genericName", "brand", "category", "manufacturer",
  "dosage", "strength", "form", "barcode", "sku",
  "prescriptionRequired", "description", "supplier",
  "isControlledSubstance", "controlledSubstanceClass",
  "purchasePrice", "sellingPrice", "minStock", "maxStock", "reorderLevel",
  "status",
] as const;

/**
 * Allowed fields that can be updated via client input on Customer.
 * Prevents mass assignment of internal/protected fields.
 */
export const CUSTOMER_UPDATABLE_FIELDS = [
  "name", "phone", "notes",
] as const;

/**
 * Allowed fields that can be updated via client input on User (by admin).
 * Prevents mass assignment of passwordHash, refreshTokenVersion, etc.
 */
export const USER_UPDATABLE_FIELDS = [
  "name", "email", "role", "branch", "isActive", "phone",
] as const;

/**
 * Protected fields that should NEVER be settable by client input on any model.
 */
export const PROTECTED_FIELDS = [
  "_id", "pharmacyId", "createdAt", "updatedAt", "__v",
  "passwordHash", "refreshTokenVersion", "loginAttempts", "lockedUntil",
  "approvedBy", "recordedBy", "performedBy", "reviewedBy",
  "refundedAmount", "refundReason", "costOfGoods",
] as const;

/**
 * Strips protected fields from an object to prevent mass assignment.
 */
export function stripProtectedFields<T extends Record<string, unknown>>(
  data: T,
  allowedFields: readonly string[],
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (allowedFields.includes(key) && !PROTECTED_FIELDS.includes(key as typeof PROTECTED_FIELDS[number])) {
      result[key] = data[key];
    }
  }
  return result as Partial<T>;
}

/**
 * Sanitizes a string for safe use in HTML context.
 * Prevents XSS when rendering user-generated content.
 */
export function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validates that a string is a valid UUID (PostgreSQL primary key format).
 */
export function isValidUuid(id: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
}

/**
 * Sanitizes Content-Disposition filename to prevent header injection.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 100);
}
