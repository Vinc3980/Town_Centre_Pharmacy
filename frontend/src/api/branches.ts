import { api } from "../lib/apiClient";

export interface BranchStaff {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  branch: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  status: string;
  createdAt: string;
  manager: { id: string; name: string; email: string; role: string } | null;
  staff: BranchStaff[];
  today: { salesCount: number; revenue: number };
}

export interface CreateBranchPayload {
  name: string;
  code: string;
  address: string;
  phone: string;
  managerId?: string;
}

export interface BranchDailySale {
  id: string;
  transactionNumber: string;
  total: number;
  paymentMethod: string;
  saleType: string;
  createdAt: string;
  cashier: { id: string; name: string } | null;
}

export interface BranchDailyResponse {
  branch: { id: string; name: string; code: string };
  date: string;
  summary: { salesCount: number; revenue: number };
  sales: BranchDailySale[];
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await api.get<Branch[]>("/branches");
  return data;
}

export async function createBranch(payload: CreateBranchPayload): Promise<Branch> {
  const { data } = await api.post<Branch>("/branches", payload);
  return data;
}

export async function fetchBranchDaily(id: string, date?: string): Promise<BranchDailyResponse> {
  const { data } = await api.get<BranchDailyResponse>(`/branches/${id}/daily`, {
    params: date ? { date } : {},
  });
  return data;
}
