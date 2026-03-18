"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";

const supabase = createClient();

const JOURNEY_COLORS = ["bg-blue-500", "bg-purple-500", "bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500"];

export default function JourneyPage() {
  const orgId = useOrgId();

  const { data: funnelEvents, isLoading } = useQuery({
    queryKey: ["funnel-events", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funnel_events")
        .select("*")
        .order("timestamp", { ascending: true })
        .limit(200);
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const stages = (funnelEvents || []).reduce((acc: Record<string, number>, event: any) => {
    const stage = event.stage || "unknown";
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const stageEntries = Object.entries(stages).sort(([, a], [, b]) => (b as number) - (a as number));

  const sources = (funnelEvents || []).reduce((acc: Record<string, number>, event: any) => {
    const src = event.source || "direto";
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-heading">Fluxo de Jornada</CardTitle></CardHeader>
          <CardContent>
            {stageEntries.length > 0 ? (
              <div className="space-y-3">
                {stageEntries.map(([stage, count], idx) => (
                  <div key={stage} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${JOURNEY_COLORS[idx % JOURNEY_COLORS.length]}`} />
                    <span className="text-sm font-medium flex-1 capitalize">{stage}</span>
                    <span className="text-sm font-mono text-t3">{count as number} eventos</span>
                    {idx < stageEntries.length - 1 && <ArrowRight className="h-3 w-3 text-t3" />}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-t3 text-center py-8">Nenhum evento de funil registrado</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-heading">Origens</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(sources).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(sources).sort(([, a], [, b]) => b - a).map(([src, count], idx) => {
                  const maxCount = Math.max(...Object.values(sources));
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={src} className="flex items-center gap-3">
                      <span className="text-sm w-24 truncate">{src}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${JOURNEY_COLORS[idx % JOURNEY_COLORS.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-t3 text-center py-8">Sem dados de origem</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
