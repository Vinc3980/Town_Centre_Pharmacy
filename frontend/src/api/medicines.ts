import { api } from "../lib/apiClient";
import { Medicine } from "../types";

export interface Category {
  _id: string;
  name: string;
  description?: string;
}

export async function fetchMedicines(search = ""): Promise<Medicine[]> {
  const { data } = await api.get(`/medicines${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  return data;
}

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get("/categories");
  return data;
}

export async function createMedicine(payload: Record<string, unknown>): Promise<Medicine> {
  const { data } = await api.post("/medicines", payload);
  return data;
}

export async function updateMedicine(id: string, payload: Record<string, unknown>): Promise<Medicine> {
  const { data } = await api.put(`/medicines/${id}`, payload);
  return data;
}

export async function deleteMedicine(id: string): Promise<void> {
  await api.delete(`/medicines/${id}`);
}

export async function discontinueMedicine(id: string): Promise<void> {
  await api.post(`/medicines/${id}/discontinue`);
}

export async function receiveStock(payload: {
  medicine: string;
  batchNumber: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  expiryDate: string;
  manufacturingDate?: string;
  supplier?: string;
}): Promise<void> {
  await api.post("/medicines/stock/receive", payload);
}

export async function adjustStock(payload: {
  batch: string;
  quantityChange: number;
  reason: string;
}): Promise<void> {
  await api.post("/medicines/stock/adjust", payload);
}

export async function uploadMedicineImage(medicineId: string, file: File): Promise<{ imageUrl: string }> {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post(`/medicines/${medicineId}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function removeMedicineImage(medicineId: string): Promise<void> {
  await api.delete(`/medicines/${medicineId}/image`);
}
