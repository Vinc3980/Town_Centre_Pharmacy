import { api } from "../lib/apiClient";

export interface Customer {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  ghanaCardNumber?: string | null;
  allergies: string[];
  medicalConditions: string[];
  notes?: string;
  profileImage?: string;
  outstandingBalance: number;
  vitals: Vital[];
  visits: Visit[];
  createdAt: string;
}

export interface Vital {
  date: string;
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  notes?: string;
  recordedBy?: { _id: string; name: string } | string;
}

export interface Visit {
  date: string;
  reason: string;
  tests?: string;
  results?: string;
  notes?: string;
  recordedBy?: { _id: string; name: string } | string;
}

export async function fetchCustomers(search = ""): Promise<Customer[]> {
  const { data } = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await api.get(`/customers/${id}`);
  return data;
}

export async function createCustomer(payload: Record<string, unknown>): Promise<Customer> {
  const { data } = await api.post("/customers", payload);
  return data;
}

export async function updateCustomer(id: string, payload: Record<string, unknown>): Promise<Customer> {
  const { data } = await api.put(`/customers/${id}`, payload);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

export async function addVitals(id: string, payload: Record<string, unknown>): Promise<Customer> {
  const { data } = await api.post(`/customers/${id}/vitals`, payload);
  return data;
}

export async function addVisit(id: string, payload: Record<string, unknown>): Promise<Customer> {
  const { data } = await api.post(`/customers/${id}/visits`, payload);
  return data;
}

export async function uploadCustomerImage(id: string, file: File): Promise<{ profileImage: string }> {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post(`/customers/${id}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getCustomerReport(id: string) {
  const { data } = await api.get(`/customers/${id}/report`);
  return data;
}
