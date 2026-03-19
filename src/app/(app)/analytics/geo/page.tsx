"use client";

import { useMemo } from "react";
import { useMetricsByGeo } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "region", header: "Estado / Regiao", cell: ({ row }) => <span className="font-medium text-t1">{row.original.region || row.original.state || "—"}</span> },
  { accessorKey: "impressions", header: "Impressoes", cell: ({ row }) => <span>{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span>{formatNumber(row.original.clicks || 0)}</span> },
  {
    id: "ctr",
    header: "CTR",
    accessorFn: (row: any) => row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
    cell: ({ row }) => {
      const ctr = row.original.impressions > 0 ? (row.original.clicks / row.original.impressions) * 100 : 0;
      return <span>{ctr.toFixed(2)}%</span>;
    },
  },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span>{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conversoes", cell: ({ row }) => <span>{row.original.conversions || 0}</span> },
  {
    id: "cpa",
    header: "CPA",
    accessorFn: (row: any) => row.conversions > 0 ? row.cost / row.conversions : 0,
    cell: ({ row }) => {
      const cpa = row.original.conversions > 0 ? row.original.cost / row.original.conversions : 0;
      return <span>{cpa > 0 ? formatBRL(cpa) : "—"}</span>;
    },
  },
];

export default function GeoPage() {
  const { data: geoData, isLoading } = useMetricsByGeo();

  const totals = useMemo(() => {
    if (!geoData || geoData.length === 0) return { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    return (geoData as any[]).reduce(
      (acc, g: any) => ({
        impressions: acc.impressions + (g.impressions || 0),
        clicks: acc.clicks + (g.clicks || 0),
        cost: acc.cost + (g.cost || 0),
        conversions: acc.conversions + (g.conversions || 0),
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    );
  }, [geoData]);

  const avgCpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

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
        <MetricCard label="CPA Medio" value={avgCpa > 0 ? formatBRL(avgCpa) : "—"} gradient="green" />
      </div>

      {/* Geo table */}
      {geoData && geoData.length > 0 ? (
        <DataTable data={geoData as any[]} columns={columns} searchPlaceholder="Buscar estado..." />
      ) : (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon="🌎"
              title="Sem dados geograficos"
              subtitle="Os dados aparecerão apos a sincronizacao do Google Ads."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
