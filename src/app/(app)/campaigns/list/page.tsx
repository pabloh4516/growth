"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCampaigns } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { StatusPill } from "@/components/shared/status-pill";
import { RoasValue } from "@/components/shared/roas-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function GoogleCampaignsPage() {
  const router = useRouter();
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const { data: campaigns, isLoading, refetch } = useCampaigns(days);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("all");

  const filtered = (campaigns || []).filter((c: any) => {
    if (filter === "all") return true;
    const type = (c.objective || c.campaign_type || "").toLowerCase();
    if (filter === "search") return type.includes("search");
    if (filter === "display") return type.includes("display");
    if (filter === "pmax") return type.includes("performance_max") || type.includes("pmax");
    if (filter === "video") return type.includes("video");
    if (filter === "demand_gen") return type.includes("demand_gen");
    return true;
  });

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("google-ads-sync", { body: { organizationId: orgId, scope: "full" } });
      if (error) throw error;
      toast.success("Sincronização concluída!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally { setSyncing(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const getType = (c: any) => (c.objective || c.campaign_type || "").toLowerCase();
  const counts = {
    all: (campaigns || []).length,
    search: (campaigns || []).filter((c: any) => getType(c).includes("search")).length,
    display: (campaigns || []).filter((c: any) => getType(c).includes("display")).length,
    pmax: (campaigns || []).filter((c: any) => { const t = getType(c); return t.includes("performance_max") || t.includes("pmax"); }).length,
    demand_gen: (campaigns || []).filter((c: any) => getType(c).includes("demand_gen")).length,
    video: (campaigns || []).filter((c: any) => getType(c).includes("video")).length,
  };

  const typeLabel = (c: any) => {
    const t = getType(c);
    if (t.includes("search")) return "Search";
    if (t.includes("display")) return "Display";
    if (t.includes("performance_max") || t.includes("pmax")) return "PMax";
    if (t.includes("demand_gen")) return "Demanda";
    if (t.includes("video")) return "Video";
    if (t.includes("shopping")) return "Shopping";
    return t || "Search";
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Sincronizar
        </Button>
        <Button size="sm" onClick={() => router.push("/campaigns/create")}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova campanha
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Todas ({counts.all})</TabsTrigger>
          <TabsTrigger value="search">Search ({counts.search})</TabsTrigger>
          <TabsTrigger value="display">Display ({counts.display})</TabsTrigger>
          <TabsTrigger value="pmax">PMax ({counts.pmax})</TabsTrigger>
          <TabsTrigger value="demand_gen">Demanda ({counts.demand_gen})</TabsTrigger>
          <TabsTrigger value="video">Video ({counts.video})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Campanha</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Orçamento/dia</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Impressões</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Cliques</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CTR</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Vendas</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Lucro</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CPA Real</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">ROAS</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => {
                  const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                  return (
                    <tr key={c.id} className="group cursor-pointer" onClick={() => router.push(`/campaigns/${c.id}`)}>
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[220px] truncate">{c.name}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">{typeLabel(c)}</td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill variant={c.status === "active" ? "active" : c.status === "paused" ? "paused" : "learning"} />
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatBRL(c.daily_budget || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{formatCompact(c.impressions || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{formatNumber(c.clicks || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{ctr.toFixed(2)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{c.real_sales_count || 0}</td>
                      <td className={`py-2.5 border-b border-border text-base font-medium text-right group-hover:bg-s2 transition-colors px-1 ${((c.real_revenue || 0) - (c.cost || 0)) >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatBRL((c.real_revenue || 0) - (c.cost || 0))}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">
                        {(c.real_sales_count || 0) > 0 ? formatBRL((c.cost || 0) / c.real_sales_count) : "—"}
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1"><RoasValue value={c.real_roas || 0} /></td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        <button className="text-xs text-t4 px-2 py-1 rounded-[5px] border border-border hover:border-primary hover:text-primary transition-colors cursor-pointer">
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="py-8 text-center text-t3 text-sm">Nenhuma campanha</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
