"use client";

import { cn } from "@/lib/utils";

type FeedVariant = "executed" | "pending" | "warning";

interface AgentFeedItemProps {
  variant: FeedVariant;
  icon: string;
  children: React.ReactNode;
  meta?: string;
  pending?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

const iconStyles: Record<FeedVariant, string> = {
  executed: "bg-green-dim text-success",
  pending: "bg-purple-dim text-primary",
  warning: "bg-amber-dim text-warning",
};

export function AgentFeedItem({ variant, icon, children, meta, pending, onApprove, onReject, className }: AgentFeedItemProps) {
  return (
    <div
      className={cn(
        "flex gap-2.5 md:gap-3 bg-s2 border border-border rounded-[11px] p-2.5 md:p-3 transition-colors duration-200 hover:border-[hsl(var(--border2))]",
        pending && "border-primary/28",
        className
      )}
    >
      <div className={cn("w-7 h-7 rounded-sm flex items-center justify-center text-sm font-bold font-heading shrink-0", iconStyles[variant])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-t2 leading-relaxed">{children}</div>
        {meta && <div className="text-2xs text-t4 mt-1">{meta}</div>}
        {pending && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={onApprove}
              className="text-xs px-2.5 py-1 rounded-[6px] border border-success/35 text-success bg-green-dim hover:bg-success/20 transition-colors cursor-pointer"
            >
              Aprovar
            </button>
            <button
              onClick={onReject}
              className="text-xs px-2.5 py-1 rounded-[6px] border border-border text-t3 bg-transparent hover:border-destructive hover:text-destructive transition-colors cursor-pointer"
            >
              Recusar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
