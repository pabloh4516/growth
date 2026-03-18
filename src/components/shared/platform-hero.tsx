"use client";

import { cn } from "@/lib/utils";

interface PlatformStat {
  label: string;
  value: string;
}

interface PlatformHeroProps {
  platform: "google" | "tiktok";
  name: string;
  subtitle: string;
  stats: PlatformStat[];
  children?: React.ReactNode; /* for account dropdown */
  className?: string;
}

const platformStyles = {
  google: {
    logo: "bg-google-dim text-google shadow-[0_0_20px_rgba(66,133,244,.2)]",
    letter: "G",
  },
  tiktok: {
    logo: "bg-tiktok-dim text-tiktok shadow-[0_0_20px_rgba(255,45,85,.2)]",
    letter: "T",
  },
};

export function PlatformHero({ platform, name, subtitle, stats, children, className }: PlatformHeroProps) {
  const style = platformStyles[platform];
  return (
    <div className={cn("flex items-center gap-4 bg-card border border-border rounded-lg p-5 mb-5", className)}>
      <div className={cn("w-[42px] h-[42px] rounded-[12px] flex items-center justify-center text-lg font-extrabold font-heading shrink-0", style.logo)}>
        {style.letter}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-heading text-[16px] font-bold tracking-tight">{name}</div>
        <div className="text-sm text-t3 mt-0.5">{subtitle}</div>
        {children}
      </div>
      <div className="flex gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="text-right">
            <div className="font-heading text-lg font-bold">{stat.value}</div>
            <div className="text-xs text-t3">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
