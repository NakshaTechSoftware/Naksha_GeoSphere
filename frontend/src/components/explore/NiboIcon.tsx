"use client";

/**
 * NiboIcon — Animated glass orb with flowing liquid marble.
 * Pure CSS — no WebGL, no conflict with MapLibre.
 * Always round. Parent container controls the clipping shape.
 * Add className="rounded-full" on the parent for round,
 * or set borderRadius on the parent for oval/racetrack.
 */
export function NiboIcon({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center overflow-hidden"
    >
      {/* Liquid layer 1 — deep purple flow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 0deg, #5B2EFF, #7c3aed, #a855f7, #6366f1, #5B2EFF)",
          animation: "nibo-spin 4s linear infinite",
        }}
      />

      {/* Liquid layer 2 — electric blue swirl */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 135deg, #2563EB, #00D9FF, #8B5CF6, #3B82F6, #2563EB)",
          opacity: 0.6,
          animation: "nibo-spin-rev 5.5s linear infinite",
          filter: "blur(1px)",
        }}
      />

      {/* Liquid layer 3 — lavender mist */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 250deg, #C4B5FD, #818cf8, #a78bfa, #c084fc, #C4B5FD)",
          opacity: 0.45,
          animation: "nibo-spin 7s linear infinite reverse",
          filter: "blur(2px)",
        }}
      />

      {/* Liquid layer 4 — cyan pulse */}
      <div
        className="absolute inset-[6%]"
        style={{
          background:
            "radial-gradient(ellipse at 30% 70%, rgba(0,217,255,0.4) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(139,92,246,0.5) 0%, transparent 50%)",
          animation: "nibo-pulse 3s ease-in-out infinite",
        }}
      />

      {/* Inner depth / vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 25%, rgba(40,10,80,0.4) 65%, rgba(20,5,50,0.7) 100%)",
        }}
      />

      {/* Glass highlight — top left */}
      <div
        className="absolute"
        style={{
          top: "12%",
          left: "18%",
          width: "36%",
          height: "22%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 70%)",
          transform: "rotate(-15deg)",
        }}
      />

      {/* Glass highlight — bottom right */}
      <div
        className="absolute"
        style={{
          bottom: "18%",
          right: "18%",
          width: "18%",
          height: "10%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(255,255,255,0.15) 0%, transparent 70%)",
          transform: "rotate(25deg)",
        }}
      />

      {/* 4-pointed AI sparkle star */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          width: "48%",
          height: "48%",
          animation: "nibo-breathe 3s ease-in-out infinite",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <linearGradient id="nibo-sp" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path
            d="M50 3
               C52 3, 53 17, 56 27
               C60 37, 70 43, 97 50
               C70 57, 60 63, 56 73
               C53 83, 52 97, 50 97
               C48 97, 47 83, 44 73
               C40 63, 30 57, 3 50
               C30 43, 40 37, 44 27
               C47 17, 48 3, 50 3Z"
            fill="url(#nibo-sp)"
          />
        </svg>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes nibo-spin {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.03); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes nibo-spin-rev {
          0%   { transform: rotate(0deg) scale(1.01); }
          50%  { transform: rotate(-180deg) scale(0.98); }
          100% { transform: rotate(-360deg) scale(1.01); }
        }
        @keyframes nibo-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes nibo-breathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
