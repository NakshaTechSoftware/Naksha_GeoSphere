"use client";

import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

export function SunIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <circle cx="32" cy="32" r="14" fill="#FBBF24" />
      <circle cx="32" cy="32" r="10" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <line
          key={angle}
          x1="32"
          y1="6"
          x2="32"
          y2="12"
          stroke="#FBBF24"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${angle} 32 32)`}
        />
      ))}
    </svg>
  );
}

export function PartlyCloudyIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <circle cx="24" cy="24" r="10" fill="#FBBF24" />
      <circle cx="24" cy="24" r="7" fill="#F59E0B" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <line
          key={angle}
          x1="24"
          y1="8"
          x2="24"
          y2="12"
          stroke="#FBBF24"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
      <path
        d="M22 44c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C20.8 19.5 25.7 15 31.5 15c7.2 0 13 5.4 13.7 12.3C49.5 28.2 54 33 54 38.5 54 44 49.5 48 44 48H22z"
        fill="#E0E7EE"
      />
      <path
        d="M22 44c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C20.8 19.5 25.7 15 31.5 15c7.2 0 13 5.4 13.7 12.3C49.5 28.2 54 33 54 38.5 54 44 49.5 48 44 48H22z"
        fill="white"
        fillOpacity="0.3"
      />
    </svg>
  );
}

export function CloudyIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <path
        d="M18 48c-6.6 0-12-5.4-12-12 0-5.7 4.1-10.5 9.5-11.6C16.6 16.8 22.4 12 29.3 12c8.5 0 15.4 6.5 16.2 14.7C51.7 27.6 57 33.4 57 40.3 57 46.8 51.6 52 45 52H18z"
        fill="#94A3B8"
      />
      <path
        d="M18 48c-6.6 0-12-5.4-12-12 0-5.7 4.1-10.5 9.5-11.6C16.6 16.8 22.4 12 29.3 12c8.5 0 15.4 6.5 16.2 14.7C51.7 27.6 57 33.4 57 40.3 57 46.8 51.6 52 45 52H18z"
        fill="white"
        fillOpacity="0.4"
      />
    </svg>
  );
}

export function RainIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <path
        d="M16 36c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C14.8 8.5 19.7 4 25.5 4c7.2 0 13 5.4 13.7 12.3C43.5 17.2 48 22 48 27.5 48 34 42.6 38 37 38H16z"
        fill="#60A5FA"
      />
      <path
        d="M16 36c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C14.8 8.5 19.7 4 25.5 4c7.2 0 13 5.4 13.7 12.3C43.5 17.2 48 22 48 27.5 48 34 42.6 38 37 38H16z"
        fill="white"
        fillOpacity="0.3"
      />
      {[20, 30, 40].map((x, i) => (
        <React.Fragment key={i}>
          <line x1={x - 4} y1="42" x2={x - 6} y2="50" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={x} y1="44" x2={x - 2} y2="52" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={x + 4} y1="42" x2={x + 2} y2="50" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
        </React.Fragment>
      ))}
    </svg>
  );
}

export function StormIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <path
        d="M16 32c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C14.8 4.5 19.7 0 25.5 0c7.2 0 13 5.4 13.7 12.3C43.5 13.2 48 18 48 23.5 48 30 42.6 34 37 34H16z"
        fill="#475569"
      />
      <path
        d="M16 32c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.8 8-9.7C14.8 4.5 19.7 0 25.5 0c7.2 0 13 5.4 13.7 12.3C43.5 13.2 48 18 48 23.5 48 30 42.6 34 37 34H16z"
        fill="white"
        fillOpacity="0.2"
      />
      <polygon points="28,34 22,48 28,48 24,60 36,44 30,44 34,34" fill="#FBBF24" />
    </svg>
  );
}

export function WindIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );
}

export function DropletsIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 14.69c1.44 0 2.6-1.17 2.6-2.63 0-.84-.44-1.62-1.29-2.26s-1.35-1.57-1.51-2.41c-.17.84-.62 1.66-1.47 2.3s-1.29 1.42-1.29 2.26c0 1.46 1.16 2.63 2.6 2.63z" />
      <path d="M6.5 18.5c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.79 10.25 7.5 8.8c-.29 1.45-1.14 2.84-2.29 3.76S3.5 14.6 3.5 15.75c0 2.22 1.8 4.05 4 4.05z" />
    </svg>
  );
}

export function ThermometerIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

export function GaugeIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

export function CloudRainIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v6" />
      <path d="M8 14v6" />
      <path d="M12 16v6" />
    </svg>
  );
}

export function EyeIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LeafIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

export function FlameIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

export function RadarIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function LightningIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function MapPinIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function MaximizeIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function SearchIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function PlayIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function PauseIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function XIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function StarIcon({ className = "", size = 24, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function HomeIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function ClockIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function ActivityIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "", size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
