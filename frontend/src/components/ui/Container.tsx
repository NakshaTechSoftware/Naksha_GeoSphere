import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Container({ className, children, ...rest }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-6 lg:px-8", className)} {...rest}>
      {children}
    </div>
  );
}
