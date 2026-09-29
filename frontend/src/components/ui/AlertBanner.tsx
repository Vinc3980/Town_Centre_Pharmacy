import React from "react";

type Tone = "red" | "gold";

interface AlertBannerProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  tone?: Tone;
}

const TONE_CONFIG: Record<Tone, { gradient: string; btnText: string }> = {
  red: {
    gradient: "linear-gradient(135deg, #E5484D 0%, #F07070 100%)",
    btnText: "text-red",
  },
  gold: {
    gradient: "linear-gradient(135deg, #F5A524 0%, #FFD080 100%)",
    btnText: "text-amber",
  },
};

export default function AlertBanner({ title, subtitle, icon, actionLabel, onAction, tone = "red" }: AlertBannerProps) {
  const config = TONE_CONFIG[tone];

  return (
    <div
      className="rounded-card px-5 py-4 flex items-center gap-4"
      style={{ background: config.gradient }}
    >
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-white">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold text-sm">{title}</div>
        <div className="text-white/80 text-xs mt-0.5">{subtitle}</div>
      </div>
      <button
        onClick={onAction}
        className={`flex-shrink-0 bg-white rounded-pill px-4 py-2 text-xs font-semibold ${config.btnText} hover:bg-white/90 transition`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
