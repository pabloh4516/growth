"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useDashboardMetrics, useTopCampaigns, useInsights } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { HealthGauge } from "@/components/shared/health-gauge";
import { InsightCard } from "@/components/shared/insight-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye, MousePointerClick, DollarSign, ShoppingCart, TrendingUp, Target, Brain, RefreshCw, Loader2,
  CheckCircle, Clock, Ban, Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const supabase = createClient();

function useSalesFromCheckout(days: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["checkout-sales", orgId, days],
    queryFn: async () => {
      const dateFrom = new Date();
      if (days <= 1) {
        dateFrom.setHours(0, 0, 0, 0);
      } else {
        dateFrom.setDate(dateFrom.getDate() - days);
      }

      const { data, error } = await supabase
        .from("utmify_sales")
        .select("status, revenue, matched_campaign_id")
        .eq("organization_id", orgId!)
        .gte("sale_date", dateFrom.toISOString());

      if (error) throw error;
      if (!data) return { paid: 0, paidRevenue: 0, pending: 0, pendingRevenue: 0, refunded: 0, total: 0, matched: 0 };

      const paid = data.filter((s) => s.status === "paid");
      const pending = data.filter((s) => s.status === "waiting_payment");
      const refunded = data.filter((s) => s.status === "refunded" || s.status === "chargedback");
      const matched = data.filter((s) => s.matched_campaign_id);

      return {
        paid: paid.length,
        paidRevenue: paid.reduce((sum, s) => sum + Number(s.revenue || 0), 0),
        pending: pending.length,
        pendingRevenue: pending.reduce((sum, s) => sum + Number(s.revenue || 0), 0),
        refunded: refunded.length,
        total: data.length,
        matched: matched.length,
      };
    },
    enabled: !!orgId,
  });
}

function useHealthScore() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["health-score", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("real_roas, ctr, cpa, status")
        .eq("organization_id", orgId!)
        .eq("status", "active");
      if (!data || data.length === 0) return 0;
      const avgRoas = data.reduce((s, c) => s + (c.real_roas || 0), 0) / data.length;
      const avgCtr = data.reduce((s, c) => s + (c.ctr || 0), 0) / data.length;
      const roasScore = Math.min(avgRoas / 3, 1) * 40;
      const ctrScore = Math.min(avgCtr / 5, 1) * 30;
      const activeScore = Math.min(data.length / 5, 1) * 30;
      return Math.round(roasScore + ctrScore + activeScore);
    },
    enabled: !!orgId,
  });
}

function calcChange(daily: any[], field: string): number {
  if (!daily || daily.length < 2) return 0;
  const mid = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, mid).reduce((s: number, d: any) => s + (d[field] || 0), 0);
  const secondHalf = daily.slice(mid).reduce((s: number, d: any) => s + (d[field] || 0), 0);
  if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
  return ((secondHalf - firstHalf) / firstHalf) * 100;
}

