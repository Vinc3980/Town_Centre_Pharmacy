import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, User, Tag, Package, Clock } from "lucide-react";
import { fetchAuditLogs, fetchMyAuditLogs } from "../api/audit";
import { getSocket } from "../lib/socket";
import { AuditEntry } from "../types";
import { useAuth } from "../context/AuthContext";
import SearchInput from "../components/ui/SearchInput";
import Select from "../components/ui/Select";
import Badge from "../components/ui/Badge";
import { TableSkeleton } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";

const MODULES = [
  { value: "", label: "All modules" },
  { value: "auth", label: "Auth" },
  { value: "sales", label: "Sales" },
  { value: "inventory", label: "Inventory" },
  { value: "medicines", label: "Products" },
  { value: "expenses", label: "Expenses" },
  { value: "daily", label: "Daily" },
  { value: "customers", label: "Customers" },
];

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "USER_LOGIN", label: "User Login" },
  { value: "USER_LOGOUT", label: "User Logout" },
  { value: "SALE_CREATED", label: "Sale Created" },
  { value: "SALE_HELD", label: "Sale Held" },
  { value: "SALE_VOIDED", label: "Sale Voided" },
  { value: "SALE_REFUND_REQUESTED", label: "Refund Requested" },
  { value: "SALE_REFUND_APPROVED", label: "Refund Approved" },
  { value: "SALE_REFUND_REJECTED", label: "Refund Rejected" },
  { value: "SALE_REFUNDED", label: "Refunded" },
  { value: "STOCK_RECEIVED", label: "Stock Received" },
  { value: "STOCK_ADJUSTED", label: "Stock Adjusted" },
  { value: "MEDICINE_CREATED", label: "Medicine Created" },
  { value: "MEDICINE_UPDATED", label: "Medicine Updated" },
  { value: "MEDICINE_DELETED", label: "Medicine Deleted" },
  { value: "EXPENSE_CREATED", label: "Expense Created" },
  { value: "EXPENSE_APPROVED", label: "Expense Approved" },
  { value: "EXPENSE_REJECTED", label: "Expense Rejected" },
  { value: "DAILY_SESSION_OPENED", label: "Session Opened" },
  { value: "DAILY_SESSION_CLOSED", label: "Session Closed" },
  { value: "DAILY_REPORT_SUBMITTED", label: "Report Submitted" },
  { value: "DAILY_REPORT_APPROVED", label: "Report Approved" },
  { value: "DAILY_REPORT_REJECTED", label: "Report Rejected" },
];

const ACTION_BADGE: Record<string, string> = {
  USER_LOGIN: "pine",
  SALE_CREATED: "blue",
  SALE_HELD: "amber",
  SALE_VOIDED: "red",
  SALE_REFUND_REQUESTED: "amber",
  SALE_REFUND_APPROVED: "pine",
  SALE_REFUND_REJECTED: "red",
  SALE_REFUNDED: "red",
  STOCK_RECEIVED: "blue",
  STOCK_ADJUSTED: "amber",
  MEDICINE_CREATED: "pine",
  MEDICINE_UPDATED: "blue",
  MEDICINE_DELETED: "red",
  EXPENSE_APPROVED: "pine",
  EXPENSE_REJECTED: "red",
  DAILY_SESSION_OPENED: "pine",
  DAILY_REPORT_APPROVED: "pine",
  DAILY_REPORT_REJECTED: "red",
};

function ModuleBadge({ mod }: { mod: string }) {
  const icons: Record<string, React.ReactNode> = {
    auth: <User size={10} />,
    sales: <Package size={10} />,
    inventory: <Package size={10} />,
    medicines: <Package size={10} />,
    expenses: <Tag size={10} />,
    daily: <Clock size={10} />,
  };
  return (
    <Badge variant="sand">
      <span className="inline-flex items-center gap-1">
        {icons[mod] ?? null}
        {mod}
      </span>
    </Badge>
  );
}

export default function Activity() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  const queryClient = useQueryClient();
  const [liveEvents, setLiveEvents] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const liveRef = useRef<HTMLDivElement>(null);

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (module) params.module = module;
  if (action) params.action = action;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data: logResponse, isLoading } = useQuery({
    queryKey: ["audit-logs", search, module, action, from, to, isStaff],
    queryFn: () => isStaff ? fetchMyAuditLogs({ module: module || undefined, action: action || undefined, from: from || undefined, to: to || undefined, search: search || undefined }) : fetchAuditLogs(params),
    refetchInterval: 15000,
  });

  const logs = logResponse?.data ?? [];

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleAudit(entry: AuditEntry) {
      setLiveEvents((prev) => [entry, ...prev].slice(0, 50));
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    }

    socket.on("audit.created", handleAudit);

    return () => {
      socket.off("audit.created", handleAudit);
    };
  }, [queryClient]);

  const displayLogs = [...liveEvents, ...(logs ?? []).filter((l: AuditEntry) => !liveEvents.some((le) => le._id === l._id))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-900">Activity</h1>
        <Badge variant="pine">
          <span className="inline-flex items-center gap-1">
            <CircleDot size={10} /> live
          </span>
        </Badge>
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity..."
            />
          </div>
          <Select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            options={MODULES}
          />
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={ACTIONS}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 transition"
          />
        </div>
      </div>

      <div ref={liveRef} className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        {isLoading && displayLogs.length === 0 ? (
          <TableSkeleton rows={5} cols={3} />
        ) : displayLogs.length === 0 ? (
          <EmptyState
            icon={<CircleDot size={24} className="text-ink-900/30" />}
            title="No activity found"
            description="Activity events will appear here in real time."
          />
        ) : (
          <div className="divide-y divide-sand-100">
            {displayLogs.map((log: AuditEntry, idx: number) => {
              const isLive = idx < liveEvents.length;
              return (
                <div
                  key={log._id}
                  className={`px-4 py-3 flex items-start gap-3 hover:bg-sand-50 transition ${isLive ? "bg-pine-50/30" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900">{log.description}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {log.action && <Badge variant={ACTION_BADGE[log.action] ?? "sand"}>{log.action.replace(/_/g, " ").toLowerCase()}</Badge>}
                      {log.module && <ModuleBadge mod={log.module} />}
                      {log.userName && (
                        <span className="text-xs text-ink-900/40">
                          by {typeof log.user === "object" ? log.user.name : log.userName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-ink-900/30 whitespace-nowrap shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
