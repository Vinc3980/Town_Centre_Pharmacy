import { apiClient } from "./client";

export interface HealthResponse {
  success: true;
  message: string;
  data?: { database: string; uptime: number };
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
}
