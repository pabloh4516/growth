"use client";

import { useMetricsByHour, useMetricsByDevice } from "@/lib/hooks/use-supabase-data";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => `${i}h`);
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DAY_MAP: Record<string, number> = {
  MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6,
};

export default function SchedulePage() {
  const { data: metrics, isLoading } = useMetricsByHour();
  const { data: deviceMetrics } = useMetricsByDevice();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const maxConversions = Math.max(...(metrics?.map((m: any) => m.conversions || 0) || [1]));

  return (
    <div className="space-y-6">
      <PageHeader title="Horários & Dispositivos" description="Heatmap de performance por hora e dia da semana" />
      <Card className="surface-glow">
        <CardHeader>
          <CardTitle className="text-base font-heading">Conversões por Horário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `60px repeat(24, 1fr)` }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[10px] text-muted-foreground text-center">{h}</div>
              ))}
              {DAYS.map((day, dayIdx) => (
                <>
                  <div key={`label-${day}`} className="text-xs text-muted-foreground flex items-center">{day}</div>
                  {HOURS.map((_, hourIdx) => {
                    const metric = metrics?.find((m: any) => m.hour === hourIdx && (m.day_of_week === dayIdx || DAY_MAP[m.day_of_week] === dayIdx));
                    const value = metric?.conversions || 0;
                    const intensity = maxConversions > 0 ? value / maxConversions : 0;
                    return (
                      <div
                        key={`${dayIdx}-${hourIdx}`}
                        className="w-6 h-6 rounded-sm"
                        style={{ backgroundColor: `hsla(258, 58%, 64%, ${0.1 + intensity * 0.8})` }}
                        title={`${day} ${hourIdx}h: ${value} conversões`}
                      />
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {deviceMetrics && deviceMetrics.length > 0 && (
        <Card className="surface-glow">
          <CardHeader>
            <CardTitle className="text-base font-heading">Performance por Dispositivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                const grouped = (deviceMetrics as any[]).reduce((acc: Record<string, any>, m: any) => {
                  const d = m.device || 'other';
                  if (!acc[d]) acc[d] = { device: d, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
                  acc[d].impressions += m.impressions || 0;
                  acc[d].clicks += m.clicks || 0;
                  acc[d].cost += m.cost || 0;
                  acc[d].conversions += m.conversions || 0;
                  return acc;
                }, {} as Record<string, any>);
                const deviceLabels: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", other: "Outro" };
                return Object.values(grouped).map((d: any) => (
                  <div key={d.device} className="p-4 rounded-lg bg-secondary/50 space-y-2">
                    <h4 className="font-heading font-semibold text-sm">{deviceLabels[d.device] || d.device}</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Impressões</span><span className="font-mono">{d.impressions.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Cliques</span><span className="font-mono">{d.clicks.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Custo</span><span className="font-mono">{formatBRL(d.cost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Conversões</span><span className="font-mono">{d.conversions}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">CPA</span><span className="font-mono">{d.conversions > 0 ? formatBRL(d.cost / d.conversions) : "—"}</span></div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
