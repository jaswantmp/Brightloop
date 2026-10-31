import React, { createContext, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function Dialog({
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
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  render,
  asChild,
}: {
  children?: React.ReactNode;
  render?: React.ReactElement;
  asChild?: boolean;
}) {
  const ctx = useContext(DialogContext);
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

export function DialogContent({
  children,
  className = "",
  "data-testid": testId,
}: {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const ctx = useContext(DialogContext);
  if (!ctx || !ctx.open) return null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ctx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        className="fixed inset-0"
        onClick={() => ctx.setOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        data-testid={testId}
        className={`relative z-10 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg sm:rounded-lg ${className}`.trim()}
      >
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`.trim()}
      {...props}
    />
  );
}

export function DialogFooter({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2 ${className}`.trim()}
      {...props}
    />
  );
}

export function DialogTitle({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-lg font-semibold leading-none tracking-tight text-slate-900 ${className}`.trim()}
      {...props}
    />
  );
}

export function DialogDescription({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-sm text-slate-500 ${className}`.trim()}
      {...props}
    />
  );
}

