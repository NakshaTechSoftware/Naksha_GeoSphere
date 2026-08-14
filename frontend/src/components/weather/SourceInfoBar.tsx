"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface SourceInfoBarProps {
  windSource?: string;
  weatherSource?: string;
  className?: string;
}

export function SourceInfoBar({ windSource, weatherSource, className }: SourceInfoBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-white/30 bg-white/60 px-3 py-1.5 text-[10px] font-medium text-gray-500 backdrop-blur-md",
        className
      )}
    >
      {windSource && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          Wind: {windSource}
        </span>
      )}
      {weatherSource && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          Weather: {weatherSource}
        </span>
      )}
    </div>
  );
}
