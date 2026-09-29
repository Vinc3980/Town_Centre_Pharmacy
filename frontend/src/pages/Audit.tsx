import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, User, Tag, Package, Clock, Shield, ChevronDown, ChevronUp, X } from "lucide-react";
import { fetchAuditLogs } from "../api/audit";
import { AuditEntry } from "../types";

const MODULES = ["auth", "sales", "inventory", "medicines", "expenses", "daily", "customers", "users", "settings"];
const ACTIONS = [
  "USER_LOGIN", "USER_LOGOUT",
  "USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED", "USER_ROLE_CHANGED",
  "MEDICINE_CREATED", "MEDICINE_UPDATED", "MEDICINE_DELETED", "MEDICINE_DISCONTINUED",
  "STOCK_RECEIVED", "STOCK_ADJUSTED",
  "SALE_CREATED", "SALE_HELD", "SALE_VOIDED",
  "SALE_REFUND_REQUESTED", "SALE_REFUND_APPROVED", "SALE_REFUND_REJECTED", "SALE_REFUNDED",
  "EXPENSE_CREATED", "EXPENSE_UPDATED", "EXPENSE_APPROVED", "EXPENSE_REJECTED",
  "DAILY_SESSION_OPENED", "DAILY_SESSION_CLOSED",
  "DAILY_REPORT_SUBMITTED", "DAILY_REPORT_APPROVED", "DAILY_REPORT_REJECTED",
  "SETTINGS_UPDATED",
  "CUSTOMER_CREATED",
  "PRICE_CHANGED",
];
const ENTITIES = ["User", "Medicine", "MedicineBatch", "Sale", "SaleReturn", "Expense", "DailySession", "DailyReport", "Pharmacy", "Customer"];

