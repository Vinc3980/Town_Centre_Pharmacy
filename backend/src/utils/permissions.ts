export const PERMISSIONS = [
  "view_dashboard",
  "manage_users",
  "manage_medicines",
  "manage_inventory",
  "process_sales",
  "process_refunds",
  "manage_suppliers",
  "view_reports",
  "manage_settings",
  "view_audit_logs",
  "modify_prices",
  "perform_stock_adjustment",
  "manage_expenses",
  "manage_prescriptions",
  "apply_discounts",
  "dispense_controlled_substances",
] as const;

export type Permission = typeof PERMISSIONS[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  staff: ["view_dashboard", "process_sales", "view_reports"],
  branch_manager: [...PERMISSIONS],
  admin: [...PERMISSIONS],
};

export const ROLES = Object.keys(ROLE_PERMISSIONS);
