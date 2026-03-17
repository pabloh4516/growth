import { cn } from "@/lib/utils";

const PLATFORMS = {
  google: { letter: "G", color: "bg-blue-500/20 text-blue-400" },
  meta: { letter: "M", color: "bg-indigo-500/20 text-indigo-400" },
  tiktok: { letter: "T", color: "bg-pink-500/20 text-pink-400" },
  youtube: { letter: "Y", color: "bg-red-500/20 text-red-400" },
  ga4: { letter: "A", color: "bg-orange-500/20 text-orange-400" },
  organico: { letter: "O", color: "bg-emerald-500/20 text-emerald-400" },
} as const;

interface PlatformIconProps {
  platform: keyof typeof PLATFORMS;
  className?: string;
}

export function PlatformIcon({ platform, className }: PlatformIconProps) {
  const config = PLATFORMS[platform] ?? PLATFORMS.google;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded text-xs font-bold",
        config.color,
        className
      )}
    >
      {config.letter}
    </span>
  );
}
