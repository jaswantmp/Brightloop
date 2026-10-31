import React, { createContext, useContext, useEffect, useRef, useState } from "react";

interface DropdownContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownContext = createContext<DropdownContextType | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  render,
  asChild,
}: {
  children?: React.ReactNode;
  render?: React.ReactElement;
  asChild?: boolean;
}) {
  const ctx = useContext(DropdownContext);
  if (!ctx) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    ctx.setOpen(!ctx.open);
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

export function DropdownMenuContent({
  children,
  align = "start",
  className = "",
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const ctx = useContext(DropdownContext);
  if (!ctx || !ctx.open) return null;

  const alignClass = align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left";

  return (
    <div
      role="menu"
      className={`absolute z-50 mt-2 min-w-[8rem] rounded-md border border-slate-200 bg-white p-1 text-slate-800 shadow-md ${alignClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  className = "",
  "data-testid": testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  "data-testid"?: string;
}) {
  const ctx = useContext(DropdownContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
    ctx?.setOpen(false);
  };

  return (
    <div
      role="menuitem"
      data-testid={testId}
      onClick={handleClick}
      className={`relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-2 py-1.5 text-sm font-semibold text-slate-900 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className = "" }: { className?: string }) {
  return <div className={`-mx-1 my-1 h-px bg-slate-200 ${className}`.trim()} />;
}

