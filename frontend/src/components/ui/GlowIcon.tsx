import React from "react";

type Tone = "blue" | "red" | "green" | "gold";

interface GlowIconProps {
  icon: React.ReactNode;
  size?: number;
  tone?: Tone;
  className?: string;
}

const TONE_CONFIG: Record<Tone, { bg: string; glow: string; text: string }> = {
  blue: { bg: "bg-blue-50", glow: "rgba(46,125,250,0.35)", text: "text-blue-600" },
  red: { bg: "bg-red-bg", glow: "rgba(229,72,77,0.35)", text: "text-red" },
  green: { bg: "bg-[#EAFBEF]", glow: "rgba(34,165,89,0.35)", text: "text-green" },
  gold: { bg: "bg-amber-bg", glow: "rgba(245,165,36,0.35)", text: "text-amber" },
};

export default function GlowIcon({ icon, size = 64, tone = "blue", className = "" }: GlowIconProps) {
  const config = TONE_CONFIG[tone];
  const iconSize = Math.round(size * 0.4);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${config.glow}, transparent 70%)`,
          filter: "blur(10px)",
          transform: "scale(1.4)",
        }}
      />
      {/* Badge */}
      <div
        className={`relative ${config.bg} ${config.text} rounded-full flex items-center justify-center`}
        style={{ width: size, height: size }}
      >
        {icon}
      </div>
    </div>
  );
}
