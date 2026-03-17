import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  active: { label: "Ativo", color: "bg-success", pulse: true },
  paused: { label: "Pausado", color: "bg-warning", pulse: false },
  error: { label: "Erro", color: "bg-destructive", pulse: false },
  connected: { label: "Conectado", color: "bg-success", pulse: false },
  disconnected: { label: "Desconectado", color: "bg-muted-foreground", pulse: false },
  pending: { label: "Pendente", color: "bg-warning", pulse: true },
  draft: { label: "Rascunho", color: "bg-muted-foreground", pulse: false },
} as const;

interface StatusBadgeProps {
  status: keyof typeof STATUS_CONFIG;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span
        className={cn("h-2 w-2 rounded-full", config.color, config.pulse && "animate-pulse-glow")}
      />
      {config.label}
    </span>
  );
}
