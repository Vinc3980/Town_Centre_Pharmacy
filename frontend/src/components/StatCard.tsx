import React from "react";
import { LucideIcon, AlertTriangle, Clock } from "lucide-react";

type CardVariant = "financial" | "alert" | "summary";

interface FinancialCardProps {
  variant: "financial";
  label: string;
  value: string;
  change?: string;
  changeDirection?: "up" | "down";
  action?: { label: string; onClick: () => void };
}

interface AlertCardProps {
  variant: "alert";
  label: string;
  value: string;
  description: string;
  severity: "warning" | "critical";
  action?: { label: string; onClick: () => void };
}

interface SummaryCardProps {
  variant: "summary";
  label: string;
  value: string;
}

type StatCardProps = FinancialCardProps | AlertCardProps | SummaryCardProps;

function FinancialCard({ label, value, change, changeDirection, action }: Omit<FinancialCardProps, "variant">) {
  return (
    <div className="bg-white rounded-card border border-line-soft p-5 shadow-panel">
      <div className="font-semibold text-2xl text-navy tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-xs text-gray mt-1">{label}</div>
      {change && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-xs font-medium ${changeDirection === "up" ? "text-green" : "text-orange-2"}`}>
            {changeDirection === "up" ? "↑" : "↓"} {change}
          </span>
          <span className="text-xs text-gray-soft">vs last month</span>
        </div>
      )}
      {action && (
        <>
          <div className="border-t border-line mt-4 pt-3" />
          <button
            onClick={action.onClick}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            {action.label} →
          </button>
        </>
      )}
    </div>
  );
}

function AlertCard({ label, value, description, severity, action }: Omit<AlertCardProps, "variant">) {
  const borderColor = severity === "critical" ? "border-l-red" : "border-l-amber";
  const iconColor = severity === "critical" ? "text-red" : "text-amber";
  const Icon = severity === "critical" ? AlertTriangle : Clock;

  return (
    <div className={`bg-white rounded-card border border-line-soft border-l-4 ${borderColor} p-5 shadow-panel`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColor} />
        <span className="text-xs font-medium text-navy uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-semibold text-lg text-navy tabular-nums">
        {value}
      </div>
      <div className="text-xs text-gray mt-1">{description}</div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors mt-3"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: Omit<SummaryCardProps, "variant">) {
  return (
    <div className="bg-white rounded-card border border-line-soft p-5 shadow-panel">
      <div className="font-semibold text-2xl text-navy tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-xs text-gray mt-1">{label}</div>
    </div>
  );
}

export default function StatCard(props: StatCardProps) {
  switch (props.variant) {
    case "financial":
      return <FinancialCard {...props} />;
    case "alert":
      return <AlertCard {...props} />;
    case "summary":
      return <SummaryCard {...props} />;
  }
}
