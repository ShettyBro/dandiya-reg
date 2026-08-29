import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: "#07080f",
          900: "#0f1122",
          800: "#161a33",
          700: "#1f2444"
        },
        indigo: {
          400: "#8b8cf7",
          500: "#6d6ef4",
          600: "#5648e0"
        },
        festival: {
          magenta: "#d63aa8",
          gold: "#ecc07a",
          goldDim: "#b99457"
        }
      },
      fontFamily: {
        display: ["'Outfit Variable'", "system-ui", "sans-serif"],
        body: ["'Outfit Variable'", "system-ui", "sans-serif"]
      },
      borderRadius: {
        card: "18px",
        pill: "999px"
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(109, 110, 244, 0.45)",
        goldGlow: "0 0 40px -10px rgba(236, 192, 122, 0.4)"
      },
      maxWidth: {
        page: "1400px"
      },
      keyframes: {
        "scroll-up": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" }
        },
        "scroll-down": {
          "0%": { transform: "translateY(-50%)" },
          "100%": { transform: "translateY(0)" }
        }
      },
      animation: {
        "scroll-up-slow": "scroll-up 8s ease-in-out infinite alternate",
        "scroll-up-slower": "scroll-up 10s ease-in-out infinite alternate",
        "scroll-down-slow": "scroll-down 9s ease-in-out infinite alternate",
        "scroll-down-slower": "scroll-down 11s ease-in-out infinite alternate"
      }
    }
  },
  plugins: []
} satisfies Config;
