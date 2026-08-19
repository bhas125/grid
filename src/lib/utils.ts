import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtPct(n: number, digits = 1) {
  return `${n.toFixed(digits)}%`;
}

export function fmtMargin(n: number) {
  const t = Math.abs(n);
  if (t < 0.05) return "EVEN";
  return n > 0 ? `R+${t.toFixed(0)}` : `D+${t.toFixed(0)}`;
}

export function fmtAge(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 90) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 36 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

export function fmtQuote(value: number, digits: number, suffix?: string) {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${suffix ?? ""}`;
}

export function fmtChange(change: number, digits: number, suffix?: string) {
  const d = digits === 0 ? 0 : 2;
  return `${change > 0 ? "+" : ""}${change.toFixed(d)}${suffix ?? ""}`;
}
