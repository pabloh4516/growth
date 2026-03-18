"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useDashboardMetrics, useTopCampaigns, useWorstCampaigns, useInsights } from "@/lib/hooks/use-supabase-data";
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
  CheckCircle, Clock, Ban, Link2, AlertTriangle,
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
        .select("status, revenue, matched_campaign_id, sale_date")
        .eq("organization_id", orgId!)
        .gte("sale_date", dateFrom.toISOString());

      if (error) throw error;
      if (!data) return { paid: 0, paidRevenue: 0, pending: 0, pendingRevenue: 0, refunded: 0, total: 0, matched: 0, dailyRevenue: [] as { date: string; realRevenue: number }[] };

      const paid = data.filter((s) => s.status === "paid");
      const pending = data.filter((s) => s.status === "waiting_payment");
      const refunded = data.filter((s) => s.status === "refunded" || s.status === "chargedback");
      const matched = data.filter((s) => s.matched_campaign_id);

      // Aggregate daily revenue for chart
      const revenueByDay: Record<string, number> = {};
      paid.forEach((s) => {
        const day = s.sale_date ? new Date(s.sale_date).toISOString().split("T")[0] : null;
        if (day) {
          revenueByDay[day] = (revenueByDay[day] || 0) + Number(s.revenue || 0);
        }
      });

      const dailyRevenue = Object.entries(revenueByDay)
        .map(([date, realRevenue]) => ({ date, realRevenue }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        paid: paid.length,
        paidRevenue: paid.reduce((sum, s) => sum + Number(s.revenue || 0), 0),
        pending: pending.length,
        pendingRevenue: pending.reduce((sum, s) => sum + Number(s.revenue || 0), 0),
        refunded: refunded.length,
        total: data.length,
        matched: matched.length,
        dailyRevenue,
      };
    },
    enabled: !!orgId,
    refetchInterval: 30 * 1000,
  });
}

function useHealthScore() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["health-score", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("real_roas, ctr, real_cpa, status")
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

function calcCpaChange(daily: any[]): number {
  if (!daily || daily.length < 2) return 0;
  const mid = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, mid);
  const secondHalf = daily.slice(mid);
  const costFirst = firstHalf.reduce((s: number, d: any) => s + (d.cost || 0), 0);
  const convFirst = firstHalf.reduce((s: number, d: any) => s + (d.conversions || 0), 0);
  const costSecond = secondHalf.reduce((s: number, d: any) => s + (d.cost || 0), 0);
  const convSecond = secondHalf.reduce((s: number, d: any) => s + (d.conversions || 0), 0);
  const cpaFirst = convFirst > 0 ? costFirst / convFirst : 0;
  const cpaSecond = convSecond > 0 ? costSecond / convSecond : 0;
  if (cpaFirst === 0) return cpaSecond > 0 ? 100 : 0;
  return ((cpaSecond - cpaFirst) / cpaFirst) * 100;
}

