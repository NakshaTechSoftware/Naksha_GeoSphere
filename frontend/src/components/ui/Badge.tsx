import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "navy" | "teal" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneStyles: Record<BadgeTone, string> = {
  navy: "bg-spatial-navy text-cloud-mist",
  teal: "bg-geo-teal text-cloud-mist",
  neutral: "bg-[var(--color-mist-border)] text-spatial-navy",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        toneStyles[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
