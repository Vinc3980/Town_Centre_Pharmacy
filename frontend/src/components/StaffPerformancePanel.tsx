import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, RotateCcw, FileText } from "lucide-react";
import { fetchStaffPerformance } from "../api/audit";
import { StaffPerformance } from "../types";

function ghs(n: number) {
  return "GH₵ " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PERIODS = [
  { label: "Today", from: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "This week", from: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "This month", from: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); }, to: () => new Date().toISOString() },
  { label: "All time", from: () => undefined, to: () => undefined },
];

export default function StaffPerformancePanel() {
  const [period, setPeriod] = useState(0);
  const p = PERIODS[period];

  const { data: performance, isLoading } = useQuery({
    queryKey: ["staff-performance", period],
    queryFn: () => fetchStaffPerformance({
      from: p.from(),
      to: p.to(),
    }),
  });

  return (
    <div className="bg-white rounded-card border border-line-soft shadow-panel p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-medium text-gray">Staff performance</h2>
        <div className="flex gap-1">
          {PERIODS.map((pp, i) => (
            <button
              key={pp.label}
              onClick={() => setPeriod(i)}
              className={`px-2 py-1 text-xs rounded transition ${period === i ? "bg-blue-600 text-white" : "text-gray-soft hover:bg-paper"}`}
            >
              {pp.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-soft text-center py-4">Loading...</div>
      ) : !performance || performance.length === 0 ? (
        <div className="text-sm text-gray-soft text-center py-4">No staff data</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-gray-soft text-left">
                <th className="pb-2 font-medium">Staff</th>
                <th className="pb-2 font-medium text-right">Sales</th>
                <th className="pb-2 font-medium text-right">Value</th>
                <th className="pb-2 font-medium text-right">Refunds</th>
                <th className="pb-2 font-medium text-right">Sessions</th>
                <th className="pb-2 font-medium text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((p: StaffPerformance) => (
                <tr key={p.user} className="border-b border-line last:border-0">
                  <td className="py-2">
                    <div className="font-medium text-navy">{p.userInfo?.name ?? "Unknown"}</div>
                    <div className="text-xs text-gray-soft capitalize">{p.userInfo?.role?.replace("_", " ")}</div>
                  </td>
                  <td className="py-2 text-right text-navy">{p.salesCount}</td>
                  <td className="py-2 text-right text-navy font-medium">{ghs(p.salesValue)}</td>
                  <td className="py-2 text-right">
                    <span className={p.refundCount > 0 ? "text-red" : "text-gray-soft"}>
                      {p.refundCount} {p.refundValue > 0 && `(${ghs(p.refundValue)})`}
                    </span>
                  </td>
                  <td className="py-2 text-right text-navy">
                    {p.sessionsClosed}/{p.sessionsOpened}
                  </td>
                  <td className="py-2 text-right text-navy">
                    {p.reportsApproved}/{p.reportsSubmitted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
