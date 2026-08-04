import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-geo-teal text-cloud-mist hover:bg-[var(--color-teal-hover)] focus-visible:ring-geo-teal",
  secondary:
    "bg-spatial-navy text-cloud-mist hover:bg-[var(--color-navy-surface)] focus-visible:ring-spatial-navy",
  ghost:
    "bg-transparent text-spatial-navy border border-[var(--color-mist-border)] hover:bg-[var(--color-cloud-mist)] focus-visible:ring-geo-teal",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
