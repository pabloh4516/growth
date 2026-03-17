"use client";

import { useState } from "react";
import { useCampaigns } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { optimizeBudget } from "@/lib/services/edge-functions";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/platform-icon";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget Optimizer"
        description="Otimize a alocação de budget entre campanhas com IA"
        actions={
          <Button onClick={handleOptimize} disabled={optimizing}>
            {optimizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {optimizing ? "Otimizando..." : "Otimizar com IA"}
          </Button>
        }
      />

      {suggestion && (
        <Card className="surface-glow border-primary/30">
          <CardHeader>
            <CardTitle className="text-base font-heading text-primary">Sugestão da IA</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{JSON.stringify(suggestion, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card className="surface-glow">
        <CardHeader>
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-primary" />
            Alocação Atual — {formatBRL(totalBudget)}/dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCampaigns.length > 0 ? (
            <div className="space-y-3">
              {activeCampaigns.map((campaign: any) => {
                const pct = totalBudget > 0 ? ((campaign.daily_budget || 0) / totalBudget) * 100 : 0;
                const roas = campaign.real_roas || 0;
                return (
                  <div key={campaign.id} className="flex items-center gap-3">
                    <PlatformIcon platform={campaign.platform?.replace("_ads", "") || "google"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">{campaign.name}</p>
                        <span className="text-xs font-mono text-muted-foreground">{formatBRL(campaign.daily_budget || 0)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", roas >= 2 ? "bg-success" : roas >= 1 ? "bg-warning" : "bg-destructive")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className={cn("text-xs font-mono font-semibold w-14 text-right", roas >= 2 ? "text-success" : roas >= 1 ? "text-warning" : "text-destructive")}>
                      {roas.toFixed(2)}x
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma campanha ativa para otimizar.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
