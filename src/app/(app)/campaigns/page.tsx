"use client";

import { useState } from "react";
import { useCampaigns, useAdAccounts, useSalesMetricsByCampaign } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { getCampaignMetricsForPeriod } from "@/lib/services/supabase-queries";
import { MetricCard } from "@/components/shared/metric-card";
import { PlatformHero } from "@/components/shared/platform-hero";
import { StatusPill } from "@/components/shared/status-pill";
import { RoasValue } from "@/components/shared/roas-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function GoogleAdsOverviewPage() {
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const { data: campaigns, isLoading } = useCampaigns(days);
  const { data: adAccounts } = useAdAccounts();
  const { data: salesByC } = useSalesMetricsByCampaign(days);
  const salesMetrics = salesByC || {};

  const googleAccounts = (adAccounts || []).filter((a: any) => a.platform === "google_ads" || !a.platform);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeAccount = selectedAccount
    ? googleAccounts.find((a: any) => a.id === selectedAccount)
    : null;

  // Filter campaigns by selected account
  const filteredCampaigns = selectedAccount
    ? (campaigns || []).filter((c: any) => c.ad_account_id === selectedAccount)
    : campaigns || [];

  // Use daily_metrics for period-aware calculations
  const campaignMetrics = filteredCampaigns.map((c: any) => ({
    ...c,
    _m: getCampaignMetricsForPeriod(c, days),
  }));

  const totalCost = campaignMetrics.reduce((s: number, c: any) => s + c._m.spend, 0);
  const totalClicks = campaignMetrics.reduce((s: number, c: any) => s + c._m.clicks, 0);
  const totalImpressions = campaignMetrics.reduce((s: number, c: any) => s + c._m.impressions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const activeCampaigns = filteredCampaigns.filter((c: any) => c.status === "active").length;

  // Sum real sales metrics (period-filtered, only paid, minus refunds)
  const totalSales = filteredCampaigns.reduce((s: number, c: any) => s + (salesMetrics[c.id]?.sales || 0), 0);
  const totalRevenue = filteredCampaigns.reduce((s: number, c: any) => {
    const sm = salesMetrics[c.id];
    return s + (sm ? sm.revenue - sm.refundRevenue : 0);
  }, 0);
  const roas = totalCost > 0 ? totalRevenue / totalCost : 0;
  const totalProfit = totalRevenue - totalCost;
  const realCpa = totalSales > 0 ? totalCost / totalSales : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Platform Hero */}
      <PlatformHero
        platform="google"
        name="Google Ads"
        subtitle={activeAccount?.account_name || `${googleAccounts.length} contas conectadas`}
        stats={[
          { label: "Investimento", value: formatBRL(totalCost) },
          { label: "ROAS Real", value: `${roas.toFixed(1)}x` },
          { label: "Campanhas", value: `${activeCampaigns}` },
        ]}
      >
        {/* Account dropdown */}
        {googleAccounts.length > 1 && (
          <div className="relative mt-2">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-s2 border border-border rounded-sm px-2.5 py-1.5 text-sm text-t2 hover:border-[hsl(var(--border2))] transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_5px_hsl(var(--success))]" />
              {activeAccount?.account_name || "Todas as contas"}
              <span className="text-t4 ml-1">▾</span>
            </button>
            {dropdownOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-s2 border border-[hsl(var(--border2))] rounded-[12px] p-1.5 min-w-[220px] z-50 shadow-[0_8px_32px_rgba(0,0,0,.5)] animate-fade-up">
                <button
                  onClick={() => { setSelectedAccount(null); setDropdownOpen(false); }}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm transition-colors cursor-pointer ${
                    !selectedAccount ? "bg-purple-dim" : "hover:bg-s3"
                  }`}
                >
                  <div>
                    <div className="text-base font-medium text-t1">Todas as contas</div>
                    <div className="text-xs text-t3">{googleAccounts.length} contas</div>
                  </div>
                  {!selectedAccount && <span className="ml-auto text-sm text-primary">✓</span>}
                </button>
                {googleAccounts.map((acc: any) => (
                  <button
                    key={acc.id}
                    onClick={() => { setSelectedAccount(acc.id); setDropdownOpen(false); }}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm transition-colors cursor-pointer ${
                      acc.id === selectedAccount ? "bg-purple-dim" : "hover:bg-s3"
                    }`}
                  >
                    <div>
                      <div className="text-base font-medium text-t1">{acc.account_name || acc.external_id}</div>
                      <div className="text-xs text-t3">{acc.external_id}</div>
                    </div>
                    {acc.id === selectedAccount && <span className="ml-auto text-sm text-primary">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </PlatformHero>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Lucro"
          value={formatBRL(totalProfit)}
          delta={totalProfit > 0 ? "positivo" : totalProfit < 0 ? "negativo" : undefined}
          deltaType={totalProfit >= 0 ? "up" : "down"}
          gradient="green"
        />
        <MetricCard label="CPA Real" value={realCpa > 0 ? formatBRL(realCpa) : "—"} gradient="amber" />
        <MetricCard label="Cliques" value={formatCompact(totalClicks)} gradient="purple" />
        <MetricCard label="CTR" value={`${avgCtr.toFixed(2)}%`} gradient="blue" />
      </div>

      {/* Campaigns Summary Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Resumo de Campanhas</CardTitle>
            <span className="text-sm text-t3">{filteredCampaigns.length} campanhas</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Campanha</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Investimento</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Vendas</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Receita</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Lucro</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CPA Real</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaignMetrics.slice(0, 8).map((c: any) => {
                  const m = c._m;
                  const sm = salesMetrics[c.id] || { sales: 0, revenue: 0, refunds: 0, refundRevenue: 0 };
                  const netRevenue = sm.revenue - sm.refundRevenue;
                  const profit = netRevenue - m.spend;
                  const campaignRoas = m.spend > 0 ? netRevenue / m.spend : 0;
                  return (
                    <tr key={c.id} className="group cursor-pointer">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[200px] truncate">
                        {c.name}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                        {(() => {
                          const t = (c.objective || c.campaign_type || "").toLowerCase();
                          if (t.includes("search")) return "Search";
                          if (t.includes("display")) return "Display";
                          if (t.includes("performance_max") || t.includes("pmax")) return "PMax";
                          if (t.includes("demand_gen")) return "Demanda";
                          if (t.includes("video")) return "Video";
                          if (t.includes("shopping")) return "Shopping";
                          return t || "—";
                        })()}
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill variant={c.status === "active" ? "active" : c.status === "paused" ? "paused" : "learning"} />
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">
                        {formatBRL(m.spend)}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                        {sm.sales}{sm.refunds > 0 && <span className="text-destructive text-xs ml-1">(-{sm.refunds})</span>}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                        {formatBRL(netRevenue)}
                      </td>
                      <td className={`py-2.5 border-b border-border text-base font-medium text-right group-hover:bg-s2 transition-colors px-1 ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatBRL(profit)}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">
                        {sm.sales > 0 ? formatBRL(m.spend / sm.sales) : "—"}
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        <RoasValue value={campaignRoas} />
                      </td>
                    </tr>
                  );
                })}
                {filteredCampaigns.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-t3 text-sm">Nenhuma campanha encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
