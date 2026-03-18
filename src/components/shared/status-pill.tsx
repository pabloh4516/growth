import { cn } from "@/lib/utils";

type PillVariant = "active" | "paused" | "learning" | "review";

interface StatusPillProps {
  variant: PillVariant;
  label?: string;
  className?: string;
}

const variantStyles: Record<PillVariant, { bg: string; text: string; defaultLabel: string }> = {
  active: { bg: "bg-green-dim", text: "text-success", defaultLabel: "Ativa" },
  paused: { bg: "bg-s3", text: "text-t3", defaultLabel: "Pausada" },
  learning: { bg: "bg-amber-dim", text: "text-warning", defaultLabel: "Aprendendo" },
  review: { bg: "bg-blue-dim", text: "text-info", defaultLabel: "Revisão" },
};

export function StatusPill({ variant, label, className }: StatusPillProps) {
  const style = variantStyles[variant];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-[6px] font-medium", style.bg, style.text, className)}>
      <span className="w-[5px] h-[5px] rounded-full bg-current" />
      {label || style.defaultLabel}
    </span>
  );
}
