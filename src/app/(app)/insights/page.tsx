"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { MetricCard } from "@/components/shared/metric-card";
import { AgentFeedItem } from "@/components/shared/agent-feed-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const supabase = createClient();

function useAIStats() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-stats", orgId],
    queryFn: async () => {
      const { data: decisions } = await supabase
        .from("ai_decisions")
        .select("id, status, created_at, action_type, description, reason, estimated_impact")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      const all = decisions || [];
      const executed = all.filter((d) => d.status === "executed" || d.status === "approved");
      const pending = all.filter((d) => d.status === "pending");
      return {
        all,
        executed: executed.length,
        pending: pending.length,
        total: all.length,
        accuracy: all.length > 0 ? ((executed.length / (all.length - pending.length || 1)) * 100) : 0,
      };
    },
    enabled: !!orgId,
    refetchInterval: 15 * 1000,
  });
}

export default function InsightsPage() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useAIStats();

  const approve = async (id: string) => {
    await supabase.from("ai_decisions").update({ status: "approved" }).eq("id", id);
    // Execute the approved decision on Google Ads
    await supabase.functions.invoke("ai-execute", { body: { decisionId: id } });
    queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const reject = async (id: string) => {
    await supabase.from("ai_decisions").update({ status: "rejected" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const decisions = stats?.all || [];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Ações executadas" value={`${stats?.executed || 0}`} gradient="purple" />
        <MetricCard label="Economia estimada" value="—" gradient="green" />
        <MetricCard label="Aprovação necessária" value={`${stats?.pending || 0}`} gradient="amber" />
        <MetricCard label="Taxa de acerto" value={stats?.total ? `${stats.accuracy.toFixed(0)}%` : "—"} gradient="blue" />
      </div>

      {/* Action Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Fila de ações do agente</CardTitle>
            <span className="text-sm text-t3">{decisions.length} ações</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2.5">
            {decisions.length > 0 ? (
              decisions.map((d: any) => (
                <AgentFeedItem
                  key={d.id}
                  variant={d.status === "pending" ? "pending" : d.status === "executed" || d.status === "approved" ? "executed" : "warning"}
                  icon={d.status === "pending" ? "⟳" : d.status === "executed" || d.status === "approved" ? "✓" : "✕"}
                  pending={d.status === "pending"}
                  meta={`${new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — ${d.status === "pending" ? "aguardando aprovação" : d.status}`}
                  onApprove={() => approve(d.id)}
                  onReject={() => reject(d.id)}
                >
                  <strong>{d.action_type || "Ação"}</strong> — {d.description || d.reason || "Sem descrição"}
                  {d.estimated_impact && <span className="text-xs text-t3 ml-1">({d.estimated_impact})</span>}
                </AgentFeedItem>
              ))
            ) : (
              <div className="text-center text-t3 text-sm py-8">Nenhuma ação do agente IA ainda. Configure as análises automáticas para começar.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
