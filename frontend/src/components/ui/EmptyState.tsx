import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-paper flex items-center justify-center mb-4">
        {icon ?? <Inbox size={24} className="text-gray-soft" />}
      </div>
      <h3 className="text-sm font-medium text-gray mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-soft max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
