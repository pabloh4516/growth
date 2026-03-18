import { cn } from "@/lib/utils";

interface BudgetBarProps {
  name: string;
  percent: number;
  value: string;
  color?: string;
  className?: string;
}

export function BudgetBar({ name, percent, value, color = "bg-primary", className }: BudgetBarProps) {
  return (
    <div className={cn("flex items-center gap-3 py-2.5 border-b border-border last:border-b-0", className)}>
      <div className="text-base font-medium text-t1 w-[130px] shrink-0 truncate">{name}</div>
      <div className="flex-1 h-[5px] bg-s3 rounded-[3px]">
        <div className={cn("h-[5px] rounded-[3px]", color)} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="text-base text-t2 min-w-[80px] text-right">{value}</div>
    </div>
  );
}
