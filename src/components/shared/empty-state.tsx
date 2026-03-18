import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn("text-center py-12 px-6 text-t3", className)}>
      <div className="text-[32px] mb-3 opacity-40">{icon}</div>
      <div className="font-heading text-[14px] font-semibold text-t2 mb-1.5">{title}</div>
      {subtitle && <div className="text-base leading-relaxed">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