const actionColors: Record<string, string> = {
  USER_LOGIN: "bg-pine-100 text-pine-700",
  USER_LOGOUT: "bg-sand-200 text-ink-900/60",
  USER_CREATED: "bg-pine-100 text-pine-700",
  USER_UPDATED: "bg-blue-100 text-blue-700",
  USER_DEACTIVATED: "bg-red-100 text-red-700",
  USER_ROLE_CHANGED: "bg-amber-100 text-amber-700",
  MEDICINE_CREATED: "bg-pine-100 text-pine-700",
  MEDICINE_UPDATED: "bg-blue-100 text-blue-700",
  MEDICINE_DELETED: "bg-red-100 text-red-700",
  MEDICINE_DISCONTINUED: "bg-amber-100 text-amber-700",
  SALE_CREATED: "bg-blue-100 text-blue-700",
  SALE_HELD: "bg-amber-100 text-amber-700",
  SALE_VOIDED: "bg-red-100 text-red-700",
  SALE_REFUND_REQUESTED: "bg-amber-100 text-amber-700",
  SALE_REFUND_APPROVED: "bg-pine-100 text-pine-700",
  SALE_REFUND_REJECTED: "bg-red-100 text-red-700",
  SALE_REFUNDED: "bg-red-100 text-red-700",
  STOCK_RECEIVED: "bg-blue-100 text-blue-700",
  STOCK_ADJUSTED: "bg-amber-100 text-amber-700",
  EXPENSE_CREATED: "bg-sand-200 text-ink-900/70",
  EXPENSE_UPDATED: "bg-blue-100 text-blue-700",
  EXPENSE_APPROVED: "bg-pine-100 text-pine-700",
  EXPENSE_REJECTED: "bg-red-100 text-red-700",
  DAILY_SESSION_OPENED: "bg-pine-100 text-pine-700",
  DAILY_SESSION_CLOSED: "bg-sand-200 text-ink-900/60",
  DAILY_REPORT_SUBMITTED: "bg-amber-100 text-amber-700",
  DAILY_REPORT_APPROVED: "bg-pine-100 text-pine-700",
  DAILY_REPORT_REJECTED: "bg-red-100 text-red-700",
  SETTINGS_UPDATED: "bg-purple-100 text-purple-700",
  CUSTOMER_CREATED: "bg-pine-100 text-pine-700",
  PRICE_CHANGED: "bg-amber-100 text-amber-700",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${actionColors[action] ?? "bg-sand-200 text-ink-900/60"}`}>
      {action.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

function ModuleBadge({ module }: { module: string }) {
  const icons: Record<string, React.ReactNode> = {
    auth: <Shield size={10} />,
    sales: <Package size={10} />,
    inventory: <Package size={10} />,
    medicines: <Package size={10} />,
    expenses: <Tag size={10} />,
    daily: <Clock size={10} />,
    users: <User size={10} />,
    settings: <Shield size={10} />,
    customers: <User size={10} />,
  };
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-sand-100 text-ink-900/50 inline-flex items-center gap-1 capitalize">
      {icons[module] ?? null}
      {module}
    </span>
  );
}

function DetailPanel({ log, onClose }: { log: AuditEntry; onClose: () => void }) {
  const hasBefore = log.before !== undefined && log.before !== null && typeof log.before === "object" && Object.keys(log.before as object).length > 0;
  const hasAfter = log.after !== undefined && log.after !== null && typeof log.after === "object" && Object.keys(log.after as object).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-card border border-line-soft max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
          <h3 className="font-bold text-ink-900">Audit Detail</h3>
          <button onClick={onClose} className="text-ink-900/40 hover:text-ink-900"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-ink-900/40 text-xs mb-1">Action</div>
              <ActionBadge action={log.action ?? ""} />
            </div>
            <div>
              <div className="text-ink-900/40 text-xs mb-1">Module</div>
              <ModuleBadge module={log.module ?? ""} />
            </div>
            <div>
              <div className="text-ink-900/40 text-xs mb-1">User</div>
              <div className="text-ink-900">{typeof log.user === "object" ? log.user.name : log.userName}</div>
            </div>
            <div>
              <div className="text-ink-900/40 text-xs mb-1">Entity</div>
              <div className="text-ink-900">{log.entity ?? "N/A"} {log.entityId ? `#${log.entityId.slice(-8)}` : ""}</div>
            </div>
            <div>
              <div className="text-ink-900/40 text-xs mb-1">IP Address</div>
              <div className="text-ink-900">{log.ipAddress ?? "N/A"}</div>
            </div>
            <div>
              <div className="text-ink-900/40 text-xs mb-1">Timestamp</div>
              <div className="text-ink-900">{new Date(log.createdAt).toLocaleString()}</div>
            </div>
          </div>

          <div>
            <div className="text-ink-900/40 text-xs mb-1">Description</div>
            <div className="text-sm text-ink-900 bg-sand-50 rounded-lg p-3">{log.description}</div>
          </div>

          {log.userAgent && (
            <div>
              <div className="text-ink-900/40 text-xs mb-1">User Agent</div>
              <div className="text-xs text-ink-900/60 bg-sand-50 rounded-lg p-3 break-all">{String(log.userAgent)}</div>
            </div>
          )}

          {(hasBefore || hasAfter) && (
            <div className="grid grid-cols-2 gap-4">
              {hasBefore && (
                <div>
                  <div className="text-ink-900/40 text-xs mb-1">Before</div>
                  <pre className="text-xs text-ink-900 bg-red-50 rounded-lg p-3 overflow-x-auto max-h-48">
                    {JSON.stringify(log.before, null, 2) as string}
                  </pre>
                </div>
              )}
              {hasAfter && (
                <div>
                  <div className="text-ink-900/40 text-xs mb-1">After</div>
                  <pre className="text-xs text-ink-900 bg-pine-50 rounded-lg p-3 overflow-x-auto max-h-48">
                    {JSON.stringify(log.after, null, 2) as string}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Audit() {
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditEntry | null>(null);
  const limit = 30;

  const params: Record<string, string | number> = { page, limit };
  if (module) params.module = module;
  if (action) params.action = action;
  if (entity) params.entity = entity;
  if (from) params.from = from;
  if (to) params.to = to;
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", module, action, entity, from, to, search, page],
    queryFn: () => fetchAuditLogs(params as any),
    refetchInterval: 15000,
  });

  const logs = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-900">Audit Logs</h1>
        <span className="text-xs text-ink-900/40">{total} records</span>
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-900/30" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search logs..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
            />
          </div>
          <select
            value={module}
            onChange={(e) => { setModule(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
          >
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select
            value={entity}
            onChange={(e) => { setEntity(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
          >
            <option value="">All entities</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-sand-200 text-sm outline-none focus:border-pine-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        {isLoading && logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-900/40">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-900/40">No audit logs found</div>
        ) : (
          <div className="divide-y divide-sand-100">
            {logs.map((log: AuditEntry) => (
              <button
                key={log._id}
                onClick={() => setSelectedLog(log)}
                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-sand-50 transition text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900">{log.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {log.action && <ActionBadge action={log.action} />}
                    {log.module && <ModuleBadge module={log.module} />}
                    {log.entity && (
                      <span className="text-xs text-ink-900/40">{log.entity}</span>
                    )}
                    {log.user && typeof log.user === "object" && (
                      <span className="text-xs text-ink-900/40">by {log.user.name}</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-ink-900/30 whitespace-nowrap shrink-0">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-sand-200 text-sm disabled:opacity-40 hover:bg-sand-50"
          >
            Previous
          </button>
          <span className="text-sm text-ink-900/60">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-sand-200 text-sm disabled:opacity-40 hover:bg-sand-50"
          >
            Next
          </button>
        </div>
      )}

      {selectedLog && <DetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