export default function DashboardPage() {
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const queryClient = useQueryClient();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(days);
  const { data: topCampaigns, isLoading: campaignsLoading } = useTopCampaigns(5, days);
  const { data: worstCampaigns, isLoading: worstLoading } = useWorstCampaigns(5);
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: healthScore } = useHealthScore();
  const { data: salesData } = useSalesFromCheckout(days);

  // Merge daily data: cost from Google Ads + real revenue from checkout
  const dailyData = (() => {
    const googleDaily = metrics?.daily || [];
    const salesDaily = salesData?.dailyRevenue || [];

    const salesMap: Record<string, number> = {};
    salesDaily.forEach((d) => { salesMap[d.date] = d.realRevenue; });

    return googleDaily.map((d: any) => ({
      date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      cost: d.cost || 0,
      realRevenue: salesMap[d.date] || 0,
      clicks: d.clicks || 0,
      impressions: d.impressions || 0,
    })) as { date: string; cost: number; realRevenue: number; clicks: number; impressions: number }[];
  })();

  const sparkCost = dailyData.map((d) => d.cost);
  const sparkClicks = dailyData.map((d) => d.clicks);
  const sparkImpressions = dailyData.map((d) => d.impressions);

  const changeImpressions = calcChange(metrics?.daily, "impressions");
  const changeClicks = calcChange(metrics?.daily, "clicks");
  const changeCost = calcChange(metrics?.daily, "cost");
  const changeCPA = calcCpaChange(metrics?.daily);

  // Derived real metrics
  const totalCost = metrics?.cost ?? 0;
  const realRevenue = salesData?.paidRevenue ?? 0;
  const realSales = salesData?.paid ?? 0;
  const realRoas = totalCost > 0 ? realRevenue / totalCost : 0;
  const ctr = metrics?.ctr ?? 0;
  const cpaGoogle = metrics?.cpa ?? 0;

  // Match rate
  const matchRate = salesData && salesData.total > 0 ? (salesData.matched / salesData.total) * 100 : 0;
  const unmatchedCount = salesData ? salesData.total - salesData.matched : 0;

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

      {/* KPIs Principais — vendas reais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Investimento" subtitle="Google Ads" value={formatBRL(totalCost)} change={changeCost} sparkData={sparkCost.slice(-10)} delay={0} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Vendas Reais" subtitle="Checkout" value={formatNumber(realSales)} delay={1} icon={<ShoppingCart className="h-4 w-4" />} />
        <KPICard title="Receita Real" subtitle="Checkout" value={formatBRL(realRevenue)} delay={2} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="ROAS Real" subtitle="Receita / Investimento" value={`${realRoas.toFixed(2)}x`} delay={3} icon={<Target className="h-4 w-4" />} />
      </div>

      {/* KPIs Secundários — Google Ads */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Impressões" subtitle="Google Ads" value={formatCompact(metrics?.impressions ?? 0)} change={changeImpressions} sparkData={sparkImpressions.slice(-10)} delay={4} icon={<Eye className="h-4 w-4" />} size="sm" />
        <KPICard title="Cliques" subtitle="Google Ads" value={formatCompact(metrics?.clicks ?? 0)} change={changeClicks} sparkData={sparkClicks.slice(-10)} delay={5} icon={<MousePointerClick className="h-4 w-4" />} size="sm" />
        <KPICard title="CTR" subtitle="Google Ads" value={`${ctr.toFixed(2)}%`} delay={6} icon={<TrendingUp className="h-4 w-4" />} size="sm" />
        <KPICard title="CPA Google" subtitle="Google Ads" value={formatBRL(cpaGoogle)} change={changeCPA * -1} delay={7} icon={<Target className="h-4 w-4" />} size="sm" />
      </div>

      {/* Vendas do Checkout — melhorado com match rate */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="surface-glow border-primary/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading">Vendas do Checkout</CardTitle>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${matchRate >= 80 ? "bg-success/10 text-success" : matchRate >= 60 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
                  Match: {matchRate.toFixed(0)}%
                </span>
              </div>
            </div>
            {matchRate < 80 && unmatchedCount > 0 && (
              <div className="flex items-center gap-2 mt-2 text-xs text-warning bg-warning/5 px-3 py-1.5 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{unmatchedCount} venda{unmatchedCount > 1 ? "s" : ""} sem vínculo com campanha</span>
              </div>
            )}
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
            <CardHeader className="pb-2"><CardTitle className="text-base font-heading">Investimento vs Receita Real</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="gradRealRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C5CE7" stopOpacity={0.3} /><stop offset="100%" stopColor="#6C5CE7" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00D2FF" stopOpacity={0.3} /><stop offset="100%" stopColor="#00D2FF" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                      <XAxis dataKey="date" tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(240 17% 6%)", border: "1px solid hsl(240 10% 18%)", borderRadius: "8px", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="realRevenue" name="Receita Real" stroke="#6C5CE7" strokeWidth={2} fill="url(#gradRealRevenue)" />
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

      {/* Top Performers + Precisam de Atenção */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="surface-glow">
            <CardHeader className="pb-3"><CardTitle className="text-base font-heading">Top Performers (ROAS Real)</CardTitle></CardHeader>
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
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Precisam de Atenção
              </CardTitle>
            </CardHeader>
            <CardContent>
              {worstLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : worstCampaigns && worstCampaigns.length > 0 ? (
                <div className="space-y-3">
                  {worstCampaigns.map((campaign: any, idx: number) => (
                    <div key={campaign.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                      <PlatformIcon platform={campaign.platform?.replace("_ads", "") || "google"} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {campaign.real_sales_count || 0} vendas • Gasto: {formatBRL(campaign.cost || 0)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-mono font-semibold ${(campaign.real_roas || 0) < 1 ? "text-destructive" : "text-warning"}`}>
                          {(campaign.real_roas || 0).toFixed(2)}x
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma campanha problemática encontrada</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Insights da IA */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.6 }}>
        <Card className="surface-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Insights da IA</CardTitle>
          </CardHeader>
          <CardContent>
            {insightsLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : insights && insights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {insights.slice(0, 6).map((insight: any, idx: number) => (
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
  );
}
