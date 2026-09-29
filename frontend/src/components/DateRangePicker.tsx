import React from "react";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  presets?: boolean;
  className?: string;
}

const PRESETS = [
  { label: "Today", getRange: () => { const d = new Date(); const s = d.toISOString().slice(0, 10); return [s, s]; } },
  { label: "Yesterday", getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0, 10); return [s, s]; } },
  { label: "Last 7 Days", getRange: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 6); return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]; } },
  { label: "Last 30 Days", getRange: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 29); return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]; } },
  { label: "This Month", getRange: () => { const now = new Date(); const s = new Date(now.getFullYear(), now.getMonth(), 1); return [s.toISOString().slice(0, 10), now.toISOString().slice(0, 10)]; } },
  { label: "Last Month", getRange: () => { const now = new Date(); const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]; } },
];

export default function DateRangePicker({ from, to, onChange, presets = true, className = "" }: DateRangePickerProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {presets && (
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => {
            const [s, e] = p.getRange();
            const active = from === s && to === e;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(s, e)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  active ? "bg-blue-100 text-blue-700" : "bg-paper text-gray hover:bg-line"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-soft block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            className="w-full px-2 py-1.5 text-xs border border-line bg-white text-navy"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-soft block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-line bg-white text-navy"
          />
        </div>
      </div>
    </div>
  );
}
