"use client";

import { useState, useMemo } from "react";
import { useMetricsByHour, useMetricsByDevice } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => `${i}h`);
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const DAY_MAP: Record<string, number> = {
  MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6,
};

export default function SchedulePage() {
  const { data: metrics, isLoading: metricsLoading } = useMetricsByHour();
  const { data: deviceMetrics, isLoading: devicesLoading } = useMetricsByDevice();
  const [activeTab, setActiveTab] = useState("heatmap");

  const isLoading = metricsLoading && devicesLoading;

  // Aggregate device data
  const groupedDevices = useMemo(() => {
    if (!deviceMetrics || deviceMetrics.length === 0) return [];
    const grouped = (deviceMetrics as any[]).reduce((acc: Record<string, any>, m: any) => {
      const d = m.device || "other";
      if (!acc[d]) acc[d] = { device: d, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      acc[d].impressions += m.impressions || 0;
      acc[d].clicks += m.clicks || 0;
      acc[d].cost += m.cost || 0;
      acc[d].conversions += m.conversions || 0;
      return acc;
    }, {} as Record<string, any>);
    return Object.values(grouped) as any[];
  }, [deviceMetrics]);

  // Metric cards data
  const totalConversions = useMemo(() => (metrics || []).reduce((s: number, m: any) => s + (m.conversions || 0), 0), [metrics]);
  const totalCost = useMemo(() => (metrics || []).reduce((s: number, m: any) => s + (m.cost || 0), 0), [metrics]);
  const totalClicks = useMemo(() => (metrics || []).reduce((s: number, m: any) => s + (m.clicks || 0), 0), [metrics]);
  const totalImpressions = useMemo(() => (metrics || []).reduce((s: number, m: any) => s + (m.impressions || 0), 0), [metrics]);

  const maxConversions = Math.max(...(metrics?.map((m: any) => m.conversions || 0) || [1]));
  const deviceLabels: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", other: "Outro" };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Conversoes" value={formatCompact(totalConversions)} gradient="purple" />
        <MetricCard label="Custo Total" value={formatBRL(totalCost)} gradient="amber" />
        <MetricCard label="Cliques" value={formatCompact(totalClicks)} gradient="blue" />
        <MetricCard label="Impressoes" value={formatCompact(totalImpressions)} gradient="green" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          <TabsTrigger value="devices">
            Dispositivos
            {groupedDevices.length > 0 && (
              <span className="ml-1.5 text-2xs bg-s3 text-t2 px-1.5 py-0.5 rounded-[5px] font-medium">
                {groupedDevices.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap">
          {metrics && metrics.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Conversoes por Horario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="inline-grid gap-1" style={{ gridTemplateColumns: `60px repeat(24, 1fr)` }}>
                    <div />
                    {HOURS.map((h) => (
                      <div key={h} className="text-[10px] text-t3 text-center">{h}</div>
                    ))}
                    {DAYS.map((day, dayIdx) => (
                      <div key={`row-${day}`} className="contents">
                        <div className="text-xs text-t3 flex items-center">{day}</div>
                        {HOURS.map((_, hourIdx) => {
                          const metric = metrics?.find((m: any) => m.hour === hourIdx && (m.day_of_week === dayIdx || DAY_MAP[m.day_of_week] === dayIdx));
                          const value = metric?.conversions || 0;
                          const intensity = maxConversions > 0 ? value / maxConversions : 0;
                          return (
                            <div
                              key={`${dayIdx}-${hourIdx}`}
                              className="w-6 h-6 rounded-sm cursor-default transition-transform hover:scale-110"
                              style={{ backgroundColor: `hsla(258, 58%, 64%, ${0.1 + intensity * 0.8})` }}
                              title={`${day} ${hourIdx}h: ${value} conversoes`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-xs text-t3">Menos</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
                      <div key={v} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `hsla(258, 58%, 64%, ${v})` }} />
                    ))}
                    <span className="text-xs text-t3">Mais</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon="⏰"
                  title="Sem dados de horario"
                  subtitle="Os dados aparecerão apos a sincronizacao do Google Ads."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="devices">
          {groupedDevices.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Performance por Dispositivo</CardTitle>
                  <span className="text-sm text-t3">{groupedDevices.length} dispositivos</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Dispositivo</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Impressoes</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conversoes</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">CPA</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedDevices.map((d: any) => {
                        const ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
                        return (
                          <tr key={d.device} className="group cursor-default">
                            <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1">
                              {deviceLabels[d.device] || d.device}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatNumber(d.impressions)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatNumber(d.clicks)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatBRL(d.cost)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatNumber(d.conversions)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {d.conversions > 0 ? formatBRL(d.cost / d.conversions) : "—"}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {ctr.toFixed(2)}%
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
                  icon="📱"
                  title="Sem dados de dispositivos"
                  subtitle="Os dados aparecerão apos a sincronizacao do Google Ads."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
