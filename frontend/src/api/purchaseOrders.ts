import { api } from "../lib/apiClient";
import { PurchaseOrder } from "../types";

export interface PaginatedPurchaseOrders {
  data: PurchaseOrder[];
  pagination: { page: number; limit: number; total: number };
}

export async function createPurchaseOrder(payload: {
  supplier: string;
  products: { medicine: string; quantity: number; unitPrice: number }[];
  expectedDeliveryDate?: string;
  notes?: string;
}): Promise<PurchaseOrder> {
  const { data } = await api.post("/purchase-orders", payload);
  return data;
}

export async function listPurchaseOrders(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedPurchaseOrders> {
  const { data } = await api.get("/purchase-orders", { params });
  return data;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await api.get(`/purchase-orders/${id}`);
  return data;
}

export async function updatePurchaseOrder(
  id: string,
  payload: {
    supplier?: string;
    products?: { medicine: string; quantity: number; unitPrice: number }[];
    expectedDeliveryDate?: string;
    notes?: string;
  }
): Promise<PurchaseOrder> {
  const { data } = await api.put(`/purchase-orders/${id}`, payload);
  return data;
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: string
): Promise<PurchaseOrder> {
  const { data } = await api.put(`/purchase-orders/${id}/status`, { status });
  return data;
}

export async function receivePurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await api.post(`/purchase-orders/${id}/receive`);
  return data;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await api.delete(`/purchase-orders/${id}`);
}
