import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, Search, ChevronDown, ChevronRight,
  Package, CircleAlert,
} from "lucide-react";
import { fetchInventoryAlerts } from "../api/dashboard";
import { InventoryAlerts as InventoryAlertsType } from "../types";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import { TableSkeleton } from "../components/ui/Skeleton";
import { KpiCard } from "../components/ui";

function SectionHeader({
  title,
  icon: Icon,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  icon: typeof AlertTriangle;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-white rounded-card border border-line-soft shadow-panel hover:shadow-panel-hover transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
    >
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-navy/40" strokeWidth={1.5} />
        <div className="text-left">
          <h2 className="text-sm font-medium text-navy">{title}</h2>
          <p className="text-[11px] text-gray">{count} item{count !== 1 ? "s" : ""}</p>
        </div>
      </div>
      {expanded ? <ChevronDown size={16} className="text-navy/30" /> : <ChevronRight size={16} className="text-navy/30" />}
    </button>
  );
}

function LowStockTable({ items }: { items: InventoryAlertsType["lowStock"] }) {
  if (items.length === 0) {
    return <EmptyState title="No low stock items" description="All products are above reorder level" />;
  }

  return (
    <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Product</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Current</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Reorder</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Min</th>
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => {
              const ratio = item.reorderLevel > 0 ? item.currentStock / item.reorderLevel : 0;
              const status = item.currentStock === 0 ? "Out of Stock" : ratio <= 0.5 ? "Critical" : "Low";
              const badgeVariant = item.currentStock === 0 ? "red" : ratio <= 0.5 ? "red" : "clay";
              return (
                <tr key={item.medicineId} className="hover:bg-paper transition">
                  <td className="px-3 py-2 font-medium text-navy">{item.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70 font-medium">{item.currentStock}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/50">{item.reorderLevel}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/50">{item.minStock}</td>
                  <td className="px-3 py-2">
                    <Badge variant={badgeVariant}>{status}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpiringSoonTable({ items }: { items: InventoryAlertsType["expiringSoon"] }) {
  if (items.length === 0) {
    return <EmptyState title="No expiring items" description="No batches expiring within 30 days" />;
  }

  return (
    <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Product</th>
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Batch</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Qty</th>
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Expiry</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Days Left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => {
              const daysLeft = Math.ceil(item.daysUntilExpiry);
              const badgeVariant = daysLeft <= 7 ? "red" : daysLeft <= 14 ? "clay" : "pine";
              return (
                <tr key={item.batchNumber} className="hover:bg-paper transition">
                  <td className="px-3 py-2 font-medium text-navy">{item.medicine}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray">{item.batchNumber}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{item.quantity}</td>
                  <td className="px-3 py-2 text-navy/70">{new Date(item.expiryDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge variant={badgeVariant}>{daysLeft}d</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpiredTable({ items }: { items: InventoryAlertsType["expired"] }) {
  if (items.length === 0) {
    return <EmptyState title="No expired items" description="No expired batches in inventory" />;
  }

  return (
    <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Product</th>
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Batch</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Qty</th>
              <th className="text-left px-3 py-2 font-medium text-gray text-xs">Expiry</th>
              <th className="text-right px-3 py-2 font-medium text-gray text-xs">Days Expired</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.batchNumber} className="hover:bg-paper transition">
                <td className="px-3 py-2 font-medium text-navy">{item.medicine}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray">{item.batchNumber}</td>
                <td className="px-3 py-2 text-right tabular-nums text-navy/70">{item.quantity}</td>
                <td className="px-3 py-2 text-navy/70">{new Date(item.expiryDate).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <Badge variant="red">{Math.ceil(item.daysExpired)}d</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventoryAlerts() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ lowStock: true, expiringSoon: true, expired: true });

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: fetchInventoryAlerts,
  });

  const filtered = useMemo(() => {
    if (!alerts) return { lowStock: [], expiringSoon: [], expired: [] };
    if (!search.trim()) return alerts;
    const q = search.toLowerCase();
    return {
      lowStock: alerts.lowStock.filter((a) => a.name.toLowerCase().includes(q)),
      expiringSoon: alerts.expiringSoon.filter((a) => a.medicine.toLowerCase().includes(q) || a.batchNumber.toLowerCase().includes(q)),
      expired: alerts.expired.filter((a) => a.medicine.toLowerCase().includes(q) || a.batchNumber.toLowerCase().includes(q)),
    };
  }, [alerts, search]);

  function toggleSection(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) return <TableSkeleton />;

  const totalCount = (alerts?.lowStock.length ?? 0) + (alerts?.expiringSoon.length ?? 0) + (alerts?.expired.length ?? 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-bold text-2xl text-navy">Inventory Alerts</h1>
        <p className="text-sm text-gray">{totalCount} alert{totalCount !== 1 ? "s" : ""} across all categories</p>
      </div>

      {/* Stat cards — gradient KPI treatment with distinct tones */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Low Stock" value={String(alerts?.lowStock.length ?? 0)} tone="gold" icon={<AlertTriangle size={18} />} />
        <KpiCard label="Expiring Soon" value={String(alerts?.expiringSoon.length ?? 0)} tone="blue" icon={<Clock size={18} />} />
        <KpiCard label="Expired" value={String(alerts?.expired.length ?? 0)} tone="red" icon={<CircleAlert size={18} />} />
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
        <input
          type="text"
          placeholder="Search by product or batch name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
        />
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <SectionHeader
            title="Low Stock Alerts"
            icon={AlertTriangle}
            count={filtered.lowStock.length}
            expanded={expanded.lowStock}
            onToggle={() => toggleSection("lowStock")}
          />
          {expanded.lowStock && <LowStockTable items={filtered.lowStock} />}
        </div>

        <div className="space-y-1">
          <SectionHeader
            title="Expiring Soon"
            icon={Clock}
            count={filtered.expiringSoon.length}
            expanded={expanded.expiringSoon}
            onToggle={() => toggleSection("expiringSoon")}
          />
          {expanded.expiringSoon && <ExpiringSoonTable items={filtered.expiringSoon} />}
        </div>

        <div className="space-y-1">
          <SectionHeader
            title="Expired"
            icon={CircleAlert}
            count={filtered.expired.length}
            expanded={expanded.expired}
            onToggle={() => toggleSection("expired")}
          />
          {expanded.expired && <ExpiredTable items={filtered.expired} />}
        </div>
      </div>
    </div>
  );
}
