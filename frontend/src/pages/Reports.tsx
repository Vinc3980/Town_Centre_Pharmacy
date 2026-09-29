import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download, FileText, FileSpreadsheet, Filter,
  ChevronLeft, ChevronRight, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  fetchSalesReport, fetchInventoryReport, fetchExpenseReport,
  fetchProfitReport, fetchStaffReport, fetchStockMovementReport,
  fetchExpiryReport, fetchLowStockReport, fetchDailyReport,
  fetchPurchaseReport, fetchInsuranceReport, getExportUrl,
  fetchControlledReport,
} from "../api/reports";
import type { ReportFilters } from "../api/reports";
import { updateClaimStatus } from "../api/sales";
import { getSocket } from "../lib/socket";
import { useAuth } from "../context/AuthContext";
import DateRangePicker from "../components/DateRangePicker";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Tab { key: string; label: string; icon?: string }

const TABS: Tab[] = [
  { key: "sales", label: "Sales" },
  { key: "insurance", label: "Insurance Claims" },
  { key: "controlled", label: "Controlled Drugs" },
  { key: "inventory", label: "Inventory" },
  { key: "profit", label: "Profit" },
  { key: "expenses", label: "Expenses" },
  { key: "staff", label: "Staff" },
  { key: "stock-movements", label: "Stock Movements" },
  { key: "expiry", label: "Expiry" },
  { key: "low-stock", label: "Low Stock" },
  { key: "daily", label: "Daily Reports" },
  { key: "purchases", label: "Purchases" },
];

