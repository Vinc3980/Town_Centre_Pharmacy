import React from "react";

const VARIANTS: Record<string, string> = {
  success: "bg-[#EAFBEF] text-green",
  warning: "bg-amber-bg text-amber",
  danger: "bg-red-bg text-red",
  info: "bg-blue-50 text-blue-700",
  sand: "bg-paper text-gray-soft",
  gray: "bg-line text-gray",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export default function Badge({ children, variant = "sand", className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-pill font-medium ${VARIANTS[variant] ?? VARIANTS.sand} ${className}`}>
      {children}
    </span>
  );
}
