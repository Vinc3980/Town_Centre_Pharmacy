import { api } from "../lib/apiClient";
import { User } from "../types";

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: string;
  branch?: string;
  phone?: string;
  permissions?: string[];
  salary?: number;
  salaryStartDate?: string;
  salaryReminderDays?: number;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  employmentDate?: string;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: string;
  branch?: string;
  isActive?: boolean;
  phone?: string;
  permissions?: string[];
  salary?: number;
  salaryStartDate?: string;
  salaryReminderDays?: number;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  employmentDate?: string;
}

function normalizeUser(u: any): User {
  return { ...u, id: u.id ?? u._id };
}

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get("/users");
  return data.map(normalizeUser);
}

export async function fetchUserById(id: string): Promise<User> {
  const { data } = await api.get(`/users/${id}`);
  return normalizeUser(data);
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post("/users", payload);
  return normalizeUser(data);
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  const { data } = await api.put(`/users/${id}`, payload);
  return normalizeUser(data);
}

export async function deactivateUser(id: string): Promise<void> {
  await api.post(`/users/${id}/deactivate`);
}

export async function reactivateUser(id: string): Promise<void> {
  await api.post(`/users/${id}/reactivate`);
}

export async function adminResetPassword(id: string, newPassword: string): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { newPassword });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post("/users/request-password-reset", { email });
}

export async function uploadStaffImage(id: string, file: File): Promise<{ profilePicture: string }> {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post<{ profilePicture: string }>(`/users/${id}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
