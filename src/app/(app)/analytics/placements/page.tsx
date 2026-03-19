"use client";

import { useMemo } from "react";
import { useMetricsByPlacement } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "placement", header: "Placement", cell: ({ row }) => <span className="font-medium text-t1 max-w-[300px] truncate block">{row.original.placement || "—"}</span> },
  { accessorKey: "impressions", header: "Impressoes", cell: ({ row }) => <span>{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span>{formatNumber(row.original.clicks || 0)}</span> },
  {
    id: "ctr",
    header: "CTR",
    accessorFn: (row: any) => row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
    cell: ({ row }) => {
      const ctr = row.original.impressions > 0 ? ((row.original.clicks || 0) / row.original.impressions) * 100 : 0;
      return <span>{ctr.toFixed(2)}%</span>;
    },
  },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span>{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conv.", cell: ({ row }) => <span>{row.original.conversions || 0}</span> },
  {
    id: "roas",
    header: "ROAS",
    accessorFn: (row: any) => row.cost > 0 ? (row.revenue || 0) / row.cost : 0,
    cell: ({ row }) => {
      const roas = row.original.cost > 0 ? (row.original.revenue || 0) / row.original.cost : 0;
      return (
        <span className={`font-semibold ${roas >= 2 ? "text-success" : roas >= 1 ? "text-warning" : "text-destructive"}`}>
          {roas.toFixed(2)}x
        </span>
      );
    },
  },
];

export default function PlacementsPage() {
  const { data: placements, isLoading } = useMetricsByPlacement();

  const totals = useMemo(() => {
    if (!placements || placements.length === 0) return { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
    return (placements as any[]).reduce(
      (acc, p: any) => ({
        impressions: acc.impressions + (p.impressions || 0),
        clicks: acc.clicks + (p.clicks || 0),
        cost: acc.cost + (p.cost || 0),
        conversions: acc.conversions + (p.conversions || 0),
        revenue: acc.revenue + (p.revenue || 0),
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 }
    );
  }, [placements]);

  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Impressoes" value={formatCompact(totals.impressions)} gradient="purple" />
        <MetricCard label="Cliques" value={formatCompact(totals.clicks)} gradient="blue" />
        <MetricCard label="Custo Total" value={formatBRL(totals.cost)} gradient="amber" />
        <MetricCard label="CTR Medio" value={`${avgCtr.toFixed(2)}%`} gradient="green" />
      </div>

      {/* Placements table */}
      {placements && placements.length > 0 ? (
        <DataTable data={placements as any[]} columns={columns} searchPlaceholder="Buscar placement..." />
      ) : (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon="📍"
              title="Sem dados de placements"
              subtitle="Os dados aparecerão apos a sincronizacao do Google Ads."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
