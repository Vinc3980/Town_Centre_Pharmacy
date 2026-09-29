import { api } from "../lib/apiClient";
import { AuditEntry, AuditLogResponse, StaffPerformance } from "../types";

export async function fetchAuditLogs(params?: {
  user?: string;
  action?: string;
  module?: string;
  entity?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AuditLogResponse> {
  const { data } = await api.get("/audit", { params });
  return data;
}

export async function fetchMyAuditLogs(params?: {
  action?: string;
  module?: string;
  entity?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AuditLogResponse> {
  const { data } = await api.get("/audit/my", { params });
  return data;
}

export async function fetchAuditLogById(id: string): Promise<AuditEntry> {
  const { data } = await api.get(`/audit/${id}`);
  return data;
}

export async function fetchRecentActivity(limit = 50): Promise<AuditEntry[]> {
  const { data } = await api.get("/activity/recent", { params: { limit } });
  return data;
}

export async function fetchStaffPerformance(params?: {
  from?: string;
  to?: string;
  user?: string;
}): Promise<StaffPerformance[]> {
  const { data } = await api.get("/activity/performance", { params });
  return data;
}
