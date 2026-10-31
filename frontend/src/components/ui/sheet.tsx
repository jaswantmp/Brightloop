import React, { createContext, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";

interface SheetContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextType | null>(null);

export function Sheet({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  children,
  render,
  asChild,
}: {
  children?: React.ReactNode;
  render?: React.ReactElement;
  asChild?: boolean;
}) {
  const ctx = useContext(SheetContext);
  if (!ctx) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    ctx.setOpen(true);
  };

  if (render) {
    return React.cloneElement(render, {
      onClick: handleClick,
      children: children ?? render.props.children,
    });
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
    });
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

export function SheetContent({
  children,
  side = "left",
  className = "",
}: {
  children: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
}) {
  const ctx = useContext(SheetContext);
  if (!ctx || !ctx.open) return null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ctx]);

  const sideClasses = {
    left: "inset-y-0 left-0 w-3/4 max-w-sm border-r border-slate-200",
    right: "inset-y-0 right-0 w-3/4 max-w-sm border-l border-slate-200",
    top: "inset-x-0 top-0 border-b border-slate-200",
    bottom: "inset-x-0 bottom-0 border-t border-slate-200",
  }[side];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={() => ctx.setOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed z-50 bg-white shadow-xl transition ease-in-out ${sideClasses} ${className}`.trim()}
      >
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function SheetTitle({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`text-lg font-semibold text-slate-900 ${className}`.trim()}
      {...props}
    />
  );
}

