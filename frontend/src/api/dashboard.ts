import { api } from "../lib/apiClient";
import {
  DashboardSummary,
  RevenuePoint,
  PaymentBreakdownItem,
  TopMedicine,
  SalesByStaffItem,
  InventoryAlerts,
  SalesByCategory,
  StaffDashboard,
  AuditEntry,
} from "../types";

interface DashboardParams {
  from?: string;
  to?: string;
  branch?: string;
  cashier?: string;
  days?: number;
  limit?: number;
}

function buildQuery(params?: DashboardParams): string {
  if (!params) return "";
  const parts: string[] = [];
  if (params.from) parts.push(`from=${params.from}`);
  if (params.to) parts.push(`to=${params.to}`);
  if (params.branch) parts.push(`branch=${params.branch}`);
  if (params.cashier) parts.push(`cashier=${params.cashier}`);
  if (params.days) parts.push(`days=${params.days}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function fetchDashboardSummary(params?: DashboardParams): Promise<DashboardSummary> {
  const { data } = await api.get(`/dashboard${buildQuery(params)}`);
  return data;
}

export async function fetchRevenueTrend(params?: DashboardParams): Promise<RevenuePoint[]> {
  const { data } = await api.get(`/dashboard/revenue-trend${buildQuery(params)}`);
  return data;
}

export async function fetchPaymentBreakdown(params?: DashboardParams): Promise<PaymentBreakdownItem[]> {
  const { data } = await api.get(`/dashboard/payment-breakdown${buildQuery(params)}`);
  return data;
}

export async function fetchTopMedicines(params?: DashboardParams): Promise<TopMedicine[]> {
  const { data } = await api.get(`/dashboard/top-medicines${buildQuery(params)}`);
  return data;
}

export async function fetchSalesByStaff(params?: DashboardParams): Promise<SalesByStaffItem[]> {
  const { data } = await api.get(`/dashboard/sales-by-staff${buildQuery(params)}`);
  return data;
}

export async function fetchInventoryAlerts(): Promise<InventoryAlerts> {
  const { data } = await api.get("/dashboard/inventory-alerts");
  return data;
}

export async function fetchSalesByCategory(params?: DashboardParams): Promise<SalesByCategory[]> {
  const { data } = await api.get(`/dashboard/sales-by-category${buildQuery(params)}`);
  return data;
}

export async function fetchStaffDashboard(): Promise<StaffDashboard> {
  const { data } = await api.get("/dashboard/staff");
  return data;
}

export async function fetchRecentActivity(limit = 20): Promise<AuditEntry[]> {
  const { data } = await api.get(`/dashboard/recent-activity?limit=${limit}`);
  return data;
}

export async function syncInventoryAlerts(): Promise<{ message: string; created: number }> {
  const { data } = await api.post("/dashboard/sync-alerts");
  return data;
}
