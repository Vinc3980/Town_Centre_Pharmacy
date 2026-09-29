import { api } from "../lib/apiClient";
import { Expense } from "../types";

export async function listExpenses(params?: { status?: string; category?: string; from?: string; to?: string; search?: string }): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params });
  return data;
}

export async function getExpenseById(id: string): Promise<Expense> {
  const { data } = await api.get(`/expenses/${id}`);
  return data;
}

export async function createExpense(
  payload: { category: string; description: string; amount: number; paymentMethod?: string; date?: string },
  receipt?: File
): Promise<Expense> {
  if (receipt) {
    const formData = new FormData();
    formData.append("category", payload.category);
    formData.append("description", payload.description);
    formData.append("amount", String(payload.amount));
    if (payload.paymentMethod) formData.append("paymentMethod", payload.paymentMethod);
    if (payload.date) formData.append("date", payload.date);
    formData.append("receipt", receipt);
    const { data } = await api.post("/expenses", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }
  const { data } = await api.post("/expenses", payload);
  return data;
}

export async function updateExpense(
  id: string,
  payload: { category?: string; description?: string; amount?: number; paymentMethod?: string; date?: string },
  receipt?: File
): Promise<Expense> {
  if (receipt) {
    const formData = new FormData();
    if (payload.category) formData.append("category", payload.category);
    if (payload.description) formData.append("description", payload.description);
    if (payload.amount !== undefined) formData.append("amount", String(payload.amount));
    if (payload.paymentMethod) formData.append("paymentMethod", payload.paymentMethod);
    if (payload.date) formData.append("date", payload.date);
    formData.append("receipt", receipt);
    const { data } = await api.put(`/expenses/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }
  const { data } = await api.put(`/expenses/${id}`, payload);
  return data;
}

export async function approveExpense(id: string): Promise<Expense> {
  const { data } = await api.post(`/expenses/${id}/approve`);
  return data;
}

export async function rejectExpense(id: string, rejectionReason: string): Promise<Expense> {
  const { data } = await api.post(`/expenses/${id}/approve`, { rejectionReason });
  return data;
}
