import { api } from "../lib/apiClient";
import { SaleItemInput, SalePayment, HeldSale, SaleReceipt, SaleDetail, SaleReturn } from "../types";

export async function createSale(
  items: SaleItemInput[],
  payments: SalePayment[],
  opts?: {
    customer?: string; tax?: number; discount?: number; holdId?: string;
    amountReceived?: number; dueDate?: string;
    saleType?: "retail" | "insurance"; insuranceProvider?: string; policyOrNhisNumber?: string;
    prescriptionReference?: string;
  }
) {
  const { data } = await api.post("/sales", { items, payments, ...opts });
  return data;
}

export async function updateClaimStatus(saleId: string, claimStatus: "submitted" | "approved" | "rejected") {
  const { data } = await api.patch(`/sales/${saleId}/claim-status`, { claimStatus });
  return data;
}

export async function holdSale(
  items: SaleItemInput[],
  opts?: {
    customer?: string; discount?: number; tax?: number;
    saleType?: "retail" | "insurance"; insuranceProvider?: string; policyOrNhisNumber?: string;
  }
) {
  const { data } = await api.post("/sales/hold", { items, ...opts });
  return data;
}

export async function resumeSale(
  holdId: string,
  payments: SalePayment[],
  opts?: { amountReceived?: number; prescriptionReference?: string }
) {
  const { data } = await api.post(`/sales/${holdId}/resume`, { payments, ...opts });
  return data;
}

export async function fetchHeldSales(): Promise<HeldSale[]> {
  const { data } = await api.get("/sales/held");
  return data;
}

export async function deleteHeldSale(id: string) {
  const { data } = await api.delete(`/sales/${id}/held`);
  return data;
}

export async function voidSale(id: string) {
  const { data } = await api.post(`/sales/${id}/void`);
  return data;
}

export async function getSaleReceipt(id: string): Promise<SaleReceipt> {
  const { data } = await api.get(`/sales/${id}/receipt`);
  return data;
}

export async function getSaleDetail(id: string): Promise<{ sale: SaleDetail; returns: SaleReturn[] }> {
  const { data } = await api.get(`/sales/${id}`);
  return data;
}

export async function listSales(params?: { status?: string; search?: string; from?: string; to?: string }): Promise<SaleDetail[]> {
  const { data } = await api.get("/sales", { params });
  return data;
}

export async function requestRefund(
  saleId: string,
  items: { medicine: string; batch: string; returnQuantity: number; condition: "resaleable" | "damaged"; reason: string }[]
) {
  const { data } = await api.post(`/sales/${saleId}/refund`, { items });
  return data;
}

export async function approveRefund(returnId: string, opts?: { rejectionReason?: string }): Promise<SaleReturn> {
  const { data } = await api.post(`/sales/refunds/${returnId}/approve`, opts ?? {});
  return data;
}

export async function listPendingRefunds(): Promise<SaleReturn[]> {
  const { data } = await api.get("/sales/refunds/pending");
  return data;
}

export async function lookupBarcode(barcode: string) {
  const { data } = await api.get(`/medicines/barcode/${encodeURIComponent(barcode)}`);
  return data;
}

export async function collectPayment(saleId: string, payments: SalePayment[], opts?: { amountReceived?: number }) {
  const { data } = await api.post(`/sales/${saleId}/collect-payment`, { payments, ...opts });
  return data;
}

export async function fetchCreditSales(): Promise<SaleDetail[]> {
  const { data } = await api.get("/sales", { params: { status: "completed" } });
  return data.filter((s: SaleDetail) => s.outstandingAmount && s.outstandingAmount > 0);
}