function ExportButtons({ reportType, filters }: { reportType: string; filters: ReportFilters }) {
  const base = "";
  const csvUrl = `${base}${getExportUrl(reportType, filters, "csv")}`;
  const xlsxUrl = `${base}${getExportUrl(reportType, filters, "xlsx")}`;
  const pdfUrl = `${base}${getExportUrl(reportType, filters, "pdf")}`;

  const download = async (url: string) => {
    const token = localStorage.getItem("accessToken");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = url.split("/").pop() || "report";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex gap-2">
      <button onClick={() => download(csvUrl)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sand-100 text-ink-900/60 rounded-lg hover:bg-sand-200 transition">
        <FileText size={14} /> CSV
      </button>
      <button onClick={() => download(xlsxUrl)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sand-100 text-ink-900/60 rounded-lg hover:bg-sand-200 transition">
        <FileSpreadsheet size={14} /> Excel
      </button>
      <button onClick={() => download(pdfUrl)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sand-100 text-ink-900/60 rounded-lg hover:bg-sand-200 transition">
        <Download size={14} /> PDF
      </button>
    </div>
  );
}

function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-sand-100">
      <span className="text-xs text-ink-900/40">{total} total records</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="p-1 rounded disabled:opacity-30 text-ink-900/50 hover:bg-sand-100"><ChevronLeft size={14} /></button>
        <span className="text-xs text-ink-900/60 px-2">{page} / {pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages} className="p-1 rounded disabled:opacity-30 text-ink-900/50 hover:bg-sand-100"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

const CHART_COLORS = ["#166534", "#f97316", "#3b82f6", "#8b5cf6", "#ef4444"];

type ChartType = "bar" | "line" | "pie";

function getChartConfig(tab: string, rows: Record<string, unknown>[]): { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string } | null {
  if (!rows || rows.length === 0) return null;
  switch (tab) {
    case "sales":
      return { data: rows.slice(0, 20).map((r) => ({ name: String(r.transactionNumber ?? ""), value: Number(r.total ?? 0) })), xKey: "name", yKey: "value", label: "Sales by Transaction" };
    case "inventory":
      return { data: rows.slice(0, 10).map((r) => ({ name: String(r.medicine ?? ""), value: Number(r.stockValue ?? 0) })), xKey: "name", yKey: "value", label: "Stock Value by Product" };
    case "profit":
      return { data: rows.map((r) => ({ name: String(r.date ?? ""), revenue: Number(r.revenue ?? 0), cost: Number(r.cost ?? 0), profit: Number(r.netProfit ?? 0) })), xKey: "name", yKey: "profit", label: "Profit Trend" };
    case "expenses":
      return { data: Object.entries(rows.reduce((acc: Record<string, number>, r) => { const cat = String(r.category ?? "Other"); acc[cat] = (acc[cat] ?? 0) + Number(r.amount ?? 0); return acc; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), xKey: "name", yKey: "value", label: "Expenses by Category" };
    case "staff":
      return { data: rows.map((r) => ({ name: String((r as Record<string, unknown>).staff ?? ""), value: Number(r.totalSales ?? 0) })).sort((a, b) => b.value - a.value), xKey: "name", yKey: "value", label: "Sales by Staff" };
    case "daily":
      return { data: rows.map((r) => ({ name: r.date ? new Date(String(r.date)).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "", value: Number(r.totalSales ?? 0) })), xKey: "name", yKey: "value", label: "Daily Sales" };
    case "low-stock":
      return { data: rows.slice(0, 10).map((r) => ({ name: String(r.name ?? ""), value: Number((r as Record<string, unknown>).currentStock ?? 0) })), xKey: "name", yKey: "value", label: "Low Stock Products" };
    case "expiry":
      return { data: rows.slice(0, 10).map((r) => ({ name: String((r as Record<string, unknown>).medicine ?? ""), value: Number(r.quantity ?? 0) })), xKey: "name", yKey: "value", label: "Expiring Products" };
    case "stock-movements":
      return { data: rows.slice(0, 15).map((r) => ({ name: String((r as Record<string, unknown>).medicine ?? ""), value: Math.abs(Number(r.quantityChange ?? 0)) })), xKey: "name", yKey: "value", label: "Stock Movements" };
    case "purchases":
      return { data: rows.slice(0, 10).map((r) => ({ name: String((r as Record<string, unknown>).medicine ?? ""), value: Number(r.quantity ?? 0) })), xKey: "name", yKey: "value", label: "Purchases by Product" };
    default:
      return null;
  }
}

function ReportChart({ tab, rows }: { tab: string; rows: Record<string, unknown>[] }) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const config = useMemo(() => getChartConfig(tab, rows), [tab, rows]);

  if (!config || config.data.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-sand-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-ink-900">{config.label}</h3>
        <div className="flex items-center gap-1 bg-sand-50 rounded-lg p-0.5">
          <button
            onClick={() => setChartType("bar")}
            className={`p-1.5 rounded-md transition ${chartType === "bar" ? "bg-white shadow-sm text-pine-700" : "text-ink-900/40 hover:text-ink-900/60"}`}
            title="Bar Chart"
          >
            <BarChart3 size={14} />
          </button>
          <button
            onClick={() => setChartType("line")}
            className={`p-1.5 rounded-md transition ${chartType === "line" ? "bg-white shadow-sm text-pine-700" : "text-ink-900/40 hover:text-ink-900/60"}`}
            title="Line Chart"
          >
            <LineChartIcon size={14} />
          </button>
          <button
            onClick={() => setChartType("pie")}
            className={`p-1.5 rounded-md transition ${chartType === "pie" ? "bg-white shadow-sm text-pine-700" : "text-ink-900/40 hover:text-ink-900/60"}`}
            title="Pie Chart"
          >
            <PieChartIcon size={14} />
          </button>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={config.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d8" />
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10, fill: "#6b7280" }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(value: number) => [typeof value === "number" && value >= 100 ? `GH₵ ${value.toLocaleString()}` : value, config.label]} />
              <Bar dataKey={config.yKey} fill="#166534" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : chartType === "line" ? (
            <LineChart data={config.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d8" />
              <XAxis dataKey={config.xKey} tick={{ fontSize: 10, fill: "#6b7280" }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(value: number) => [typeof value === "number" && value >= 100 ? `GH₵ ${value.toLocaleString()}` : value, config.label]} />
              <Line type="monotone" dataKey={config.yKey} stroke="#166534" strokeWidth={2} dot={{ fill: "#166534", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={config.data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey={config.yKey}
                nameKey={config.xKey}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {config.data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [typeof value === "number" && value >= 100 ? `GH₵ ${value.toLocaleString()}` : value, config.label]} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryCards({ summary }: { summary: Record<string, unknown> }) {
  if (!summary) return null;
  const entries = Object.entries(summary).filter(([k]) => !k.startsWith("_") && typeof summary[k] === "number");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {entries.map(([key, val]) => (
        <div key={key} className="bg-sand-50 rounded-lg p-3 border border-sand-100">
          <div className="text-xs text-ink-900/45 capitalize">{key.replace(/([A-Z])/g, " $1")}</div>
          <div className="text-lg font-bold tracking-tight text-ink-900">
            {typeof val === "number" ? (key.toLowerCase().includes("count") || key.toLowerCase().includes("number") || key.toLowerCase().includes("transactions") || key.toLowerCase().includes("sessions") || key.toLowerCase().includes("reports") || key.toLowerCase().includes("units") || key.toLowerCase().includes("batches") ? String(val) : ghs(val)) : String(val)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState("sales");
  const [filters, setFilters] = useState<ReportFilters>({ page: 1, limit: 50 });
  const [showFilters, setShowFilters] = useState(true);

  const updateFilter = (key: keyof ReportFilters, val: string | number | undefined) => {
    setFilters((f) => ({ ...f, [key]: val || undefined, page: 1 }));
  };

  const setPage = (p: number) => setFilters((f) => ({ ...f, page: p }));

  const queryClient = useQueryClient();
  const [claimError, setClaimError] = useState("");
  const canSubmitClaim = hasPermission("process_sales");
  const canReviewClaim = hasPermission("process_refunds");

  const handleClaimAction = async (id: string, claimStatus: "submitted" | "approved" | "rejected") => {
    setClaimError("");
    try {
      await updateClaimStatus(id, claimStatus);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      setClaimError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Couldn't update claim status."
      );
    }
  };

  const filterKey = JSON.stringify(filters);
  const queries: Record<string, { queryKey: string[]; queryFn: () => Promise<unknown> }> = {
    sales: { queryKey: ["reports", "sales", filterKey], queryFn: () => fetchSalesReport(filters) },
    insurance: { queryKey: ["reports", "insurance", filterKey], queryFn: () => fetchInsuranceReport(filters) },
    controlled: { queryKey: ["reports", "controlled", filterKey], queryFn: () => fetchControlledReport(filters) },
    inventory: { queryKey: ["reports", "inventory", filterKey], queryFn: () => fetchInventoryReport(filters) },
    profit: { queryKey: ["reports", "profit", filterKey], queryFn: () => fetchProfitReport(filters) },
    expenses: { queryKey: ["reports", "expenses", filterKey], queryFn: () => fetchExpenseReport(filters) },
    staff: { queryKey: ["reports", "staff", filterKey], queryFn: () => fetchStaffReport(filters) },
    "stock-movements": { queryKey: ["reports", "stock-movements", filterKey], queryFn: () => fetchStockMovementReport(filters) },
    expiry: { queryKey: ["reports", "expiry", filterKey], queryFn: () => fetchExpiryReport(filters) },
    "low-stock": { queryKey: ["reports", "low-stock", filterKey], queryFn: () => fetchLowStockReport(filters) },
    daily: { queryKey: ["reports", "daily", filterKey], queryFn: () => fetchDailyReport(filters) },
    purchases: { queryKey: ["reports", "purchases", filterKey], queryFn: () => fetchPurchaseReport(filters) },
  };

  const { data, isLoading } = useQuery(queries[tab] ?? { queryKey: ["noop"], queryFn: async () => null });

  const reportData = useMemo(() => {
    if (!data) return { rows: [] as Record<string, unknown>[], summary: null as Record<string, unknown> | null, total: 0 };
    const d = data as Record<string, unknown>;
    return {
      rows: ((d.data as Record<string, unknown>[]) ?? []),
      summary: (d.summary as Record<string, unknown>) ?? null,
      total: ((d.pagination as { total?: number })?.total ?? 0) as number,
    };
  }, [data]);

  if (!hasPermission("view_reports")) {
    return <p className="text-sm text-ink-900/40">You don't have permission to view reports.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-ink-900">Reports</h1>
          <p className="text-sm text-ink-900/45">Generate, view, and export pharmacy reports.</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-sand-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setFilters((f) => ({ ...f, page: 1 })); }}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg transition ${tab === t.key ? "bg-white border border-sand-200 border-b-white text-pine-700 -mb-px" : "text-ink-900/40 hover:text-ink-900/60 hover:bg-sand-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-sand-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 text-xs text-ink-900/50 hover:text-ink-900/70">
            <Filter size={14} /> Filters {showFilters ? "▲" : "▼"}
          </button>
          <ExportButtons reportType={tab} filters={filters} />
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="col-span-2">
              <DateRangePicker
                from={filters.from ?? ""}
                to={filters.to ?? ""}
                onChange={(f, t) => { updateFilter("from", f); updateFilter("to", t); }}
              />
            </div>
            {tab !== "low-stock" && tab !== "expiry" && tab !== "insurance" && tab !== "controlled" && (
              <div>
                <label className="text-xs text-ink-900/40 block mb-1">Payment Method</label>
                <select value={filters.paymentMethod ?? ""} onChange={(e) => updateFilter("paymentMethod", e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-sand-200 rounded-lg bg-white text-ink-900">
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
            )}
            {tab === "sales" && (
              <div>
                <label className="text-xs text-ink-900/40 block mb-1">Status</label>
                <select value={filters.status ?? ""} onChange={(e) => updateFilter("status", e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-sand-200 rounded-lg bg-white text-ink-900">
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="partially_refunded">Partially Refunded</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            )}
            {tab === "expiry" && (
              <div>
                <label className="text-xs text-ink-900/40 block mb-1">Expiry Days</label>
                <select value={String(filters.expiryDays ?? 90)} onChange={(e) => updateFilter("expiryDays", Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs border border-sand-200 rounded-lg bg-white text-ink-900">
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-ink-900/40 block mb-1">Per Page</label>
              <select value={String(filters.limit ?? 50)} onChange={(e) => updateFilter("limit", Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs border border-sand-200 rounded-lg bg-white text-ink-900">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      {!isLoading && reportData.rows.length > 0 && (
        <ReportChart tab={tab} rows={reportData.rows} />
      )}

      {/* Summary */}
      {reportData.summary && <SummaryCards summary={reportData.summary} />}

      {tab === "insurance" && claimError && (
        <div className="px-3 py-2 rounded-lg bg-red-bg border border-red/30 text-red text-xs">{claimError}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-sand-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-ink-900/40">Loading report…</div>
        ) : reportData.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-900/35">No data for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-ink-900/50 text-left bg-sand-50">
                  {tab === "sales" && (
                    <>
                      <th className="p-3 font-medium">Transaction</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Cashier</th>
                      <th className="p-3 font-medium text-right">Items</th>
                      <th className="p-3 font-medium text-right">Subtotal</th>
                      <th className="p-3 font-medium text-right">Discount</th>
                      <th className="p-3 font-medium text-right">Tax</th>
                      <th className="p-3 font-medium text-right">Total</th>
                      <th className="p-3 font-medium">Payment</th>
                      <th className="p-3 font-medium">Status</th>
                    </>
                  )}
                  {tab === "insurance" && (
                    <>
                      <th className="p-3 font-medium">Transaction</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Customer</th>
                      <th className="p-3 font-medium">Provider</th>
                      <th className="p-3 font-medium">Policy/NHIS #</th>
                      <th className="p-3 font-medium text-right">Total</th>
                      <th className="p-3 font-medium">Claim Status</th>
                      <th className="p-3 font-medium">Cashier</th>
                      <th className="p-3 font-medium">Actions</th>
                    </>
                  )}
                  {tab === "controlled" && (
                    <>
                      <th className="p-3 font-medium">Transaction</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Medicines</th>
                      <th className="p-3 font-medium text-right">Qty</th>
                      <th className="p-3 font-medium">Class</th>
                      <th className="p-3 font-medium">Prescription #</th>
                      <th className="p-3 font-medium">Dispensed By</th>
                      <th className="p-3 font-medium">Cashier</th>
                      <th className="p-3 font-medium text-right">Total</th>
                    </>
                  )}
                  {tab === "inventory" && (
                    <>
                      <th className="p-3 font-medium">Product</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium">Batch #</th>
                      <th className="p-3 font-medium text-right">Qty</th>
                      <th className="p-3 font-medium text-right">Cost Price</th>
                      <th className="p-3 font-medium text-right">Sell Price</th>
                      <th className="p-3 font-medium">Expiry</th>
                      <th className="p-3 font-medium text-right">Stock Value</th>
                    </>
                  )}
                  {tab === "profit" && (
                    <>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium text-right">Revenue</th>
                      <th className="p-3 font-medium text-right">Cost</th>
                      <th className="p-3 font-medium text-right">Gross Profit</th>
                      <th className="p-3 font-medium text-right">Expenses</th>
                      <th className="p-3 font-medium text-right">Net Profit</th>
                      <th className="p-3 font-medium text-right">Transactions</th>
                    </>
                  )}
                  {tab === "expenses" && (
                    <>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium">Description</th>
                      <th className="p-3 font-medium text-right">Amount</th>
                      <th className="p-3 font-medium">Payment</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Recorded By</th>
                    </>
                  )}
                  {tab === "staff" && (
                    <>
                      <th className="p-3 font-medium">Staff</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium text-right">Sales</th>
                      <th className="p-3 font-medium text-right">Profit</th>
                      <th className="p-3 font-medium text-right">Transactions</th>
                      <th className="p-3 font-medium text-right">Sessions</th>
                      <th className="p-3 font-medium text-right">Reports</th>
                    </>
                  )}
                  {tab === "stock-movements" && (
                    <>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Product</th>
                      <th className="p-3 font-medium">Type</th>
                      <th className="p-3 font-medium text-right">Qty Change</th>
                      <th className="p-3 font-medium">Reason</th>
                      <th className="p-3 font-medium">Performed By</th>
                    </>
                  )}
                  {tab === "expiry" && (
                    <>
                      <th className="p-3 font-medium">Product</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium">Batch #</th>
                      <th className="p-3 font-medium text-right">Qty</th>
                      <th className="p-3 font-medium">Expiry</th>
                      <th className="p-3 font-medium text-right">Stock Value</th>
                      <th className="p-3 font-medium">Status</th>
                    </>
                  )}
                  {tab === "low-stock" && (
                    <>
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">SKU</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium text-right">Current</th>
                      <th className="p-3 font-medium text-right">Reorder Lvl</th>
                      <th className="p-3 font-medium text-right">Min Stock</th>
                      <th className="p-3 font-medium text-right">Stock Value</th>
                      <th className="p-3 font-medium">Status</th>
                    </>
                  )}
                  {tab === "daily" && (
                    <>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Staff</th>
                      <th className="p-3 font-medium text-right">Total Sales</th>
                      <th className="p-3 font-medium text-right">Cash</th>
                      <th className="p-3 font-medium text-right">Mobile</th>
                      <th className="p-3 font-medium text-right">Refunds</th>
                      <th className="p-3 font-medium text-right">Expenses</th>
                      <th className="p-3 font-medium text-right">Expected</th>
                      <th className="p-3 font-medium text-right">Actual</th>
                      <th className="p-3 font-medium text-right">Variance</th>
                      <th className="p-3 font-medium">Status</th>
                    </>
                  )}
                  {tab === "purchases" && (
                    <>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Product</th>
                      <th className="p-3 font-medium text-right">Qty Received</th>
                      <th className="p-3 font-medium">Reason</th>
                      <th className="p-3 font-medium">Received By</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(reportData.rows as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/50 transition">
                    {tab === "sales" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String(row.transactionNumber)}</td>
                        <td className="p-3 text-ink-900/60">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-ink-900/60">{String(row.cashier ?? "")}</td>
                        <td className="p-3 text-right text-ink-900">{String(Array.isArray(row.items) ? row.items.length : 0)}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.subtotal ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.discount ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.tax ?? 0))}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.total ?? 0))}</td>
                        <td className="p-3 text-ink-900/60 capitalize">{String(row.paymentMethod ?? "").replace("_", " ")}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === "completed" ? "bg-pine-100 text-pine-700" : row.status === "refunded" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                      </>
                    )}
                    {tab === "insurance" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String(row.transactionNumber)}</td>
                        <td className="p-3 text-ink-900/60">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-ink-900/60">
                          {String(row.customer ?? "")}
                          {row.phone ? <span className="text-ink-900/40"> · {String(row.phone)}</span> : null}
                        </td>
                        <td className="p-3 text-ink-900/60">{String(row.insuranceProvider ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.policyOrNhisNumber ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.total ?? 0))}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${row.claimStatus === "approved" ? "bg-green text-white" : row.claimStatus === "rejected" ? "bg-red-bg text-red" : row.claimStatus === "submitted" ? "bg-blue-100 text-blue-700" : "bg-amber-bg text-amber"}`}>
                            {String(row.claimStatus)}
                          </span>
                        </td>
                        <td className="p-3 text-ink-900/60">{String(row.cashier ?? "")}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.claimStatus === "pending" && canSubmitClaim && (
                              <button
                                onClick={() => handleClaimAction(String(row._id), "submitted")}
                                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                              >
                                Submit
                              </button>
                            )}
                            {(row.claimStatus === "pending" || row.claimStatus === "submitted") && canReviewClaim && (
                              <>
                                <button
                                  onClick={() => handleClaimAction(String(row._id), "approved")}
                                  className="px-2 py-1 rounded-lg text-[11px] font-medium bg-green/15 text-green hover:bg-green hover:text-white transition focus:outline-none focus:ring-2 focus:ring-green/30"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleClaimAction(String(row._id), "rejected")}
                                  className="px-2 py-1 rounded-lg text-[11px] font-medium bg-red-bg text-red hover:bg-red hover:text-white transition focus:outline-none focus:ring-2 focus:ring-red/30"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                    {tab === "controlled" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String(row.transactionNumber)}</td>
                        <td className="p-3 text-ink-900/60">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-ink-900/60">{String(row.medicines ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{String(row.quantity ?? 0)}</td>
                        <td className="p-3 text-ink-900/60">{String(row.controlledSubstanceClass ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.prescriptionReference ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.dispensedBy ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.cashier ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.total ?? 0))}</td>
                      </>
                    )}
                    {tab === "inventory" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String(row.medicine ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.category ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.batchNumber ?? "")}</td>
                        <td className="p-3 text-right text-ink-900">{String(row.quantity ?? 0)}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.purchasePrice ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.sellingPrice ?? 0))}</td>
                        <td className="p-3 text-ink-900/60">{row.expiryDate ? new Date(String(row.expiryDate)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.stockValue ?? 0))}</td>
                      </>
                    )}
                    {tab === "profit" && (
                      <>
                        <td className="p-3 text-ink-900">{String((row as Record<string, unknown>).date ?? "")}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.revenue ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.cost ?? 0))}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.grossProfit ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.expenses ?? 0))}</td>
                        <td className={`p-3 text-right font-medium ${Number(row.netProfit ?? 0) >= 0 ? "text-pine-700" : "text-red-600"}`}>{ghs(Number(row.netProfit ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{String(row.transactions ?? 0)}</td>
                      </>
                    )}
                    {tab === "expenses" && (
                      <>
                        <td className="p-3 text-ink-900">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-ink-900/60 capitalize">{String(row.category ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.description ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.amount ?? 0))}</td>
                        <td className="p-3 text-ink-900/60 capitalize">{String(row.paymentMethod ?? "").replace("_", " ")}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === "approved" ? "bg-pine-100 text-pine-700" : row.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                        <td className="p-3 text-ink-900/60">{String(row.recordedBy ?? "")}</td>
                      </>
                    )}
                    {tab === "staff" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String((row as Record<string, unknown>).staff ?? "")}</td>
                        <td className="p-3 text-ink-900/60 capitalize">{String((row as Record<string, unknown>).role ?? "").replace("_", " ")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.totalSales ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.profit ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{String(row.transactions ?? 0)}</td>
                        <td className="p-3 text-right text-ink-900">{String((row as Record<string, unknown>).sessionsClosed ?? 0)}/{String((row as Record<string, unknown>).sessionsOpened ?? 0)}</td>
                        <td className="p-3 text-right text-ink-900">{String((row as Record<string, unknown>).reportsApproved ?? 0)}/{String((row as Record<string, unknown>).reportsSubmitted ?? 0)}</td>
                      </>
                    )}
                    {tab === "stock-movements" && (
                      <>
                        <td className="p-3 text-ink-900">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 font-medium text-ink-900">{String((row as Record<string, unknown>).medicine ?? "")}</td>
                        <td className="p-3 text-ink-900/60 capitalize">{String(row.type ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{String(row.quantityChange ?? 0)}</td>
                        <td className="p-3 text-ink-900/60">{String(row.reason ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String((row as Record<string, unknown>).performedBy ?? "")}</td>
                      </>
                    )}
            {tab === "insurance" && (
              <div>
                <label className="text-xs text-ink-900/40 block mb-1">Claim Status</label>
                <select value={filters.claimStatus ?? ""} onChange={(e) => updateFilter("claimStatus", e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-sand-200 rounded-lg bg-white text-ink-900">
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            )}
            {tab === "expiry" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String((row as Record<string, unknown>).medicine ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.category ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.batchNumber ?? "")}</td>
                        <td className="p-3 text-right text-ink-900">{String(row.quantity ?? 0)}</td>
                        <td className="p-3 text-ink-900/60">{row.expiryDate ? new Date(String(row.expiryDate)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.stockValue ?? 0))}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === "EXPIRED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                      </>
                    )}
                    {tab === "low-stock" && (
                      <>
                        <td className="p-3 font-medium text-ink-900">{String(row.name ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.sku ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String(row.category ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{String((row as Record<string, unknown>).currentStock ?? 0)}</td>
                        <td className="p-3 text-right text-ink-900/60">{String(row.reorderLevel ?? 0)}</td>
                        <td className="p-3 text-right text-ink-900/60">{String(row.minStock ?? 0)}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.stockValue ?? 0))}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                      </>
                    )}
                    {tab === "daily" && (
                      <>
                        <td className="p-3 text-ink-900">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 text-ink-900/60">{String((row as Record<string, unknown>).staff ?? "")}</td>
                        <td className="p-3 text-right font-medium text-ink-900">{ghs(Number(row.totalSales ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.cashSales ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.mobileMoneySales ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.refunds ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900/60">{ghs(Number(row.expenses ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.expectedCash ?? 0))}</td>
                        <td className="p-3 text-right text-ink-900">{ghs(Number(row.actualCash ?? 0))}</td>
                        <td className={`p-3 text-right font-medium ${Number(row.variance ?? 0) === 0 ? "text-pine-700" : "text-red-600"}`}>{ghs(Number(row.variance ?? 0))}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.status === "approved" ? "bg-pine-100 text-pine-700" : row.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-sand-100 text-ink-600"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                      </>
                    )}
                    {tab === "purchases" && (
                      <>
                        <td className="p-3 text-ink-900">{row.date ? new Date(String(row.date)).toLocaleDateString("en-GB") : ""}</td>
                        <td className="p-3 font-medium text-ink-900">{String((row as Record<string, unknown>).medicine ?? "")}</td>
                        <td className="p-3 text-right text-ink-900">{String(row.quantity ?? 0)}</td>
                        <td className="p-3 text-ink-900/60">{String(row.reason ?? "")}</td>
                        <td className="p-3 text-ink-900/60">{String((row as Record<string, unknown>).receivedBy ?? "")}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reportData.total > 0 && (
          <div className="px-4 pb-3">
            <Pagination page={filters.page ?? 1} total={reportData.total} limit={filters.limit ?? 50} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
