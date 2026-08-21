import type { ChangeEvent } from "react";
import { Switch as FluentSwitch, type SwitchOnChangeData } from "@fluentui/react-components";

export interface SwitchProps {
  id?: string;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

function Switch({ checked, onCheckedChange, ...props }: SwitchProps) {
  const handleChange = (_e: ChangeEvent<HTMLInputElement>, data: SwitchOnChangeData) => {
    onCheckedChange?.(data.checked);
  };
  return <FluentSwitch checked={checked} onChange={handleChange} {...props} />;
}

export { Switch };
