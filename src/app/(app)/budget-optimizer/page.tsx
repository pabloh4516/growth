"use client";

import { useState } from "react";
import { useCampaigns } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { optimizeBudget } from "@/lib/services/edge-functions";
import { formatBRL } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { BudgetBar } from "@/components/shared/budget-bar";
import { AgentFeedItem } from "@/components/shared/agent-feed-item";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function BudgetOptimizerPage() {
  const orgId = useOrgId();
  const { data: campaigns, isLoading } = useCampaigns();
  const [optimizing, setOptimizing] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);

  const handleOptimize = async () => {
    if (!orgId) return;
    setOptimizing(true);
    try {
      const result = await optimizeBudget(orgId);
      setSuggestion(result);
      toast.success("Otimização concluída!", { description: "Veja a sugestão de alocação abaixo." });
    } catch (err: any) {
      toast.error("Erro na otimização", { description: err?.message });
    } finally {
      setOptimizing(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const activeCampaigns = campaigns?.filter((c: any) => c.status === "active") || [];
  const totalBudget = activeCampaigns.reduce((sum: number, c: any) => sum + (c.daily_budget || 0), 0);
  const totalSpent = activeCampaigns.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);
  const totalRevenue = activeCampaigns.reduce((sum: number, c: any) => sum + (c.real_revenue || 0), 0);
  const projectedSavings = suggestion?.savings ?? totalBudget * 0.12;

  const budgetColors = ["bg-primary", "bg-success", "bg-warning", "bg-info", "bg-purple-500", "bg-amber-500"];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Metric cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Budget total"
          value={formatBRL(totalBudget) + "/dia"}
          gradient="purple"
        />
        <MetricCard
          label="Investido"
          value={formatBRL(totalSpent)}
          gradient="blue"
        />
        <MetricCard
          label="Projeção"
          value={formatBRL(totalRevenue)}
          delta={totalRevenue > totalSpent ? `${((totalRevenue / (totalSpent || 1)) * 100 - 100).toFixed(0)}%` : undefined}
          deltaType="up"
          gradient="green"
        />
        <MetricCard
          label="Economia IA"
          value={formatBRL(projectedSavings)}
          gradient="amber"
        />
      </div>

      {/* Optimize button */}
      <div className="flex justify-end">
        <Button onClick={handleOptimize} disabled={optimizing}>
          {optimizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {optimizing ? "Otimizando..." : "Otimizar com IA"}
        </Button>
      </div>

      {/* AI suggestion feed */}
      {suggestion && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-heading text-t1">Sugestões da IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestion.recommendations ? (
              suggestion.recommendations.map((rec: any, idx: number) => (
                <AgentFeedItem
                  key={idx}
                  variant={rec.action === "reduce" ? "warning" : "executed"}
                  icon={rec.action === "reduce" ? "↓" : "↑"}
                  meta={rec.campaign_name}
                >
                  {rec.reason || JSON.stringify(rec)}
                </AgentFeedItem>
              ))
            ) : (
              <AgentFeedItem variant="executed" icon="AI">
                <pre className="text-xs text-t3 whitespace-pre-wrap">{JSON.stringify(suggestion, null, 2)}</pre>
              </AgentFeedItem>
            )}
          </CardContent>
        </Card>
      )}

      {/* Budget distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2 text-t1">
            <PiggyBank className="h-4 w-4 text-primary" />
            Alocação Atual — {formatBRL(totalBudget)}/dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCampaigns.length > 0 ? (
            <div>
              {activeCampaigns.map((campaign: any, idx: number) => {
                const pct = totalBudget > 0 ? ((campaign.daily_budget || 0) / totalBudget) * 100 : 0;
                const roas = campaign.real_roas || 0;
                const barColor = roas >= 2 ? "bg-success" : roas >= 1 ? "bg-warning" : "bg-destructive";
                return (
                  <BudgetBar
                    key={campaign.id}
                    name={campaign.name}
                    percent={pct}
                    value={`${formatBRL(campaign.daily_budget || 0)} (${roas.toFixed(2)}x)`}
                    color={barColor}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="💰"
              title="Nenhuma campanha ativa"
              subtitle="Ative campanhas para otimizar a alocação de budget."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
