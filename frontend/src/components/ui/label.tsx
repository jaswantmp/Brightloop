import React from "react";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`text-xs font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`.trim()}
        {...props}
      >
        {children}
      </label>
    );
  }
);

Label.displayName = "Label";

