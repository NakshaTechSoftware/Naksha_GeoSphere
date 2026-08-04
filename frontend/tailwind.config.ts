import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // New brand colors
        "polar-pearl": "var(--color-polar-pearl)",
        "obsidian-graphite": "var(--color-obsidian-graphite)",
        "atlas-cobalt": "var(--color-atlas-cobalt)",
        "teal-primary": "var(--color-teal-primary)",
        // Legacy colors for backward compatibility
        "spatial-navy": "var(--color-spatial-navy)",
        "geo-teal": "var(--color-geo-teal)",
        "cloud-mist": "var(--color-cloud-mist)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "geo-grid":
          "linear-gradient(var(--color-geo-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-geo-grid-line) 1px, transparent 1px)",
        "topographic-pattern":
          "radial-gradient(circle at 20% 50%, rgba(53, 99, 233, 0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(53, 99, 233, 0.03) 0%, transparent 50%)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "0 4px 12px -2px rgb(11 31 51 / 0.10), 0 2px 6px -2px rgb(11 31 51 / 0.08)",
        map: "var(--shadow-map)",
        button: "var(--shadow-button)",
      },
      maxWidth: {
        content: "1560px",
      },
    },
  },
  plugins: [],
};

export default config;
