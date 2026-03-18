"use client";

import { useMetricsByPlacement } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "placement", header: "Placement", cell: ({ row }) => <span className="font-medium">{row.original.placement || "—"}</span> },
  { accessorKey: "impressions", header: "Impressões", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.clicks || 0)}</span> },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conv.", cell: ({ row }) => <span className="font-mono text-sm">{row.original.conversions || 0}</span> },
  {
    accessorKey: "roas",
    header: "ROAS",
    cell: ({ row }) => {
      const roas = row.original.cost > 0 ? (row.original.revenue || 0) / row.original.cost : 0;
      return <span className={`font-mono text-sm font-semibold ${roas >= 2 ? "text-success" : roas >= 1 ? "text-warning" : "text-destructive"}`}>{roas.toFixed(2)}x</span>;
    },
  },
];

export default function PlacementsPage() {
  const { data: placements, isLoading } = useMetricsByPlacement();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-heading font-bold text-t1">Placements</h1>
        <p className="text-sm text-t3">Performance por posicionamento de anúncio</p>
      </div>
      <DataTable data={placements || []} columns={columns} searchPlaceholder="Buscar placement..." />
    </div>
  );
}
