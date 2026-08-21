import * as React from "react";
import { Input as FluentInput, type InputProps as FluentInputProps } from "@fluentui/react-components";

export interface InputProps {
  id?: string;
  className?: string;
  type?: "text" | "number" | "search" | "email" | "password" | "tel" | "url";
  value?: string | number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  title?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, value, ...props }, ref) => {
  return (
    <FluentInput
      type={type as FluentInputProps["type"]}
      value={value === undefined ? undefined : String(value)}
      className={className}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
