import { api } from "../lib/apiClient";
import { Notification } from "../types";

export async function fetchNotifications(params?: {
  unreadOnly?: boolean;
  category?: string;
}): Promise<Notification[]> {
  const { data } = await api.get("/notifications", { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/read-all");
}
