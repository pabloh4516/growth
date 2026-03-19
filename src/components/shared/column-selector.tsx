"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface ColumnConfig {
  id: string;
  label: string;
  defaultVisible: boolean;
}

export const CAMPAIGN_COLUMNS: ColumnConfig[] = [
  { id: "status", label: "Status", defaultVisible: true },
  { id: "type", label: "Tipo", defaultVisible: true },
  { id: "budget", label: "Orçamento", defaultVisible: true },
  { id: "spend", label: "Investimento", defaultVisible: true },
  { id: "sales", label: "Vendas", defaultVisible: true },
  { id: "revenue", label: "Receita", defaultVisible: true },
  { id: "cpa", label: "CPA Real", defaultVisible: true },
  { id: "lucro", label: "Lucro", defaultVisible: true },
  { id: "roas", label: "ROAS", defaultVisible: true },
  { id: "roi", label: "ROI", defaultVisible: false },
  { id: "impressions", label: "Impressões", defaultVisible: false },
  { id: "clicks", label: "Cliques", defaultVisible: false },
  { id: "ctr", label: "CTR", defaultVisible: false },
  { id: "cpc", label: "CPC", defaultVisible: false },
];

const STORAGE_KEY = "growthOS-campaign-columns";

export function getDefaultVisibleColumns(): string[] {
  if (typeof window === "undefined") {
    return CAMPAIGN_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return CAMPAIGN_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
    }
  }
  return CAMPAIGN_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

function saveVisibleColumns(columns: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

interface ColumnSelectorProps {
  visibleColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export function ColumnSelector({ visibleColumns, onColumnsChange }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false);

  const toggleColumn = (columnId: string) => {
    const newColumns = visibleColumns.includes(columnId)
      ? visibleColumns.filter((c) => c !== columnId)
      : [...visibleColumns, columnId];
    onColumnsChange(newColumns);
    saveVisibleColumns(newColumns);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="mb-2 px-2 py-1.5">
          <p className="text-sm font-medium text-t1">Colunas visíveis</p>
          <p className="text-xs text-t3">Selecione as métricas a exibir</p>
        </div>
        <div className="space-y-0.5">
          {CAMPAIGN_COLUMNS.map((column) => {
            const isVisible = visibleColumns.includes(column.id);
            return (
              <button
                key={column.id}
                onClick={() => toggleColumn(column.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-s2",
                  isVisible ? "text-t1" : "text-t4"
                )}
              >
                <Checkbox checked={isVisible} className="pointer-events-none" />
                <span>{column.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
