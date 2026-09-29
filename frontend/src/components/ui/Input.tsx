import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, suffix, className = "", id, ...props },
  ref,
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-gray">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-soft pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`w-full ${suffix ? "pr-10" : ""} px-3 py-2 rounded-control border text-sm outline-none transition
            ${icon ? "pl-9" : ""}
            ${error ? "border-red focus:border-red focus:ring-red/20" : "border-line focus:border-blue-500 focus:ring-blue-500/20"}
            focus:ring-2 bg-white ${className}`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-soft">{suffix}</span>
        )}
      </div>
      {error && <p id={`${inputId}-error`} className="text-xs text-red" role="alert">{error}</p>}
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-gray-soft">{hint}</p>}
    </div>
  );
});

export default Input;
