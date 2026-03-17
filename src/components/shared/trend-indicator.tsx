import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendIndicatorProps {
  value: number;
  suffix?: string;
  invertColor?: boolean;
  className?: string;
}

export function TrendIndicator({ value, suffix = "%", invertColor, className }: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  const colorPositive = invertColor ? "text-destructive" : "text-success";
  const colorNegative = invertColor ? "text-success" : "text-destructive";
  const color = isNeutral ? "text-muted-foreground" : isPositive ? colorPositive : colorNegative;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", color, className)}>
      <Icon className="h-3 w-3" />
      {isPositive ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
