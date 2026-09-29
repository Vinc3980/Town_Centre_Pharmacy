import { api } from "../lib/apiClient";
import { StockAdjustment } from "../types";

export async function createAdjustment(payload: {
  medicine: string;
  type: "increase" | "decrease";
  quantity: number;
  reason: string;
  location: string;
  notes?: string;
}): Promise<StockAdjustment> {
  const { data } = await api.post("/stock-adjustments", payload);
  return data;
}

export async function listAdjustments(params?: {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: StockAdjustment[]; pagination: { page: number; limit: number; total: number } }> {
  const { data } = await api.get("/stock-adjustments", { params });
  return data;
}

export async function getAdjustment(id: string): Promise<StockAdjustment> {
  const { data } = await api.get(`/stock-adjustments/${id}`);
  return data;
}

export async function approveAdjustment(id: string, reviewNotes?: string): Promise<StockAdjustment> {
  const { data } = await api.post(`/stock-adjustments/${id}/approve`, { reviewNotes });
  return data;
}

export async function rejectAdjustment(id: string, reviewNotes?: string): Promise<StockAdjustment> {
  const { data } = await api.post(`/stock-adjustments/${id}/reject`, { reviewNotes });
  return data;
}

export async function deleteAdjustment(id: string): Promise<void> {
  await api.delete(`/stock-adjustments/${id}`);
}
