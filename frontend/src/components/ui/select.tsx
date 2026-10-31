import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectContextType {
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = createContext<SelectContextType | null>(null);

export function Select({
  children,
  value: controlledValue = "",
  onValueChange,
  defaultValue = "",
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
  defaultValue?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = (newVal: string) => {
    setInternalValue(newVal);
    onValueChange?.(newVal);
    setOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <SelectContext.Provider
      value={{ value, onValueChange: handleValueChange, open, setOpen }}
    >
      <div ref={ref} className="relative w-full">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  children,
  className = "",
  size,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  className?: string;
  size?: string;
  "data-testid"?: string;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;

  const sizeClass = size === "sm" ? "h-8 text-xs" : size === "xs" ? "h-7 text-xs" : "h-9 text-sm";

  return (
    <button
      type="button"
      role="combobox"
      aria-expanded={ctx.open}
      data-testid={testId}
      onClick={() => ctx.setOpen(!ctx.open)}
      className={`flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${className}`.trim()}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
    </button>
  );
}

export function SelectValue({
  placeholder,
  children,
}: {
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const ctx = useContext(SelectContext);
  if (children) return <span className="truncate">{children}</span>;
  return <span className="truncate">{ctx?.value || placeholder}</span>;
}

export function SelectContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx || !ctx.open) return null;

  return (
    <div
      role="listbox"
      className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 text-slate-800 shadow-md ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
  disabled = false,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;

  const isSelected = ctx.value === value;

  const handleClick = () => {
    if (disabled) return;
    ctx.onValueChange(value);
  };

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      onClick={handleClick}
      className={`relative flex w-full select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50 text-slate-400"
          : "cursor-pointer hover:bg-slate-100"
      } ${isSelected ? "font-semibold text-slate-900" : "text-slate-700"} ${className}`.trim()}
    >
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4" />
        </span>
      )}
      {children}
    </div>
  );
}
