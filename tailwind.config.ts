import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
        },
        // MarketOS surface levels
        s1: "hsl(var(--s1))",
        s2: "hsl(var(--s2))",
        s3: "hsl(var(--s3))",
        s4: "hsl(var(--s4))",
        // MarketOS text hierarchy
        t1: "hsl(var(--t1))",
        t2: "hsl(var(--t2))",
        t3: "hsl(var(--t3))",
        t4: "hsl(var(--t4))",
        // Platform colors
        google: "hsl(var(--google))",
        tiktok: "hsl(var(--tiktok))",
        // Dim variants (for backgrounds)
        "purple-dim": "hsl(var(--purple-dim))",
        "green-dim": "hsl(var(--green-dim))",
        "red-dim": "hsl(var(--red-dim))",
        "amber-dim": "hsl(var(--amber-dim))",
        "blue-dim": "hsl(var(--blue-dim))",
        "google-dim": "hsl(var(--google-dim))",
        "tiktok-dim": "hsl(var(--tiktok-dim))",
      },
      fontFamily: {
        heading: ['"Syne"', "system-ui", "sans-serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",      /* 14px */
        md: "calc(var(--radius) - 4px)", /* 10px */
        sm: "calc(var(--radius) - 6px)", /* 8px */
      },
      fontSize: {
        "2xs": ["9px", { lineHeight: "1.2" }],
        "xs": ["10px", { lineHeight: "1.4" }],
        "sm": ["11px", { lineHeight: "1.5" }],
        "base": ["12.5px", { lineHeight: "1.5" }],
        "md": ["13px", { lineHeight: "1.5" }],
        "lg": ["15px", { lineHeight: "1.4" }],
        "xl": ["17px", { lineHeight: "1.3" }],
        "2xl": ["24px", { lineHeight: "1" }],
        "3xl": ["32px", { lineHeight: "1" }],
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
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fade-up 0.3s ease both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
