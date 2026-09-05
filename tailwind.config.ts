import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "0.75rem",
        sm: "1rem",
        md: "1.5rem",
        lg: "2rem",
      },
      // Always full viewport width (including when zoomed out)
      screens: {
        DEFAULT: "100%",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        position: {
          qb: "hsl(var(--qb))",
          rb: "hsl(var(--rb))",
          wr: "hsl(var(--wr))",
          te: "hsl(var(--te))",
          k: "hsl(var(--k))",
          def: "hsl(var(--def))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 20px hsl(var(--primary) / 0.5)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 40px hsl(var(--primary) / 0.8)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        "draft-overlay": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "draft-kicker": {
          from: { opacity: "0", transform: "translateY(-24px) scale(0.92)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "draft-sub": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "draft-photo": {
          "0%": { opacity: "0", transform: "scale(0.35) rotate(-8deg)" },
          "70%": { opacity: "1", transform: "scale(1.06) rotate(1deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
        "draft-name": {
          from: { opacity: "0", transform: "translateY(36px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "draft-meta": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "draft-team": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "draft-sweep": {
          from: { transform: "translateX(-40%)", opacity: "0" },
          "40%": { opacity: "1" },
          to: { transform: "translateX(40%)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-in": "slide-in 0.3s ease-out",
        "shake": "shake 0.5s ease-in-out",
        "draft-overlay": "draft-overlay 0.18s ease-out forwards",
        "draft-kicker": "draft-kicker 0.28s cubic-bezier(0.16, 1, 0.3, 1) both",
        "draft-sub": "draft-sub 0.22s ease-out 0.08s both",
        "draft-photo": "draft-photo 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.06s both",
        "draft-name": "draft-name 0.28s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both",
        "draft-meta": "draft-meta 0.22s ease-out 0.26s both",
        "draft-team": "draft-team 0.22s ease-out 0.3s both",
        "draft-sweep": "draft-sweep 0.7s ease-out 0.04s both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
