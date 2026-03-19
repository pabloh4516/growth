"use client";

import { useMemo } from "react";
import { useMetricsByPlacement } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
  const overallRoas = totals.cost > 0 ? totals.revenue / totals.cost : 0;

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Placements</CardTitle>
              <span className="text-sm text-t3">{placements.length} posicionamentos</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Placement</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Impressoes</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">CTR</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conv.</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {(placements as any[]).map((p: any, idx: number) => {
                    const ctr = p.impressions > 0 ? ((p.clicks || 0) / p.impressions) * 100 : 0;
                    const roas = p.cost > 0 ? (p.revenue || 0) / p.cost : 0;
                    return (
                      <tr key={idx} className="group cursor-default">
                        <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1 max-w-[300px] truncate">
                          {p.placement || "—"}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatNumber(p.impressions || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatNumber(p.clicks || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {ctr.toFixed(2)}%
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {formatBRL(p.cost || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {p.conversions || 0}
                        </td>
                        <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                          <span className={`text-base font-semibold ${roas >= 2 ? "text-success" : roas >= 1 ? "text-warning" : "text-destructive"}`}>
                            {roas.toFixed(2)}x
                          </span>
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
