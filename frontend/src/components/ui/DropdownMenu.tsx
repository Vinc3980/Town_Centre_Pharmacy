import React, { useEffect, useRef, useState } from "react";

interface DropdownMenuProps {
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  ariaLabel: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}

export default function DropdownMenu({
  triggerContent,
  triggerClassName = "",
  ariaLabel,
  align = "right",
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={`absolute top-full mt-2 z-[200] min-w-[250px] bg-white border border-line-soft shadow-panel rounded-card p-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
