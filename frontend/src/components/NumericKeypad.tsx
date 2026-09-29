import React from "react";
import { Delete, CornerDownLeft } from "lucide-react";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

export default function NumericKeypad({ value, onChange, onConfirm, onDelete, onClear, className = "" }: NumericKeypadProps) {
  function handleKey(key: string) {
    if (key === "del") {
      onChange(value.slice(0, -1));
      onDelete?.();
    } else if (key === ".") {
      if (!value.includes(".")) {
        onChange(value + ".");
      }
    } else {
      const next = value + key;
      if (/^\d*\.?\d{0,2}$/.test(next)) {
        onChange(next);
      }
    }
  }

  return (
    <div className={`grid grid-cols-3 gap-1.5 ${className}`}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => handleKey(key)}
          className={`h-12 rounded-lg font-medium text-lg transition focus:outline-none focus:ring-2 focus:ring-pine-500/30 ${
            key === "del"
              ? "bg-clay-50 text-clay-700 hover:bg-clay-100"
              : "bg-sand-100 text-ink-900 hover:bg-sand-200"
          }`}
        >
          {key === "del" ? <Delete size={16} className="mx-auto" /> : key}
        </button>
      ))}
      <button
        type="button"
        onClick={() => { onChange(""); onClear?.(); }}
        className="h-12 rounded-lg font-medium text-sm bg-clay-50 text-clay-700 hover:bg-clay-100 transition focus:outline-none focus:ring-2 focus:ring-clay-500/30"
      >
        AC
      </button>
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          className="col-span-2 h-12 rounded-lg font-medium text-sm bg-pine-600 text-white hover:bg-pine-700 transition focus:outline-none focus:ring-2 focus:ring-pine-500/30 flex items-center justify-center gap-1"
        >
          <CornerDownLeft size={14} /> Confirm
        </button>
      )}
    </div>
  );
}
