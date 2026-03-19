"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { useInsights } from "@/lib/hooks/use-supabase-data";
import { triggerAIAnalysis, executeAIDecision } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { MetricCard } from "@/components/shared/metric-card";
import { AgentFeedItem } from "@/components/shared/agent-feed-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Sparkles } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

function useAIStats() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-stats", orgId],
    queryFn: async () => {
      const { data: decisions } = await supabase
        .from("ai_decisions")
        .select("id, status, created_at, action_type, decision_type, description, reasoning, estimated_impact, campaign_id, confidence")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(30);
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
    refetchInterval: 5 * 60 * 1000,
  });
}

export default function InsightsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useAIStats();
  const { data: insights } = useInsights();
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = async () => {
    if (!orgId) return;
    setAnalyzing(true);
    try {
      await triggerAIAnalysis(orgId);
      toast.success("Análise concluída!", { description: "Novas decisões e insights foram gerados." });
      queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    } catch (err: any) {
      toast.error("Erro na análise", { description: err?.message });
    } finally { setAnalyzing(false); }
  };

  const approve = async (id: string) => {
    await supabase.from("ai_decisions").update({ status: "approved" }).eq("id", id);
    try {
      await executeAIDecision(id);
      toast.success("Ação executada no Google Ads!");
    } catch (err: any) {
      toast.error("Erro ao executar", { description: err?.message });
    }
    queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const reject = async (id: string) => {
    await supabase.from("ai_decisions").update({ status: "rejected" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["ai-stats"] });
    toast.info("Ação rejeitada.");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const decisions = stats?.all || [];
  const pendingDecisions = decisions.filter((d: any) => d.status === "pending");
  const executedDecisions = decisions.filter((d: any) => d.status === "executed" || d.status === "approved");
  const rejectedDecisions = decisions.filter((d: any) => d.status === "rejected" || d.status === "blocked" || d.status === "failed");

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <Button onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {analyzing ? "Analisando..." : "Executar Análise IA"}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Ações executadas" value={`${stats?.executed || 0}`} gradient="purple" />
        <MetricCard label="Aguardando aprovação" value={`${stats?.pending || 0}`} gradient="amber" />
        <MetricCard label="Taxa de acerto" value={stats?.total ? `${stats.accuracy.toFixed(0)}%` : "—"} gradient="green" />
        <MetricCard label="Total de decisões" value={`${stats?.total || 0}`} gradient="blue" />
      </div>

      {/* Tabs: Pendentes / Executadas / Rejeitadas / Insights */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pendentes ({pendingDecisions.length})</TabsTrigger>
          <TabsTrigger value="executed">Executadas ({executedDecisions.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitadas ({rejectedDecisions.length})</TabsTrigger>
          <TabsTrigger value="insights">Insights ({(insights || []).length})</TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ações aguardando aprovação</CardTitle>
                {pendingDecisions.length > 0 && (
                  <span className="text-xs text-warning bg-amber-dim px-2 py-0.5 rounded-[5px] font-medium">{pendingDecisions.length} pendentes</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                {pendingDecisions.length > 0 ? (
                  pendingDecisions.map((d: any) => (
                    <AgentFeedItem
                      key={d.id}
                      variant="pending"
                      icon="⟳"
                      pending
                      meta={`${new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — confiança: ${((d.confidence || 0) * 100).toFixed(0)}%`}
                      onApprove={() => approve(d.id)}
                      onReject={() => reject(d.id)}
                    >
                      <strong>{d.decision_type || d.action_type || "Ação"}</strong> — {d.description || d.reasoning || "Sem descrição"}
                    </AgentFeedItem>
                  ))
                ) : (
                  <div className="text-center text-t3 text-sm py-8">Nenhuma ação pendente. Clique em &ldquo;Executar Análise IA&rdquo; para gerar novas decisões.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Executed */}
        <TabsContent value="executed">
          <Card>
            <CardHeader><CardTitle>Ações executadas</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                {executedDecisions.length > 0 ? (
                  executedDecisions.map((d: any) => (
                    <AgentFeedItem
                      key={d.id}
                      variant="executed"
                      icon="✓"
                      meta={new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    >
                      <strong>{d.decision_type || d.action_type || "Ação"}</strong> — {d.description || d.reasoning || "Executada com sucesso"}
                    </AgentFeedItem>
                  ))
                ) : (
                  <div className="text-center text-t3 text-sm py-8">Nenhuma ação executada ainda.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejected */}
        <TabsContent value="rejected">
          <Card>
            <CardHeader><CardTitle>Ações rejeitadas / falhas</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                {rejectedDecisions.length > 0 ? (
                  rejectedDecisions.map((d: any) => (
                    <AgentFeedItem
                      key={d.id}
                      variant="warning"
                      icon="✕"
                      meta={`${new Date(d.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — ${d.status}`}
                    >
                      <strong>{d.decision_type || d.action_type || "Ação"}</strong> — {d.description || d.reasoning || "Rejeitada"}
                    </AgentFeedItem>
                  ))
                ) : (
                  <div className="text-center text-t3 text-sm py-8">Nenhuma ação rejeitada.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights */}
        <TabsContent value="insights">
          <Card>
            <CardHeader><CardTitle>Insights da IA</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-0">
                {(insights || []).length > 0 ? (
                  (insights || []).map((insight: any) => {
                    const iconMap: Record<string, { icon: string; style: string }> = {
                      critical: { icon: "🔴", style: "bg-red-dim" },
                      warning: { icon: "🟡", style: "bg-amber-dim" },
                      info: { icon: "🔵", style: "bg-blue-dim" },
                      success: { icon: "🟢", style: "bg-green-dim" },
                    };
                    const info = iconMap[insight.severity] || iconMap.info;
                    return (
                      <div key={insight.id} className="flex gap-3 py-2.5 border-b border-border last:border-b-0">
                        <div className={`w-[30px] h-[30px] rounded-sm flex items-center justify-center text-md shrink-0 ${info.style}`}>
                          {info.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-medium text-t1">{insight.title}</div>
                          <div className="text-xs text-t3 mt-0.5 leading-snug">{insight.suggested_action || insight.description}</div>
                          <div className="text-2xs text-t4 mt-1">{new Date(insight.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-t3 text-sm py-8">Nenhum insight. Execute uma análise para gerar.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
