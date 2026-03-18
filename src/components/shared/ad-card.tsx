import { cn } from "@/lib/utils";

interface AdCardProps {
  name: string;
  platform?: string;
  ctr?: string;
  tag?: { label: string; variant: "top" | "fatigued" | "ai" };
  thumbnailGradient?: 1 | 2 | 3;
  thumbnailIcon?: string;
  statusLabel?: string;
  onClick?: () => void;
  className?: string;
}

const gradients = {
  1: "bg-gradient-to-br from-[#1a1230] to-[#2d1f5e]",
  2: "bg-gradient-to-br from-[#0d1f2d] to-[#1a3a4a]",
  3: "bg-gradient-to-br from-[#1f0d1a] to-[#3a1a30]",
};

const tagStyles = {
  top: "bg-green-dim text-success",
  fatigued: "bg-red-dim text-destructive",
  ai: "bg-purple-dim text-primary",
};

export function AdCard({ name, platform, ctr, tag, thumbnailGradient = 1, thumbnailIcon, statusLabel, onClick, className }: AdCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-s2 border border-border rounded-[12px] overflow-hidden cursor-pointer transition-all duration-200 hover:border-[hsl(var(--border2))] hover:-translate-y-0.5",
        className
      )}
    >
      <div className={cn("h-[120px] flex items-center justify-center text-[28px] font-extrabold font-heading relative", gradients[thumbnailGradient])}>
        {thumbnailIcon || "▶"}
        {tag && (
          <span className={cn("absolute top-2 right-2 text-2xs px-1.5 py-0.5 rounded-[5px] font-semibold", tagStyles[tag.variant])}>
            {tag.label}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="text-base font-medium text-t1 truncate">{name}</div>
        <div className="text-xs text-t3 flex justify-between mt-1">
          {ctr && <span>CTR {ctr}</span>}
          {platform && <span>{platform}</span>}
        </div>
        {statusLabel && (
          <div className="mt-2 text-xs text-t3">{statusLabel}</div>
        )}
      </div>
    </div>
  );
}
