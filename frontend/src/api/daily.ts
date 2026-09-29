import { api } from "../lib/apiClient";
import { DailySession, DailyReport, SaleDetail } from "../types";

export async function openSession(openingCash: number): Promise<DailySession> {
  const { data } = await api.post("/daily/sessions", { openingCash });
  return data;
}

export async function closeSession(actualCash: number, opts?: { actualMobileMoney?: number; actualCard?: number; actualBankTransfer?: number; notes?: string }): Promise<DailySession> {
  const { data } = await api.post("/daily/sessions/close", {
    actualCash,
    actualMobileMoney: opts?.actualMobileMoney ?? 0,
    actualCard: opts?.actualCard ?? 0,
    actualBankTransfer: opts?.actualBankTransfer ?? 0,
    notes: opts?.notes,
  });
  return data;
}

export async function getCurrentSession(): Promise<DailySession | null> {
  const { data } = await api.get("/daily/sessions/current");
  return data;
}

export async function listSessions(params?: { status?: string; from?: string; to?: string }): Promise<DailySession[]> {
  const { data } = await api.get("/daily/sessions", { params });
  return data;
}

export async function submitReport(actualCash: number, notes?: string): Promise<DailyReport> {
  const { data } = await api.post("/daily/reports/submit", { actualCash, notes });
  return data;
}

export async function getReportById(id: string): Promise<DailyReport> {
  const { data } = await api.get(`/daily/reports/${id}`);
  return data;
}

export async function listPendingReports(): Promise<DailyReport[]> {
  const { data } = await api.get("/daily/reports/pending");
  return data;
}

export async function listAllReports(status?: string): Promise<DailyReport[]> {
  const { data } = await api.get("/daily/reports", { params: { status } });
  return data;
}

export async function approveReport(id: string, reviewNotes?: string): Promise<DailyReport> {
  const { data } = await api.post(`/daily/reports/${id}/approve`, { reviewNotes });
  return data;
}

export async function rejectReport(id: string, reviewNotes: string): Promise<DailyReport> {
  const { data } = await api.post(`/daily/reports/${id}/reject`, { reviewNotes });
  return data;
}

export async function listPendingSessions(): Promise<DailySession[]> {
  const { data } = await api.get("/daily/sessions/pending");
  return data;
}

export async function getSessionSales(sessionId: string): Promise<SaleDetail[]> {
  const { data } = await api.get(`/daily/sessions/${sessionId}/sales`);
  return data;
}

export async function approveSession(id: string, reviewNotes?: string): Promise<DailySession> {
  const { data } = await api.post(`/daily/sessions/${id}/approve`, { reviewNotes });
  return data;
}

export async function approveSessionClose(id: string, reviewNotes?: string): Promise<DailySession> {
  const { data } = await api.post(`/daily/sessions/${id}/approve-close`, { reviewNotes });
  return data;
}

export async function rejectSession(id: string, reviewNotes: string) {
  const { data } = await api.post(`/daily/sessions/${id}/reject`, { reviewNotes });
  return data;
}

export async function rejectSessionClose(id: string, reviewNotes: string): Promise<DailySession> {
  const { data } = await api.post(`/daily/sessions/${id}/reject-close`, { reviewNotes });
  return data;
}
