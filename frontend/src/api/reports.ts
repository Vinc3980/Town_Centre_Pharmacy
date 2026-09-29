import { api } from "../lib/apiClient";

export interface ReportFilters {
  from?: string;
  to?: string;
  branch?: string;
  cashier?: string;
  medicine?: string;
  category?: string;
  supplier?: string;
  paymentMethod?: string;
  status?: string;
  claimStatus?: string;
  expiryDays?: number;
  page?: number;
  limit?: number;
}

function qs(filters?: ReportFilters): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.from) parts.push(`from=${filters.from}`);
  if (filters.to) parts.push(`to=${filters.to}`);
  if (filters.branch) parts.push(`branch=${filters.branch}`);
  if (filters.cashier) parts.push(`cashier=${filters.cashier}`);
  if (filters.medicine) parts.push(`medicine=${filters.medicine}`);
  if (filters.category) parts.push(`category=${filters.category}`);
  if (filters.supplier) parts.push(`supplier=${filters.supplier}`);
  if (filters.paymentMethod) parts.push(`paymentMethod=${filters.paymentMethod}`);
  if (filters.status) parts.push(`status=${filters.status}`);
  if (filters.claimStatus) parts.push(`claimStatus=${filters.claimStatus}`);
  if (filters.expiryDays) parts.push(`expiryDays=${String(filters.expiryDays)}`);
  if (filters.page) parts.push(`page=${String(filters.page)}`);
  if (filters.limit) parts.push(`limit=${String(filters.limit)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function exportUrl(endpoint: string, filters: ReportFilters | undefined, format: string): string {
  const base = qs(filters);
  const sep = base ? "&" : "?";
  return `/api/v1/reports/${endpoint}${base}${sep}format=${format}`;
}

export async function fetchSalesReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/sales${qs(filters)}`);
  return data;
}

export async function fetchInventoryReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/inventory${qs(filters)}`);
  return data;
}

export async function fetchExpenseReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/expenses${qs(filters)}`);
  return data;
}

export async function fetchProfitReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/profit${qs(filters)}`);
  return data;
}

export async function fetchStaffReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/staff${qs(filters)}`);
  return data;
}

export async function fetchStockMovementReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/stock-movements${qs(filters)}`);
  return data;
}

export async function fetchExpiryReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/expiry${qs(filters)}`);
  return data;
}

export async function fetchLowStockReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/low-stock${qs(filters)}`);
  return data;
}

export async function fetchDailyReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/daily${qs(filters)}`);
  return data;
}

export async function fetchPurchaseReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/purchases${qs(filters)}`);
  return data;
}

export async function fetchInsuranceReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/insurance${qs(filters)}`);
  return data;
}

export async function fetchControlledReport(filters?: ReportFilters) {
  const { data } = await api.get(`/reports/controlled${qs(filters)}`);
  return data;
}

export function getExportUrl(reportType: string, filters: ReportFilters | undefined, format: string): string {
  const path = reportType === "purchases" ? "purchases" : reportType === "stock-movements" ? "stock-movements" : reportType === "low-stock" ? "low-stock" : reportType;
  return exportUrl(path, filters, format);
}
