import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "headerCta";

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
  headerCta:
    "bg-atlas-cobalt text-white hover:bg-[var(--color-cobalt-hover)] active:bg-[#294DB8] focus-visible:ring-[rgba(53,99,233,0.32)] border border-atlas-cobalt hover:border-[var(--color-cobalt-hover)] active:border-[#294DB8]",
};

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
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
