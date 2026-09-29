import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, Receipt, Package, TrendingUp, Users, Truck, ClipboardList,
  Building2, AlertTriangle, CircleDollarSign,
} from "lucide-react";
import { fetchDashboardSummary } from "../api/dashboard";
import { listPurchaseOrders } from "../api/purchaseOrders";
import { fetchCustomers } from "../api/customers";
import { KpiCard } from "../components/ui";
import { CardSkeleton } from "../components/ui/Skeleton";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PERIODS = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

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

export default function BusinessOverview() {
  const [days, setDays] = useState<number>(7);
  const range = rangeFromDays(days);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["overview-summary", days],
    queryFn: () => fetchDashboardSummary({ from: range.from, to: range.to, days }),
    refetchInterval: 30000,
  });
  const { data: purchaseOrders } = useQuery({
    queryKey: ["overview-purchase-orders"],
    queryFn: () => listPurchaseOrders({ page: 1, limit: 1000 }),
  });
  const { data: customers } = useQuery({
    queryKey: ["overview-customers"],
    queryFn: () => fetchCustomers(),
  });

  const suppliers = React.useMemo(() => {
    if (!purchaseOrders?.data) return 0;
    const set = new Set(purchaseOrders.data.map((o) => o.supplier).filter(Boolean));
    return set.size;
  }, [purchaseOrders]);

  const paymentRows = React.useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Cash", value: summary.cashTotal, icon: CircleDollarSign },
      { label: "Mobile Money", value: summary.mobileMoneyTotal, icon: Wallet },
      { label: "Card", value: summary.cardTotal, icon: Receipt },
      { label: "Bank Transfer", value: summary.bankTransferTotal, icon: Building2 },
      { label: "Other", value: summary.otherTotal, icon: Wallet },
    ];
  }, [summary]);

  if (isLoading) return <CardSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-navy">Business Overview</h1>
          <p className="text-sm text-gray mt-0.5">Key metrics across sales, inventory, purchases and customers</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium transition ${
                days === p.days
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray border border-line hover:border-line-soft"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPIs (time-filtered) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={ghs(summary?.totalRevenue ?? 0)} tone="blue" icon={<Wallet size={18} />} />
        <KpiCard label="Net Profit" value={ghs(summary?.netProfit ?? 0)} tone={(summary?.netProfit ?? 0) >= 0 ? "green" : "red"} icon={<TrendingUp size={18} />} />
        <KpiCard label="Total Transactions" value={String(summary?.transactionCount ?? 0)} tone="blue" icon={<Receipt size={18} />} />
        <KpiCard label="Inventory Value" value={ghs(summary?.inventoryValue ?? 0)} tone="gold" icon={<Package size={18} />} />
      </div>

      {/* Secondary counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Suppliers" value={String(suppliers)} tone="blue" icon={<Truck size={18} />} />
        <KpiCard label="Purchase Orders" value={String(purchaseOrders?.pagination?.total ?? 0)} tone="gold" icon={<ClipboardList size={18} />} />
        <KpiCard label="Customers" value={String(customers?.length ?? 0)} tone="green" icon={<Users size={18} />} />
        <KpiCard label="Customer Orders" value={String(summary?.transactionCount ?? 0)} tone="blue" icon={<Receipt size={18} />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Gross Profit" value={ghs(summary?.grossProfit ?? 0)} tone="green" icon={<TrendingUp size={18} />} />
        <KpiCard label="Total Expenses" value={ghs(summary?.totalExpenses ?? 0)} tone="red" icon={<CircleDollarSign size={18} />} />
        <KpiCard label="Active Staff" value={String(summary?.activeStaff ?? 0)} tone="blue" icon={<Users size={18} />} />
        <KpiCard label="Low Stock Items" value={String(summary?.lowStockCount ?? 0)} tone="gold" icon={<AlertTriangle size={18} />} />
      </div>

      {/* Payment breakdown + inventory snapshot */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <h2 className="text-sm font-medium text-navy mb-5">Payment Breakdown</h2>
          <div className="space-y-4">
            {paymentRows.map((row) => {
              const total = summary?.totalRevenue || 1;
              const pct = Math.min(100, Math.round(((row.value as number) / total) * 100));
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray flex items-center gap-2">
                      <row.icon size={14} className="text-gray-soft" strokeWidth={1.5} />
                      {row.label}
                    </span>
                    <span className="text-xs font-medium text-navy tabular-nums">{ghs(row.value as number)}</span>
                  </div>
                  <div className="h-1.5 bg-paper rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
          <h2 className="text-sm font-medium text-navy mb-5">Inventory Snapshot</h2>
          <div className="space-y-4">
            {[
              { label: "Total Medicines", value: summary?.totalMedicines ?? 0, icon: Package },
              { label: "Inventory Value", value: ghs(summary?.inventoryValue ?? 0), icon: Wallet },
              { label: "Low Stock", value: summary?.lowStockCount ?? 0, icon: AlertTriangle },
              { label: "Expiring Soon", value: summary?.expiringSoon ?? 0, icon: AlertTriangle },
              { label: "Expired", value: summary?.expired ?? 0, icon: AlertTriangle },
              { label: "Open Sessions", value: summary?.openSessions ?? 0, icon: Receipt },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-line last:border-0 pb-3 last:pb-0">
                <span className="text-xs text-gray flex items-center gap-2.5">
                  <row.icon size={15} className="text-gray-soft" strokeWidth={1.5} />
                  {row.label}
                </span>
                <span className="text-sm font-semibold text-navy tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
