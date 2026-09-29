import React, { useEffect, useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, Users, AlertTriangle, CircleDot,
  Package, Clock, ArrowDownRight, ArrowUpRight, CreditCard,
  Smartphone, Building2, CircleDollarSign, ShoppingCart,
  RotateCcw, ClipboardList, Activity, FileText, TrendingDown,
  Calendar, ChevronRight, ChevronDown, Eye, PackageCheck, Undo2,
  DollarSign, BarChart3, Receipt,
} from "lucide-react";
import {
  fetchDashboardSummary, fetchRevenueTrend, fetchPaymentBreakdown,
  fetchTopMedicines, fetchSalesByCategory, fetchInventoryAlerts,
  fetchStaffDashboard, syncInventoryAlerts,
} from "../api/dashboard";
import { getSocket } from "../lib/socket";
import { listSales } from "../api/sales";
import { useAuth } from "../context/AuthContext";
import Toast from "../components/ui/Toast";
import { KpiCard } from "../components/ui";
import StatCard from "../components/StatCard";
import StaffPerformancePanel from "../components/StaffPerformancePanel";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface FeedEvent { id: string; text: string; time: string }

const PAYMENT_COLORS: Record<string, string> = {
  cash: "#137056",
  mobile_money: "#3b82f6",
  card: "#8b5cf6",
  bank_transfer: "#f59e0b",
  other: "#6b7280",
};

