"use client";

import { cn } from "@/lib/utils";
import { Info, AlertTriangle, AlertCircle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface InsightCardProps {
  severity: "info" | "warning" | "critical";
  title: string;
  action?: string;
  delay?: number;
  onClick?: () => void;
}

const SEVERITY_CONFIG = {
  info: { icon: Info, color: "text-info", bg: "bg-info/10", border: "border-info/20" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  critical: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
};

export function InsightCard({ severity, title, action, delay = 0, onClick }: InsightCardProps) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: delay * 0.08 }}
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left group",
          config.bg,
          config.border,
          "hover:shadow-sm"
        )}
      >
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{title}</p>
          {action && <p className="text-xs text-muted-foreground mt-1">{action}</p>}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
      </button>
    </motion.div>
  );
}