export default function DashboardPage() {
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const queryClient = useQueryClient();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(days);
  const { data: topCampaigns, isLoading: campaignsLoading } = useTopCampaigns(5);
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: healthScore } = useHealthScore();
  const { data: salesData } = useSalesFromCheckout(days);
  const autoSyncDone = useRef(false);

  // Auto-sync Google Ads on dashboard load (if last sync > 5 min)
  useEffect(() => {
    if (!orgId || autoSyncDone.current) return;
    autoSyncDone.current = true;

    (async () => {
      try {
        const { data: accounts } = await supabase
          .from("ad_accounts")
          .select("id, last_sync_at")
          .eq("organization_id", orgId)
          .eq("status", "connected");

        if (!accounts || accounts.length === 0) return;

        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const staleAccounts = accounts.filter(
          (a) => !a.last_sync_at || a.last_sync_at < fiveMinAgo
        );

        if (staleAccounts.length > 0) {
          console.log("Auto-syncing Google Ads (stale data)...");
          await supabase.functions.invoke("google-ads-sync", {
            body: { organizationId: orgId, scope: "campaigns_only" },
          });
          queryClient.invalidateQueries({ queryKey: ["campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
          queryClient.invalidateQueries({ queryKey: ["top-campaigns"] });
        }
      } catch (err) {
        console.error("Auto-sync failed:", err);
      }
    })();
  }, [orgId, queryClient]);

  const dailyData = metrics?.daily?.map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    cost: d.cost || 0,
    revenue: d.revenue || 0,
    clicks: d.clicks || 0,
    impressions: d.impressions || 0,
    conversions: d.conversions || 0,
  })) || [];

  const sparkCost = dailyData.map((d: any) => d.cost);
  const sparkRevenue = dailyData.map((d: any) => d.revenue);
  const sparkClicks = dailyData.map((d: any) => d.clicks);
  const sparkImpressions = dailyData.map((d: any) => d.impressions);
  const sparkConversions = dailyData.map((d: any) => d.conversions);

  const changeImpressions = calcChange(metrics?.daily, "impressions");
  const changeClicks = calcChange(metrics?.daily, "clicks");
  const changeCost = calcChange(metrics?.daily, "cost");
  const changeConversions = calcChange(metrics?.daily, "conversions");
  const changeRevenue = calcChange(metrics?.daily, "revenue");
  const changeCPA = metrics?.cpa ? calcChange(metrics?.daily, "cost") - calcChange(metrics?.daily, "conversions") : 0;

  if (metricsLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral da sua operação de marketing"
        actions={
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Impressões" value={formatCompact(metrics?.impressions ?? 0)} change={changeImpressions} sparkData={sparkImpressions.slice(-10)} delay={0} icon={<Eye className="h-4 w-4" />} />
        <KPICard title="Cliques" value={formatCompact(metrics?.clicks ?? 0)} change={changeClicks} sparkData={sparkClicks.slice(-10)} delay={1} icon={<MousePointerClick className="h-4 w-4" />} />
        <KPICard title="Investimento" value={formatBRL(metrics?.cost ?? 0)} change={changeCost} sparkData={sparkCost.slice(-10)} delay={2} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Conversões" value={formatNumber(metrics?.conversions ?? 0)} change={changeConversions} sparkData={sparkConversions.slice(-10)} delay={3} icon={<ShoppingCart className="h-4 w-4" />} />
        <KPICard title="ROAS" value={`${(metrics?.roas ?? 0).toFixed(2)}x`} change={changeRevenue - changeCost} sparkData={sparkRevenue.slice(-10)} delay={4} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="CPA" value={formatBRL(metrics?.cpa ?? 0)} change={changeCPA * -1} sparkData={sparkCost.slice(-10)} delay={5} icon={<Target className="h-4 w-4" />} />
      </div>

      {/* Vendas do Checkout */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="surface-glow border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading">Vendas do Checkout</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  Pagas
                </div>
                <p className="text-2xl font-heading font-bold">{salesData?.paid ?? 0}</p>
                <p className="text-xs font-mono text-success">{formatBRL(salesData?.paidRevenue ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-warning" />
                  Pendentes
                </div>
                <p className="text-2xl font-heading font-bold">{salesData?.pending ?? 0}</p>
                <p className="text-xs font-mono text-warning">{formatBRL(salesData?.pendingRevenue ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Ban className="h-3.5 w-3.5 text-destructive" />
                  Reembolsos
                </div>
                <p className="text-2xl font-heading font-bold">{salesData?.refunded ?? 0}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  Vinculadas
                </div>
                <p className="text-2xl font-heading font-bold">{salesData?.matched ?? 0}<span className="text-sm text-muted-foreground font-normal">/{salesData?.total ?? 0}</span></p>
                <p className="text-xs text-muted-foreground">vendas atribuídas a campanhas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <Card className="surface-glow">
            <CardHeader className="pb-2"><CardTitle className="text-base font-heading">Receita vs Investimento</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C5CE7" stopOpacity={0.3} /><stop offset="100%" stopColor="#6C5CE7" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00D2FF" stopOpacity={0.3} /><stop offset="100%" stopColor="#00D2FF" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                      <XAxis dataKey="date" tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(240 17% 6%)", border: "1px solid hsl(240 10% 18%)", borderRadius: "8px", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="revenue" name="Receita" stroke="#6C5CE7" strokeWidth={2} fill="url(#gradRevenue)" />
                      <Area type="monotone" dataKey="cost" name="Investimento" stroke="#00D2FF" strokeWidth={2} fill="url(#gradCost)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Nenhum dado disponível para o período selecionado</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="surface-glow h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Saúde da Conta</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pt-4">
              <HealthGauge score={healthScore ?? 0} />
              <p className="text-xs text-muted-foreground mt-4 text-center">Score calculado com base em ROAS real, CTR e campanhas ativas</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="surface-glow">
            <CardHeader className="pb-3"><CardTitle className="text-base font-heading">Top Campanhas (ROAS Real)</CardTitle></CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : topCampaigns && topCampaigns.length > 0 ? (
                <div className="space-y-3">
                  {topCampaigns.map((campaign: any, idx: number) => (
                    <div key={campaign.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                      <PlatformIcon platform={campaign.platform?.replace("_ads", "") || "google"} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{campaign.name}</p>
                        <StatusBadge status={campaign.status || "active"} />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold">{(campaign.real_roas || 0).toFixed(2)}x</p>
                        <CurrencyDisplay value={campaign.real_revenue || 0} className="text-xs text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma campanha com vendas reais</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }}>
          <Card className="surface-glow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Insights da IA</CardTitle>
            </CardHeader>
            <CardContent>
              {insightsLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : insights && insights.length > 0 ? (
                <div className="space-y-2">
                  {insights.slice(0, 5).map((insight: any, idx: number) => (
                    <InsightCard key={insight.id} severity={insight.severity || "info"} title={insight.title} action={insight.suggested_action} delay={idx} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum insight disponível. Conecte suas contas para começar.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