const CATEGORY_COLORS = ["#F97316", "#137056", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#6366f1"];

const MANAGER_ROLES = ["branch_manager", "admin"];

function rangeFromDays(days: number) {
  const to = new Date();
  const from = new Date();
  if (days <= 1) {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDateRange(days: number) {
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (days <= 1) return fmt(new Date());
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return `${fmt(start)} - ${fmt(end)}`;
}

/* ─── Staff Dashboard ─── */
function StaffDashboardView({ userName, role }: { userName: string; role: string }) {
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-dashboard"],
    queryFn: fetchStaffDashboard,
    refetchInterval: 15000,
  });
  const { data: alerts } = useQuery({ queryKey: ["inventory-alerts"], queryFn: fetchInventoryAlerts });
  const [loginToast, setLoginToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const alertsShownRef = useRef(false);

  useEffect(() => {
    if (!alerts || alertsShownRef.current) return;
    alertsShownRef.current = true;
    syncInventoryAlerts().catch(() => {});
    if (alerts.expired.length > 0) {
      setLoginToast({
        message: `${alerts.expired.length} expired product${alerts.expired.length > 1 ? "s" : ""} in stock — Remove them before your next sale to stay compliant`,
        type: "error",
      });
    } else if (alerts.lowStock.length > 0) {
      setLoginToast({ message: `${alerts.lowStock.length} product(s) below reorder level`, type: "info" });
    }
  }, [alerts]);

  if (isLoading) return <p className="text-sm text-gray-soft">Loading dashboard…</p>;

  return (
    <div className="space-y-4">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-navy">Welcome, <span className="text-blue-600">{userName}</span></h1>
          <p className="text-sm text-gray-soft font-normal mt-1">Here's what's happening with your store today.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray bg-paper px-3 py-1.5 rounded-pill border border-line">
          <Calendar size={14} />
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Today's Sales" value={ghs(staff?.todaySales ?? 0)} tone="blue" icon={<Wallet size={18} />} />
        <KpiCard label="Transactions" value={String(staff?.todayTransactions ?? 0)} tone="blue" icon={<Receipt size={18} />} />
        <KpiCard label="Cash Sales" value={ghs(staff?.todayCashSales ?? 0)} tone="green" icon={<CircleDollarSign size={18} />} />
        <KpiCard label="Pending Refunds" value={String(staff?.pendingRefunds ?? 0)} tone="gold" icon={<RotateCcw size={18} />} />
      </div>

      {/* Session Status */}
      {staff?.currentSession && (
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <h2 className="text-xs text-gray mb-3">Current Session</h2>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-soft">Opening Cash: </span>
              <span className="font-medium">{ghs(staff.currentSession.openingCash)}</span>
            </div>
            <div>
              <span className="text-gray-soft">Status: </span>
              <span className={`font-medium ${staff.currentSession.status === "open" ? "text-green" : "text-gray"}`}>
                {staff.currentSession.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Link to="/pos" className="bg-white rounded-card border border-line-soft p-6 hover:shadow-panel-hover transition-all flex items-center gap-4 shadow-panel">
          <ShoppingCart size={18} className="text-navy" strokeWidth={1.5} />
          <div>
            <div className="text-sm font-medium text-navy">Point of Sale</div>
            <div className="text-xs text-gray">Start selling</div>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray" />
        </Link>
        <Link to="/activity" className="bg-white rounded-card border border-line-soft p-6 hover:shadow-panel-hover transition-all flex items-center gap-4 shadow-panel">
          <ClipboardList size={18} className="text-navy" strokeWidth={1.5} />
          <div>
            <div className="text-sm font-medium text-navy">My Activity</div>
            <div className="text-xs text-gray">View your history</div>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray" />
        </Link>
        <Link to="/daily-session" className="bg-white rounded-card border border-line-soft p-6 hover:shadow-panel-hover transition-all flex items-center gap-4 shadow-panel">
          <Clock size={18} className="text-navy" strokeWidth={1.5} />
          <div>
            <div className="text-sm font-medium text-navy">Daily Session</div>
            <div className="text-xs text-gray">Open or close session</div>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray" />
        </Link>
      </div>

      {/* Inventory Alerts */}
      {["staff"].includes(role) && alerts && (alerts.lowStock.length > 0 || alerts.expiringSoon.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {alerts.lowStock.length > 0 && (
            <StatCard
              variant="alert"
              label="Low Stock"
              value={`${alerts.lowStock.length} products`}
              description="below reorder level"
              severity="warning"
              action={{ label: "View Inventory Alerts", onClick: () => window.location.href = "/inventory-alerts" }}
            />
          )}
          {alerts.expiringSoon.length > 0 && (
            <StatCard
              variant="alert"
              label="Expiring Soon"
              value={`${alerts.expiringSoon.length} batches`}
              description="within 30 days"
              severity="critical"
              action={{ label: "View Inventory Alerts", onClick: () => window.location.href = "/inventory-alerts" }}
            />
          )}
        </div>
      )}
      {loginToast && (
        <Toast message={loginToast.message} type={loginToast.type} onClose={() => setLoginToast(null)} duration={5000} />
      )}
    </div>
  );
}

/* ─── Owner / Manager Dashboard ─── */
function ManagerDashboardView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [days, setDays] = useState(1);
  const [chartPeriod, setChartPeriod] = useState("1D");
  const [topPeriod, setTopPeriod] = useState("Today");
  const [custPeriod, setCustPeriod] = useState("Today");
  const [recentPeriod, setRecentPeriod] = useState("Today");
  const [loginToast, setLoginToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const alertsShownRef = useRef(false);

  const range = rangeFromDays(days);
  const chartDays = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[chartPeriod] ?? 365;
  const periodDays = (p: string) => ({ Today: 1, "7d": 7, "14d": 14, "30d": 30 } as Record<string, number>)[p] ?? 1;
  const topDays = periodDays(topPeriod);
  const recentDays = periodDays(recentPeriod);

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary", days],
    queryFn: () => fetchDashboardSummary({ from: range.from, to: range.to, days }),
    refetchInterval: 15000,
  });
  const { data: trend } = useQuery({
    queryKey: ["revenue-trend", days],
    queryFn: () => fetchRevenueTrend({ days }),
  });
  const { data: chartTrend } = useQuery({
    queryKey: ["revenue-trend-chart", chartDays],
    queryFn: () => fetchRevenueTrend({ days: chartDays }),
  });
  const { data: payments } = useQuery({
    queryKey: ["payment-breakdown", days],
    queryFn: () => fetchPaymentBreakdown({ from: range.from, to: range.to, days }),
  });
  const { data: topMeds } = useQuery({
    queryKey: ["top-medicines", topDays],
    queryFn: () => fetchTopMedicines({ days: topDays, limit: 8 }),
  });
  const { data: categories } = useQuery({
    queryKey: ["sales-by-category", days],
    queryFn: () => fetchSalesByCategory({ from: range.from, to: range.to, days }),
  });
  const { data: alerts } = useQuery({ queryKey: ["inventory-alerts"], queryFn: fetchInventoryAlerts });
  const { data: recentSales } = useQuery({
    queryKey: ["recent-sales-dashboard", recentDays],
    queryFn: () => {
      const r = rangeFromDays(recentDays);
      return listSales({ status: "completed", from: r.from, to: r.to });
    },
    select: (data) => data.slice(0, 8),
  });

  useEffect(() => {
    if (!alerts || alertsShownRef.current) return;
    alertsShownRef.current = true;
    syncInventoryAlerts().catch(() => {});
    if (alerts.expired.length > 0) {
      setLoginToast({
        message: `${alerts.expired.length} expired product${alerts.expired.length > 1 ? "s" : ""} in stock — Remove them before your next sale to stay compliant`,
        type: "error",
      });
    } else if (alerts.lowStock.length > 0) {
      setLoginToast({ message: `${alerts.lowStock.length} product(s) below reorder level`, type: "info" });
    }
  }, [alerts]);

  const pieData = useMemo(() => {
    if (!payments) return [];
    return payments.map((p) => ({ name: p.method.replace("_", " "), value: p.total, count: p.count }));
  }, [payments]);

  const barData = useMemo(() => {
    if (!topMeds) return [];
    return topMeds.map((m) => ({ name: m.name.length > 14 ? m.name.slice(0, 14) + "…" : m.name, quantity: m.totalQuantity, revenue: m.totalRevenue }));
  }, [topMeds]);

  const catBarData = useMemo(() => {
    if (!categories) return [];
    return categories.map((c) => ({ name: c.category, revenue: c.totalRevenue, quantity: c.totalQuantity }));
  }, [categories]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function pushEvent(text: string) {
      setFeed((f) => [{ id: Math.random().toString(36).slice(2), text, time: new Date().toLocaleTimeString() }, ...f].slice(0, 20));
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-trend"] });
    }

    socket.on("sale.created", (s: { cashierName: string; total: number; items: { quantity: number; name: string }[] }) => {
      pushEvent(`${s.cashierName} sold ${s.items.map((i) => `${i.quantity} x ${i.name}`).join(", ")} — ${ghs(s.total)}`);
    });
    socket.on("sale.refunded", (s: { transactionNumber: string; total: number }) => {
      pushEvent(`Refund processed #${s.transactionNumber} — ${ghs(s.total)}`);
    });
    socket.on("stock.low", (n: { message: string }) => pushEvent(n.message));
    socket.on("staff.login", (s: { name: string }) => pushEvent(`${s.name} logged in`));
    socket.on("notification.created", () => queryClient.invalidateQueries({ queryKey: ["inventory-alerts"] }));

    return () => {
      socket.off("sale.created");
      socket.off("sale.refunded");
      socket.off("stock.low");
      socket.off("staff.login");
      socket.off("notification.created");
    };
  }, [queryClient]);

  if (!summary) return <p className="text-sm text-gray-soft">Loading dashboard…</p>;

  return (
    <div className="space-y-4">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-navy">Welcome, <span className="text-blue-600">{user?.name ?? "Admin"}</span></h1>
          <p className="text-sm text-gray-soft font-normal mt-1">You have {summary.transactionCount}+ Orders Today</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray bg-paper px-3 py-1.5 rounded-pill border border-line">
          <Calendar size={14} />
          {formatDateRange(days)}
        </div>
      </div>

      {/* Time Period Selector */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-navy">Overview</div>
        <div className="flex gap-1">
          {([1, 7, 14, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-pill text-xs font-medium transition ${
                days === d
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-paper text-gray hover:bg-line"
              }`}
            >
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Revenue" value={ghs(summary.totalRevenue)} tone="blue" icon={<Wallet size={18} />} />
        <KpiCard label="Net Profit" value={ghs(summary.netProfit)} tone={summary.netProfit >= 0 ? "green" : "red"} icon={<TrendingUp size={18} />} />
        <KpiCard label="Transactions" value={String(summary.transactionCount)} tone="blue" icon={<Receipt size={18} />} />
        <KpiCard label="Inventory Value" value={ghs(summary.inventoryValue)} tone="gold" icon={<Package size={18} />} />
      </div>

      {/* Charts + Overall Information */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Sales & Purchase Chart */}
        <div className="lg:col-span-2 bg-white rounded-card border border-line-soft shadow-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy">Sales & Purchase</h2>
            <div className="flex gap-1">
              {(["1D", "1W", "1M", "3M", "6M", "1Y"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-medium transition ${
                    chartPeriod === p ? "bg-blue-600 text-white" : "text-gray hover:bg-paper"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="text-gray">Sales</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#FF7A45]" />
              <span className="text-gray">Purchase</span>
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartTrend ?? trend ?? []} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7EDF6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8791A0" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8791A0" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v: number) => ghs(v)} />
                <Bar dataKey="revenue" name="Sales" fill="#1C64F2" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="Purchase" fill="#FF7A45" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overall Information */}
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <h2 className="text-sm font-medium text-navy mb-5">Overall Information</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package size={16} className="text-gray" strokeWidth={1.5} />
                <span className="text-xs text-gray">Suppliers</span>
              </div>
              <span className="font-sans font-semibold text-sm text-navy tabular-nums">{summary.lowStockCount}</span>
            </div>
            <div className="border-t border-line" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users size={16} className="text-gray" strokeWidth={1.5} />
                <span className="text-xs text-gray">Customers</span>
              </div>
              <span className="font-sans font-semibold text-sm text-navy tabular-nums">{summary.transactionCount}</span>
            </div>
            <div className="border-t border-line" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ClipboardList size={16} className="text-gray" strokeWidth={1.5} />
                <span className="text-xs text-gray">Orders</span>
              </div>
              <span className="font-sans font-semibold text-sm text-navy tabular-nums">{summary.transactionCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-line">
          <h2 className="text-sm font-medium text-navy">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left px-6 py-3 font-medium text-gray text-xs">Product</th>
                <th className="text-left px-6 py-3 font-medium text-gray text-xs">Staff</th>
                <th className="text-left px-6 py-3 font-medium text-gray text-xs">Payment</th>
                <th className="text-left px-6 py-3 font-medium text-gray text-xs">Time</th>
                <th className="text-right px-6 py-3 font-medium text-gray text-xs">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentSales?.map((sale) => (
                <tr key={sale._id} className="hover:bg-paper transition">
                  <td className="px-6 py-3 text-navy">
                    <div className="font-medium truncate max-w-[200px]">{sale.items[0]?.name ?? "—"}</div>
                    {sale.items.length > 1 && <div className="text-[10px] text-gray">+{sale.items.length - 1} more</div>}
                  </td>
                  <td className="px-6 py-3 text-gray">{typeof sale.cashier === "string" ? sale.cashier : sale.cashier.name}</td>
                  <td className="px-6 py-3">
                    <span className="text-[10px] font-medium capitalize bg-paper border border-line text-gray px-2 py-0.5 rounded-pill whitespace-nowrap">
                      {(sale.paymentMethod ?? "cash").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-soft">{new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-medium text-navy">{ghs(sale.total)}</td>
                </tr>
              ))}
              {(!recentSales || recentSales.length === 0) && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray text-xs">No recent transactions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lower Row: Customers + Top Selling + Low Stock */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Customers Overview */}
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy">Customers Overview</h2>
            <div className="flex gap-1">
              {(["Today", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setCustPeriod(p)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-medium transition ${
                    custPeriod === p ? "bg-blue-600 text-white" : "text-gray hover:bg-paper"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div style={{ width: 100, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "First Time", value: 55, fill: "#F97316" },
                      { name: "Returning", value: 45, fill: "#137056" },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={45}
                    dataKey="value"
                    paddingAngle={3}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="font-sans font-semibold text-lg text-navy tabular-nums">5.5K</div>
                <div className="text-[10px] text-gray">First Time</div>
                <span className="text-[10px] text-green bg-green/10 px-1.5 py-0.5 rounded-full">+25%</span>
              </div>
              <div>
                <div className="font-sans font-semibold text-lg text-navy tabular-nums">3.5K</div>
                <div className="text-[10px] text-gray">Return</div>
                <span className="text-[10px] text-green bg-green/10 px-1.5 py-0.5 rounded-full">+21%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Selling Products — table/list */}
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy">Top Selling Products</h2>
            <div className="flex gap-1">
              {(["Today", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setTopPeriod(p)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-medium transition ${
                    topPeriod === p ? "bg-blue-600 text-white" : "text-gray hover:bg-paper"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            {barData.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-line last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] text-gray w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-xs font-medium text-navy truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] text-gray">{item.quantity} sold</span>
                  <span className="text-xs text-navy tabular-nums font-medium">{ghs(item.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Products — alert card treatment */}
        <div className="bg-amber-bg rounded-card border border-amber/30 border-l-4 border-l-amber p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber" /> Low Stock
            </h2>
            <Link to="/inventory-alerts" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View All</Link>
          </div>
          <div>
            {alerts?.lowStock.slice(0, 5).map((a) => (
              <div key={a.medicineId} className="flex items-center justify-between py-1.5 border-b border-amber/20 last:border-0">
                <span className="text-xs font-medium text-navy truncate">{a.name}</span>
                <span className={`text-xs font-medium flex-shrink-0 ${a.currentStock <= 5 ? "text-red" : "text-amber"}`}>
                  {a.currentStock} in stock
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Sales + Live Activity */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent Sales — table/list */}
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy">Recent Sales</h2>
            <div className="flex gap-1">
              {(["Today", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setRecentPeriod(p)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-medium transition ${
                    recentPeriod === p ? "bg-blue-600 text-white" : "text-gray hover:bg-paper"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            {barData.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] text-gray w-4 text-right flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-navy truncate">{item.name}</div>
                    <div className="text-[10px] text-gray">{ghs(item.revenue)}</div>
                  </div>
                </div>
                <span className="text-[10px] text-green bg-green/10 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Paid</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Activity */}
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-navy">Live Activity</h2>
            <span className="text-xs text-green flex items-center gap-1">
              <CircleDot size={10} className="fill-green text-green" /> live
            </span>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {feed.length === 0 && (
              <div className="text-center py-6">
                <Activity size={20} className="mx-auto text-navy/15 mb-1.5" />
                <p className="text-xs text-gray">Waiting for activity…</p>
              </div>
            )}
            {feed.map((e) => (
              <div key={e.id} className="bg-white rounded-card px-3 py-2 text-xs text-navy/70 border-l-2 border-orange-1">
                <div className="line-clamp-1">{e.text}</div>
                <div className="text-[10px] text-gray mt-0.5">{e.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Performance */}
      <StaffPerformancePanel />

      {loginToast && (
        <Toast message={loginToast.message} type={loginToast.type} onClose={() => setLoginToast(null)} duration={5000} />
      )}
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const { user } = useAuth();

  if (MANAGER_ROLES.includes(user?.role ?? "")) {
    return <ManagerDashboardView />;
  }

  return <StaffDashboardView userName={user?.name ?? ""} role={user?.role ?? ""} />;
}
