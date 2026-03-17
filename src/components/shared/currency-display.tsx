import { cn, formatBRL } from "@/lib/utils";

interface CurrencyDisplayProps {
  value: number;
  colored?: boolean;
  className?: string;
  showSign?: boolean;
}

export function CurrencyDisplay({ value, colored, className, showSign }: CurrencyDisplayProps) {
  const formatted = formatBRL(Math.abs(value));
  const sign = value >= 0 ? "+" : "-";

  return (
    <span
      className={cn(
        "font-mono",
        colored && value > 0 && "text-success",
        colored && value < 0 && "text-destructive",
        className
      )}
    >
      {showSign && sign}
      {value < 0 ? `-${formatted}` : formatted}
    </span>
  );
}
