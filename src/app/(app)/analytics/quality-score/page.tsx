"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, formatNumber } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const keywordColumns: ColumnDef<any, any>[] = [
  { accessorKey: "text", header: "Keyword", cell: ({ row }) => <span className="font-medium text-t1 max-w-[250px] truncate block">{row.original.text}</span> },
  { accessorKey: "match_type", header: "Tipo", cell: ({ row }) => <span className="text-xs uppercase text-t3">{row.original.match_type}</span> },
  {
    accessorKey: "quality_score",
    header: "Quality Score",
    cell: ({ row }) => {
      const qs = row.original.quality_score || 0;
      const qsPercent = (qs / 10) * 100;
      return (
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold tabular-nums", qs >= 7 ? "text-success" : qs >= 5 ? "text-warning" : "text-destructive")}>{qs}</span>
          <div className="w-[50px] h-[3px] bg-s3 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", qs >= 7 ? "bg-success" : qs >= 5 ? "bg-warning" : "bg-destructive")} style={{ width: `${qsPercent}%` }} />
          </div>
        </div>
      );
    },
  },
  { accessorKey: "impressions", header: "Impressoes", cell: ({ row }) => <span>{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span>{formatNumber(row.original.clicks || 0)}</span> },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span>{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conv.", cell: ({ row }) => <span>{row.original.conversions || 0}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <span className="text-xs">{row.original.status}</span> },
];

export default function QualityScorePage() {
  const orgId = useOrgId();
  const { data: keywords, isLoading } = useQuery({
    queryKey: ["keywords", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("keywords").select("*").not("quality_score", "is", null).order("quality_score", { ascending: true }).limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const distribution = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => ({
      score: i + 1,
      count: keywords?.filter((k: any) => k.quality_score === i + 1).length || 0,
    })),
    [keywords]
  );

  const avgQs = useMemo(() => {
    if (!keywords || keywords.length === 0) return 0;
    const total = keywords.reduce((s: number, k: any) => s + (k.quality_score || 0), 0);
    return total / keywords.length;
  }, [keywords]);

  const lowQsCount = useMemo(() => keywords?.filter((k: any) => (k.quality_score || 0) < 5).length || 0, [keywords]);
  const highQsCount = useMemo(() => keywords?.filter((k: any) => (k.quality_score || 0) >= 7).length || 0, [keywords]);
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Keywords" value={String(keywords?.length || 0)} gradient="purple" />
        <MetricCard label="QS Medio" value={avgQs.toFixed(1)} gradient="blue" />
        <MetricCard label="QS Alto (7+)" value={String(highQsCount)} gradient="green" />
        <MetricCard label="QS Baixo (<5)" value={String(lowQsCount)} gradient="amber" />
      </div>

      {/* Distribution chart + keyword table */}
      {keywords && keywords.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Distribuicao de Quality Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {distribution.map((d) => (
                  <div key={d.score} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-t2">{d.count}</span>
                    <div
                      className={cn("w-full rounded-t transition-all", d.score >= 7 ? "bg-success" : d.score >= 5 ? "bg-warning" : "bg-destructive")}
                      style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                    />
                    <span className="text-[10px] text-t3">{d.score}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <DataTable data={keywords} columns={keywordColumns} searchPlaceholder="Buscar keyword..." />
        </>
      ) : (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon="⭐"
              title="Sem dados de Quality Score"
              subtitle="As keywords com Quality Score aparecerão apos a sincronizacao do Google Ads."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
