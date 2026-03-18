"use client";

import { cn } from "@/lib/utils";

interface CopyCardProps {
  label: string;
  headline: string;
  description: string;
  cta?: string;
  onUse?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function CopyCard({ label, headline, description, cta, onUse, onSave, onDelete, className }: CopyCardProps) {
  return (
    <div className={cn("bg-s2 border border-border rounded-[11px] p-3.5 transition-colors duration-200 hover:border-[hsl(var(--border2))]", className)}>
      <div className="text-xs font-semibold tracking-wide uppercase text-t3 mb-1.5">{label}</div>
      <div className="text-md font-medium text-t1 leading-relaxed">{headline}</div>
      <div className="text-base text-t2 mt-1 leading-relaxed">{description}</div>
      {cta && <div className="text-base text-primary font-medium mt-1">{cta}</div>}
      <div className="flex gap-1.5 mt-2.5">
        {onUse && (
          <button onClick={onUse} className="text-sm px-2.5 py-1 rounded-[6px] border border-primary/40 text-primary bg-purple-dim hover:bg-primary/25 transition-colors cursor-pointer">
            Usar nesta campanha
          </button>
        )}
        {onSave && (
          <button onClick={onSave} className="text-sm px-2.5 py-1 rounded-[6px] border border-border text-t3 bg-transparent hover:text-t1 transition-colors cursor-pointer">
            Salvar
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="text-sm px-2.5 py-1 rounded-[6px] border border-border text-t3 bg-transparent hover:border-destructive hover:text-destructive transition-colors cursor-pointer ml-auto">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
