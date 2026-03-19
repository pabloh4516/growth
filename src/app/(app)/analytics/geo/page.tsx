"use client";

import { useMemo } from "react";
import { useMetricsByGeo } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Performance por Regiao</CardTitle>
              <span className="text-sm text-t3">{geoData.length} regioes</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Estado / Regiao</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Impressoes</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">CTR</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conversoes</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {(geoData as any[]).map((g: any, idx: number) => {
                    const ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
                    const cpa = g.conversions > 0 ? g.cost / g.conversions : 0;
                    return (
                      <tr key={idx} className="group cursor-default">
                        <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1">
                          {g.region || g.state || "—"}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatNumber(g.impressions || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatNumber(g.clicks || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {ctr.toFixed(2)}%
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatBRL(g.cost || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {g.conversions || 0}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {cpa > 0 ? formatBRL(cpa) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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
