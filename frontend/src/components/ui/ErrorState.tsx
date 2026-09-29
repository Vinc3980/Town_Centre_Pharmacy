import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-bg flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-red" />
      </div>
      <h3 className="text-sm font-medium text-gray mb-1">{title}</h3>
      <p className="text-xs text-gray-soft max-w-xs mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw size={14} />}>
          Try again
        </Button>
      )}
    </div>
  );
}
