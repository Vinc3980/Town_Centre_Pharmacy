import { api } from "../lib/apiClient";

export interface PharmacyInfo {
  id: string;
  name: string;
  registrationNumber: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  region: string;
  country: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
  status: string;
  branches: string[];
  paymentMethods: string[];
}

export interface InventorySettings {
  lowStockThreshold: number;
  expiryWarningDays: number;
  allowNegativeStock: boolean;
  requireManagerApprovalForStockAdjustment: boolean;
}

export interface SalesSettings {
  requireManagerApprovalForRefund: boolean;
  discountAuthorizationRequired: boolean;
  receiptFooter: string;
  taxRate: number;
  taxEnabled: boolean;
}

export interface SecuritySettings {
  minPasswordLength: number;
  sessionExpirationMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

export interface AllSettings {
  pharmacy: PharmacyInfo;
  inventory: InventorySettings;
  sales: SalesSettings;
  security: SecuritySettings;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  permissions: string[];
  branch?: string;
  staffId?: string;
  profilePicture?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export async function fetchAllSettings() {
  const { data } = await api.get<AllSettings>("/settings");
  return data;
}

export async function updatePharmacyInfo(payload: Partial<PharmacyInfo>) {
  const { data } = await api.put<PharmacyInfo>("/settings/pharmacy", payload);
  return data;
}

export async function updateInventorySettings(payload: Partial<InventorySettings>) {
  const { data } = await api.put<InventorySettings>("/settings/inventory", payload);
  return data;
}

export async function updateSalesSettings(payload: Partial<SalesSettings>) {
  const { data } = await api.put<SalesSettings>("/settings/sales", payload);
  return data;
}

export async function updateSecuritySettings(payload: Partial<SecuritySettings>) {
  const { data } = await api.put<SecuritySettings>("/settings/security", payload);
  return data;
}

export async function fetchProfile() {
  const { data } = await api.get<UserProfile>("/profile");
  return data;
}

export async function updateProfile(payload: { name?: string; email?: string; phone?: string }) {
  const { data } = await api.put<UserProfile>("/profile", payload);
  return data;
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  const { data } = await api.put<{ message: string }>("/profile/password", payload);
  return data;
}

export async function uploadPharmacyLogo(file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append("logo", file);
  const { data } = await api.post<{ logoUrl: string }>("/settings/pharmacy/logo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function removePharmacyLogo(): Promise<void> {
  await api.delete("/settings/pharmacy/logo");
}
