import React from "react";
import { Check } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = "", checked = false, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={`peer h-4 w-4 shrink-0 rounded-sm border border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-slate-900 text-white border-slate-900" : "bg-white"
        } ${className}`.trim()}
        {...(props as any)}
      >
        {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
      </button>
    );
  }
);

Checkbox.displayName = "Checkbox";

