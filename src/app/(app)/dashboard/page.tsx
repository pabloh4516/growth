"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useDashboardMetrics, useTopCampaigns, useInsights, useContacts, useSalesMetricsByCampaign } from "@/lib/hooks/use-supabase-data";
import { getCampaignMetricsForPeriod } from "@/lib/services/supabase-queries";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { RoasValue } from "@/components/shared/roas-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const supabase = createClient();

/* ── Hooks ── */

function useSalesFromCheckout(days: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["checkout-sales", orgId, days],
    queryFn: async () => {
      const dateFrom = new Date();
      if (days <= 1) { dateFrom.setHours(0, 0, 0, 0); } else { dateFrom.setDate(dateFrom.getDate() - days); }
      const { data } = await supabase
        .from("utmify_sales")
        .select("status, revenue, matched_campaign_id, sale_date")
        .eq("organization_id", orgId!)
        .gte("sale_date", dateFrom.toISOString());
      if (!data) return { paid: 0, paidRevenue: 0, pending: 0, total: 0, matched: 0, dailyCost: [] as { date: string; cost: number }[] };
      const paid = data.filter((s) => s.status === "paid");
      return {
        paid: paid.length,
        paidRevenue: paid.reduce((sum, s) => sum + Number(s.revenue || 0), 0),
        pending: data.filter((s) => s.status === "waiting_payment").length,
        total: data.length,
        matched: data.filter((s) => s.matched_campaign_id).length,
        dailyCost: [],
      };
    },
    enabled: !!orgId,
    refetchInterval: 5 * 60 * 1000,
  });
}

/* ── Page ── */

