"use client";

import { cn } from "@/lib/utils";

type GradientColor = "purple" | "green" | "blue" | "amber";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "up" | "down";
  gradient?: GradientColor;
  className?: string;
}

const gradientMap: Record<GradientColor, string> = {
  purple: "gradient-bar-purple",
  green: "gradient-bar-green",
  blue: "gradient-bar-blue",
  amber: "gradient-bar-amber",
};

export function MetricCard({ label, value, delta, deltaType = "up", gradient = "purple", className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-[hsl(var(--border2))] hover:-translate-y-px cursor-default",
        gradientMap[gradient],
        className
      )}
    >
      <div className="text-xs text-t3 font-light tracking-wide mb-2">{label}</div>
      <div className="font-heading text-2xl font-bold tracking-tight text-t1 mb-2">{value}</div>
      {delta && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-[5px] font-medium",
            deltaType === "up" ? "bg-green-dim text-success" : "bg-red-dim text-destructive"
          )}
        >
          {deltaType === "up" ? "↑" : "↓"} {delta}
        </span>
      )}
    </div>
  );
}
