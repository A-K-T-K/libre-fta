import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScientific(value: number | undefined, digits = 3): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (value === 0) return "0";
  return value.toExponential(digits).replace("e", " × 10").replace("+", "");
}

export function formatPercent(value: number | undefined, digits = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Truncates to a fixed character budget with an ellipsis — used for labels
 * drawn inside a fixed-size shape (SVG text doesn't wrap or auto-shrink). */
export function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}
