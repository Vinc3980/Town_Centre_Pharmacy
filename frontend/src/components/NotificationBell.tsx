import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from "../api/notifications";
import { getSocket } from "../lib/socket";
import { Notification } from "../types";

const PRIORITY_COLORS: Record<string, string> = {
  info: "bg-blue-50 border-l-blue-400",
  warning: "bg-amber-bg border-l-amber",
  critical: "bg-red-bg border-l-red",
};

const CATEGORY_LABELS: Record<string, string> = {
  low_stock: "Low stock",
  expiring_medicine: "Expiring",
  sale: "Sale",
  refund: "Refund",
  daily_report: "Report",
  security: "Security",
  system: "System",
};

const CATEGORY_ROUTES: Record<string, string> = {
  low_stock: "/inventory-alerts",
  expiring_medicine: "/inventory-alerts",
  sale: "/sales",
  refund: "/refunds",
  daily_report: "/daily-session",
  security: "/audit",
  system: "/dashboard",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    const panelWidth = 380;
    let left = rect.right - panelWidth;
    if (left < 8) left = 8;
    if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
    let top = rect.bottom + 8;
    if (top + 480 > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 488);
    setPanelPos({ top, left });
  }, []);

  useEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handleResize() { updatePosition(); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, updatePosition]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: fetchUnreadCount,
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    enabled: open,
    refetchInterval: open ? 10000 : 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleNew(notification: Notification) {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
      setLiveToast(notification.message);
    }

    socket.on("notification.created", handleNew);
    return () => { socket.off("notification.created", handleNew); };
  }, [queryClient]);

  useEffect(() => {
    if (!liveToast) return;
    const t = setTimeout(() => setLiveToast(null), 5000);
    return () => clearTimeout(t);
  }, [liveToast]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && bellRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-paper transition text-gray-soft hover:text-navy"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-orange-2 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
          className="w-[380px] max-h-[480px] bg-white rounded-card border border-line-soft shadow-panel overflow-hidden z-[200]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-sm font-medium text-navy">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-soft hover:text-navy">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[420px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-soft">No notifications</div>
            ) : (
              notifications.map((n: Notification) => (
                <div
                  key={n._id}
                  onClick={() => {
                    if (!n.isRead) markReadMutation.mutate(n._id);
                    setOpen(false);
                    navigate(CATEGORY_ROUTES[n.category] ?? "/dashboard");
                  }}
                  className={`px-4 py-3 border-b border-line cursor-pointer transition hover:bg-paper border-l-3 ${
                    PRIORITY_COLORS[n.priority] ?? "border-l-line"
                  } ${n.isRead ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-navy">{n.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-paper text-gray-soft">
                          {CATEGORY_LABELS[n.category] ?? n.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.isRead && <div className="w-2 h-2 rounded-full bg-orange-2" />}
                      <span className="text-[10px] text-gray-soft">{timeAgo(n.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {liveToast && (
        <div
          className="fixed top-5 right-5 z-[150] max-w-sm bg-white border border-line shadow-panel rounded-card px-4 py-3 text-sm text-navy animate-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <Bell size={14} className="text-blue-600 mt-0.5 shrink-0" />
            <span className="text-xs leading-relaxed">{liveToast}</span>
            <button onClick={() => setLiveToast(null)} className="ml-2 text-gray-soft hover:text-navy shrink-0">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
