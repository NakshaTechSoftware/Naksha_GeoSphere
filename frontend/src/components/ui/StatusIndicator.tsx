import { cn } from "@/lib/cn";

export type IndicatorState = "operational" | "degraded" | "unavailable" | "unknown" | "loading";

export interface StatusIndicatorProps {
  state: IndicatorState;
  label?: string;
  className?: string;
}

const stateConfig: Record<IndicatorState, { dot: string; text: string; defaultLabel: string }> = {
  operational: {
    dot: "bg-[var(--color-status-ok)]",
    text: "text-[var(--color-status-ok)]",
    defaultLabel: "Operational",
  },
  degraded: {
    dot: "bg-[var(--color-status-warn)]",
    text: "text-[var(--color-status-warn)]",
    defaultLabel: "Degraded",
  },
  unavailable: {
    dot: "bg-[var(--color-status-error)]",
    text: "text-[var(--color-status-error)]",
    defaultLabel: "Unavailable",
  },
  unknown: {
    dot: "bg-[var(--color-status-unknown)]",
    text: "text-[var(--color-status-unknown)]",
    defaultLabel: "Not monitored",
  },
  loading: {
    dot: "bg-[var(--color-status-unknown)] animate-pulse",
    text: "text-[var(--color-status-unknown)]",
    defaultLabel: "Checking…",
  },
};

export function StatusIndicator({ state, label, className }: StatusIndicatorProps) {
  const { dot, text, defaultLabel } = stateConfig[state];

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", text, className)}>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  );
}
