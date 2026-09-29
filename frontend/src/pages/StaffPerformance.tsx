import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, RotateCcw, FileText, Calendar } from "lucide-react";
import { fetchStaffPerformance } from "../api/audit";
import { StaffPerformance as StaffPerformanceRow } from "../types";
import { KpiCard } from "../components/ui";
import { TableSkeleton } from "../components/ui/Skeleton";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PERIODS = [
  { label: "Today", from: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "This week", from: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "This month", from: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "All time", from: () => undefined, to: () => undefined },
];

export default function StaffPerformance() {
  const [period, setPeriod] = useState(2);
  const p = PERIODS[period];

  const { data: performance, isLoading } = useQuery({
    queryKey: ["staff-performance-page", period],
    queryFn: () => fetchStaffPerformance({ from: p.from(), to: p.to() }),
  });

  const totals = React.useMemo(() => {
    if (!performance) return { sales: 0, value: 0, refunds: 0, staff: 0 };
    return {
      sales: performance.reduce((a, r) => a + r.salesCount, 0),
      value: performance.reduce((a, r) => a + r.salesValue, 0),
      refunds: performance.reduce((a, r) => a + r.refundCount, 0),
      staff: performance.length,
    };
  }, [performance]);

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-navy">Staff Performance</h1>
          <p className="text-sm text-gray mt-0.5">Sales, refunds, sessions and reports by staff member</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((pp, i) => (
            <button
              key={pp.label}
              onClick={() => setPeriod(i)}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium transition ${
                period === i ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray border border-line hover:border-line-soft"
              }`}
            >
              {pp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Staff Tracked" value={String(totals.staff)} tone="blue" icon={<Users size={18} />} />
        <KpiCard label="Total Sales" value={String(totals.sales)} tone="green" icon={<TrendingUp size={18} />} />
        <KpiCard label="Sales Value" value={ghs(totals.value)} tone="blue" icon={<Calendar size={18} />} />
        <KpiCard label="Refunds" value={String(totals.refunds)} tone={totals.refunds > 0 ? "red" : "green"} icon={<RotateCcw size={18} />} />
      </div>

      <div className="bg-white rounded-card border border-line-soft shadow-panel overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-medium text-navy">Performance Detail</h2>
          <span className="text-xs text-gray flex items-center gap-1.5">
            <FileText size={13} /> {PERIODS[period].label}
          </span>
        </div>
        <div className="overflow-x-auto">
          {!performance || performance.length === 0 ? (
            <div className="text-sm text-gray-soft text-center py-10">No staff data for this period</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-6 py-3 font-medium text-gray text-xs">Staff</th>
                  <th className="px-6 py-3 font-medium text-gray text-xs text-right">Sales</th>
                  <th className="px-6 py-3 font-medium text-gray text-xs text-right">Value</th>
                  <th className="px-6 py-3 font-medium text-gray text-xs text-right">Refunds</th>
                  <th className="px-6 py-3 font-medium text-gray text-xs text-right">Sessions</th>
                  <th className="px-6 py-3 font-medium text-gray text-xs text-right">Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {performance.map((row: StaffPerformanceRow) => (
                  <tr key={row.user} className="hover:bg-paper transition">
                    <td className="px-6 py-3">
                      <div className="font-medium text-navy">{row.userInfo?.name ?? "Unknown"}</div>
                      <div className="text-xs text-gray-soft capitalize">{row.userInfo?.role?.replace("_", " ")}</div>
                    </td>
                    <td className="px-6 py-3 text-right text-navy">{row.salesCount}</td>
                    <td className="px-6 py-3 text-right text-navy font-medium tabular-nums">{ghs(row.salesValue)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={row.refundCount > 0 ? "text-red" : "text-gray-soft"}>
                        {row.refundCount}{row.refundValue > 0 ? ` (${ghs(row.refundValue)})` : ""}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-navy">{row.sessionsClosed}/{row.sessionsOpened}</td>
                    <td className="px-6 py-3 text-right text-navy">{row.reportsApproved}/{row.reportsSubmitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
