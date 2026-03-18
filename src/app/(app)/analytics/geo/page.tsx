"use client";

import { useMetricsByGeo } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "region", header: "Estado/Região", cell: ({ row }) => <span className="font-medium">{row.original.region || row.original.state || "—"}</span> },
  { accessorKey: "impressions", header: "Impressões", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.clicks || 0)}</span> },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conversões", cell: ({ row }) => <span className="font-mono text-sm">{row.original.conversions || 0}</span> },
  {
    accessorKey: "cpa",
    header: "CPA",
    cell: ({ row }) => {
      const cpa = row.original.conversions > 0 ? row.original.cost / row.original.conversions : 0;
      return <span className="font-mono text-sm">{formatBRL(cpa)}</span>;
    },
  },
];

export default function GeoPage() {
  const { data: geoData, isLoading } = useMetricsByGeo();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-heading font-bold text-t1">Análise Geográfica</h1>
        <p className="text-sm text-t3">Performance por estado e região</p>
      </div>
      <DataTable data={geoData || []} columns={columns} searchPlaceholder="Buscar estado..." />
    </div>
  );
}
