import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(11 31 51 / 0.06), 0 1px 3px 0 rgb(11 31 51 / 0.08)",
        "card-hover":
          "0 4px 12px -2px rgb(11 31 51 / 0.10), 0 2px 6px -2px rgb(11 31 51 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
