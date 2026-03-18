import { cn } from "@/lib/utils";

interface RoasValueProps {
  value: number;
  className?: string;
}

export function RoasValue({ value, className }: RoasValueProps) {
  const color = value >= 3 ? "text-success" : value >= 1.5 ? "text-primary" : "text-t3";
  return (
    <span className={cn("font-heading text-md font-bold", color, className)}>
      {value.toFixed(1)}x
    </span>
  );
}
