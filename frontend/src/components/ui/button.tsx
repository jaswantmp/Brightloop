import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon" | "xs";
  render?: React.ReactElement;
}

const variantClasses: Record<string, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  ghost: "text-slate-700 hover:bg-slate-100",
  link: "text-slate-900 underline-offset-4 hover:underline",
};

const sizeClasses: Record<string, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  xs: "h-7 rounded px-2 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", render, children, ...props }, ref) => {
    const combinedClass = `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`.trim();

    if (render) {
      return React.cloneElement(render, {
        ref,
        className: `${combinedClass} ${render.props.className || ""}`.trim(),
        ...props,
        children: children ?? render.props.children,
      });
    }

    return (
      <button ref={ref} className={combinedClass} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
