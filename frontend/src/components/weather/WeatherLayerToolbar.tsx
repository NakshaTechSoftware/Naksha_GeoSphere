"use client";

import React from "react";
import { cn } from "@/lib/cn";
import {
  ThermometerIcon,
  CloudRainIcon,
  WindIcon,
  CloudyIcon,
  GaugeIcon,
  ActivityIcon,
  LightningIcon,
  RadarIcon,
  LeafIcon,
  FlameIcon,
} from "./WeatherIcons";

export type WeatherLayerKey =
  | "temperature"
  | "rain"
  | "wind"
  | "clouds"
  | "pressure"
  | "air-quality"
  | "lightning"
  | "satellite"
  | "vegetation"
  | "fire";

interface LayerDef {
  key: WeatherLayerKey;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  activeColor: string;
}

export const LAYERS: LayerDef[] = [
  { key: "temperature", label: "Temperature", icon: ThermometerIcon, color: "#EF4444", activeColor: "#DC2626" },
  { key: "rain", label: "Rain", icon: CloudRainIcon, color: "#3B82F6", activeColor: "#2563EB" },
  { key: "wind", label: "Wind", icon: WindIcon, color: "#06B6D4", activeColor: "#0891B2" },
  { key: "clouds", label: "Clouds", icon: CloudyIcon, color: "#94A3B8", activeColor: "#64748B" },
  { key: "pressure", label: "Pressure", icon: GaugeIcon, color: "#8B5CF6", activeColor: "#7C3AED" },
  { key: "air-quality", label: "Air Quality", icon: ActivityIcon, color: "#F59E0B", activeColor: "#D97706" },
  { key: "lightning", label: "Lightning", icon: LightningIcon, color: "#EAB308", activeColor: "#CA8A04" },
  { key: "satellite", label: "Satellite", icon: RadarIcon, color: "#10B981", activeColor: "#059669" },
  { key: "vegetation", label: "Vegetation", icon: LeafIcon, color: "#22C55E", activeColor: "#16A34A" },
  { key: "fire", label: "Fire", icon: FlameIcon, color: "#F97316", activeColor: "#EA580C" },
];

interface WeatherLayerToolbarProps {
  activeLayer: WeatherLayerKey | null;
  onLayerSelect: (layer: WeatherLayerKey | null) => void;
  className?: string;
}

export function WeatherLayerToolbar({ activeLayer, onLayerSelect, className }: WeatherLayerToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-row flex-wrap items-center gap-1 rounded-2xl bg-white/90 p-1.5 shadow-lg backdrop-blur-md",
        className
      )}
    >
      {LAYERS.map((layer) => {
        const isActive = activeLayer === layer.key;
        const Icon = layer.icon;
        return (
          <button
            key={layer.key}
            onClick={() => onLayerSelect(isActive ? null : layer.key)}
            className={cn(
              "group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
              isActive
                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            )}
            title={layer.label}
          >
            <Icon size={18} />
            <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {layer.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
