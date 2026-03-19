"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const supabase = createClient();

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

      {/* Distribution chart */}
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

          {/* Keywords table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Keywords</CardTitle>
                <span className="text-sm text-t3">{keywords.length} keywords</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Keyword</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Quality Score</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Impressoes</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conv.</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((k: any) => {
                      const qs = k.quality_score || 0;
                      const qsPercent = (qs / 10) * 100;
                      return (
                        <tr key={k.id} className="group cursor-default">
                          <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1 max-w-[250px] truncate">
                            {k.text}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-xs uppercase text-t3">{k.match_type}</span>
                          </td>
                          <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-base font-semibold tabular-nums",
                                qs >= 7 ? "text-success" : qs >= 5 ? "text-warning" : "text-destructive"
                              )}>
                                {qs}
                              </span>
                              <div className="w-[50px] h-[3px] bg-s3 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    qs >= 7 ? "bg-success" : qs >= 5 ? "bg-warning" : "bg-destructive"
                                  )}
                                  style={{ width: `${qsPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {formatNumber(k.impressions || 0)}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {formatNumber(k.clicks || 0)}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {formatBRL(k.cost || 0)}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {k.conversions || 0}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-xs">{k.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
