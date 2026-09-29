import { api } from "../lib/apiClient";
import { StockTransfer } from "../types";

interface StockTransferListResponse {
  data: StockTransfer[];
  pagination: { page: number; limit: number; total: number };
}

export async function listTransfers(params?: {
  search?: string;
  status?: string;
  fromLocation?: string;
  toLocation?: string;
  page?: number;
  limit?: number;
}): Promise<StockTransferListResponse> {
  const { data } = await api.get("/stock-transfers", { params });
  return data ?? { data: [], pagination: { page: 1, limit: 10, total: 0 } };
}

export async function getTransfer(id: string): Promise<StockTransfer> {
  const { data } = await api.get(`/stock-transfers/${id}`);
  return data;
}

export async function createTransfer(payload: {
  fromLocation: string;
  toLocation: string;
  products: { medicine: string; quantity: number }[];
  notes?: string;
}): Promise<StockTransfer> {
  const { data } = await api.post("/stock-transfers", payload);
  return data;
}

export async function updateTransferStatus(
  id: string,
  status: "in_transit" | "completed" | "cancelled"
): Promise<StockTransfer> {
  const { data } = await api.put(`/stock-transfers/${id}/status`, { status });
  return data;
}

export async function deleteTransfer(id: string): Promise<void> {
  await api.delete(`/stock-transfers/${id}`);
}
