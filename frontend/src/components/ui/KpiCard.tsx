import React from "react";

type Tone = "blue" | "red" | "green" | "gold";

interface KpiCardProps {
  label: string;
  value: string;
  tone?: Tone;
  icon: React.ReactNode;
}

const TONE_GRADIENT: Record<Tone, string> = {
  blue: "from-blue-600 via-blue-600 to-indigo-500",
  green: "from-green to-emerald-600",
  gold: "from-amber to-orange-2",
  red: "from-red to-rose-500",
};

export default function KpiCard({ label, value, tone = "blue", icon }: KpiCardProps) {
  return (
    <div className={`h-full flex flex-col rounded-card p-6 shadow-panel text-white ring-1 ring-white/10 bg-gradient-to-br ${TONE_GRADIENT[tone]}`}>
      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="mt-auto pt-5">
        <div className="text-xs text-white/75 font-medium">{label}</div>
        <div className="font-mono font-bold text-2xl mt-1 tracking-tight text-white">{value}</div>
      </div>
    </div>
  );
}