export default function DashboardPage() {
  const { days } = usePeriodStore();
  const queryClient = useQueryClient();
  const { data: metrics, isLoading } = useDashboardMetrics(days);
  const { data: topCampaigns } = useTopCampaigns(5, days);
  const { data: salesData } = useSalesFromCheckout(days);
  const { data: salesByC } = useSalesMetricsByCampaign(days);
  const salesMetrics = salesByC || {};
  const { data: insights } = useInsights();
  const { data: contacts } = useContacts();

  const totalCost = metrics?.cost ?? 0;
  const realRevenue = salesData?.paidRevenue ?? 0;
  const realRoas = totalCost > 0 ? realRevenue / totalCost : 0;
  const profit = realRevenue - totalCost;
  const leads = metrics?.conversions ?? 0;

  // Build daily chart data merging cost + revenue
  const salesByDay: Record<string, number> = {};
  if (salesData?.paid) {
    // salesData doesn't have dailyRevenue anymore, so we use totals
  }

  const dailyChart = (metrics?.daily || []).map((d: any) => ({
    day: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    investimento: d.cost || 0,
    receita: d.revenue || 0,
    cliques: d.clicks || 0,
  }));

  // Pipeline leads
  const pipelineLeads = (contacts || [])
    .filter((c: any) => c.lead_score > 0)
    .sort((a: any, b: any) => (b.lead_score || 0) - (a.lead_score || 0))
    .slice(0, 4);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Investimento total"
          value={formatBRL(totalCost)}
          delta={metrics?.daily?.length > 1 ? `${((metrics.daily[metrics.daily.length-1]?.cost || 0) > (metrics.daily[0]?.cost || 0) ? "+" : "")}${(((metrics.daily[metrics.daily.length-1]?.cost || 0) - (metrics.daily[0]?.cost || 0)) / ((metrics.daily[0]?.cost || 1)) * 100).toFixed(1)}%` : undefined}
          deltaType={metrics?.daily?.length > 1 && (metrics.daily[metrics.daily.length-1]?.cost || 0) >= (metrics.daily[0]?.cost || 0) ? "up" : "down"}
          gradient="purple"
        />
        <MetricCard
          label="Lucro"
          value={formatBRL(profit)}
          delta={profit !== 0 ? (profit > 0 ? "positivo" : "negativo") : undefined}
          deltaType={profit >= 0 ? "up" : "down"}
          gradient="green"
        />
        <MetricCard
          label="ROAS"
          value={`${realRoas.toFixed(1)}x`}
          delta={undefined}
          deltaType="up"
          gradient="blue"
        />
        <MetricCard
          label="Leads gerados"
          value={formatCompact(leads)}
          delta={undefined}
          deltaType="up"
          gradient="amber"
        />
      </div>

      {/* ── Chart: Investimento vs Receita ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Investimento vs Receita</CardTitle>
            <span className="text-sm text-t3 cursor-pointer hover:text-primary transition-colors" onClick={() => queryClient.invalidateQueries()}>
              Atualizar
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {dailyChart.length > 0 ? (
            <div className="h-[180px] md:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChart}>
                  <defs>
                    <linearGradient id="gradInvest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B7FFF" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#8B7FFF" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#29D98A" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#29D98A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#50506A", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#50506A", fontSize: 9 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#14141E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", fontSize: "12px", color: "#EEEEF8" }}
                    formatter={(value: any, name: any) => [formatBRL(Number(value || 0)), name === "investimento" ? "Investimento" : "Receita"]}
                  />
                  <Area type="monotone" dataKey="investimento" name="investimento" stroke="#8B7FFF" strokeWidth={2} fill="url(#gradInvest)" />
                  <Area type="monotone" dataKey="receita" name="receita" stroke="#29D98A" strokeWidth={2} fill="url(#gradReceita)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[180px] md:h-[220px] flex items-center justify-center text-t3 text-sm">Sem dados para o período</div>
          )}
        </CardContent>
      </Card>

      {/* ── Row: Top Campanhas + Pipeline + Inteligência ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

        {/* Top Campanhas — table */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top campanhas</CardTitle>
              <span className="text-sm text-t3 cursor-pointer hover:text-primary transition-colors">Ver todas →</span>
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-2.5 uppercase tracking-wide">Campanha</th>
                  <th className="text-xs font-medium text-t3 text-left pb-2.5 uppercase tracking-wide">Status</th>
                  <th className="text-xs font-medium text-t3 text-right pb-2.5 uppercase tracking-wide">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns && topCampaigns.length > 0 ? (
                  topCampaigns.slice(0, 5).map((c: any) => {
                    const m = getCampaignMetricsForPeriod(c, days);
                    const sm = salesMetrics[c.id] || { sales: 0, revenue: 0, refunds: 0, refundRevenue: 0 };
                    const netRevenue = sm.revenue - sm.refundRevenue;
                    const campaignRoas = m.spend > 0 ? netRevenue / m.spend : 0;
                    return (
                      <tr key={c.id} className="group">
                        <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1">
                          {c.name?.length > 22 ? c.name.slice(0, 22) + "…" : c.name}
                        </td>
                        <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                          <StatusPill variant={c.status === "active" ? "active" : c.status === "paused" ? "paused" : "learning"} />
                        </td>
                        <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                          <RoasValue value={campaignRoas} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-t3 text-sm">Nenhuma campanha</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Pipeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pipeline</CardTitle>
              <span className="text-sm text-t3 cursor-pointer hover:text-primary transition-colors">CRM →</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {pipelineLeads.length > 0 ? (
                pipelineLeads.map((lead: any, i: number) => {
                  const colors = ["bg-blue-dim text-info", "bg-purple-dim text-primary", "bg-green-dim text-success", "bg-amber-dim text-warning"];
                  const initials = (lead.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                  const stage = lead.lifecycle_stage || "lead";
                  const stageMap: Record<string, { label: string; style: string }> = {
                    customer: { label: "Quente", style: "bg-green-dim text-success" },
                    opportunity: { label: "Morno", style: "bg-purple-dim text-primary" },
                    lead: { label: "Frio", style: "bg-s3 text-t3" },
                  };
                  const stageInfo = stageMap[stage] || stageMap.lead;
                  return (
                    <div key={lead.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-b-0">
                      <div className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[10px] font-semibold font-heading shrink-0 ${colors[i % 4]}`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium text-t1 truncate">{lead.name}</div>
                        <span className={`text-2xs px-1.5 py-0.5 rounded-[5px] font-medium ${stageInfo.style}`}>{stageInfo.label}</span>
                      </div>
                      <div className="text-base font-medium text-t2">{formatBRL(lead.deal_value || lead.lead_score * 100 || 0)}</div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-t3 text-sm py-8">Nenhum lead no pipeline</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Inteligência */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inteligência</CardTitle>
              <span className="text-sm text-t3 cursor-pointer hover:text-primary transition-colors">Ver todos →</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {insights && insights.length > 0 ? (
                insights.slice(0, 3).map((insight: any) => {
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
                      <div>
                        <div className="text-base font-medium text-t1">{insight.title}</div>
                        <div className="text-xs text-t3 mt-0.5 leading-snug">{insight.suggested_action || insight.description}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
              <div className="text-center text-t3 text-sm py-6">Nenhum insight disponível. Conecte suas contas para começar.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
