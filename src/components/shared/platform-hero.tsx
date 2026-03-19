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
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-card border border-border rounded-lg p-4 md:p-5 mb-4 md:mb-5", className)}>
      <div className="flex items-center gap-3">
        <div className={cn("w-[36px] h-[36px] md:w-[42px] md:h-[42px] rounded-[12px] flex items-center justify-center text-base md:text-lg font-extrabold font-heading shrink-0", style.logo)}>
          {style.letter}
        </div>
        <div className="min-w-0">
          <div className="font-heading text-[15px] md:text-[16px] font-bold tracking-tight">{name}</div>
          <div className="text-xs md:text-sm text-t3 mt-0.5 truncate">{subtitle}</div>
          {children}
        </div>
      </div>
      <div className="flex gap-4 sm:gap-6 sm:ml-auto">
        {stats.map((stat) => (
          <div key={stat.label} className="text-left sm:text-right">
            <div className="font-heading text-lg font-bold">{stat.value}</div>
            <div className="text-xs text-t3">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
