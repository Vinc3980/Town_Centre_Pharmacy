import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const COLORS = {
  success: "bg-green text-white",
  error: "bg-red text-white",
  info: "bg-navy text-white",
};

export default function Toast({ message, type = "success", onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const Icon = ICONS[type];

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => { setVisible(false); onClose(); }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-card shadow-lg text-sm max-w-md ${COLORS[type]}`}
    >
      <Icon size={16} />
      <span>{message}</span>
      <button onClick={() => { setVisible(false); onClose(); }} className="ml-2 opacity-70 hover:opacity-100" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
