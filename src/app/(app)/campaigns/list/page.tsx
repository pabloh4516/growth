"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCampaigns, useAdAccounts, useSalesMetricsByCampaign } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { getGoogleAdsAuthUrl } from "@/lib/services/edge-functions";
import { getCampaignMetricsForPeriod } from "@/lib/services/supabase-queries";
import { formatBRL, formatCompact, formatNumber, cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared/status-pill";
import { RoasValue } from "@/components/shared/roas-value";
import { ColumnSelector, getDefaultVisibleColumns } from "@/components/shared/column-selector";
import { AdCard } from "@/components/shared/ad-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Plus,
  MoreVertical,
  Pause,
  Play,
  DollarSign,
  Eye,
  Unplug,
  ExternalLink,
  Search,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type TabKey = "campanhas" | "conjuntos" | "anuncios" | "contas";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "campanhas", label: "Campanhas" },
  { key: "conjuntos", label: "Conjuntos" },
  { key: "anuncios", label: "Anúncios" },
  { key: "contas", label: "Contas" },
];

const supabase = createClient();

// ─── Ad Groups Hook ──────────────────────────────────────
function useAdGroups() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ad-groups", orgId],
    queryFn: async () => {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId!);
      if (!campaigns || campaigns.length === 0) return [];
      const campaignIds = campaigns.map((c) => c.id);
      const { data } = await supabase
        .from("ad_groups")
        .select("*, campaigns(name, objective)")
        .in("campaign_id", campaignIds)
        .order("cost", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!orgId,
  });
}

// ─── Ads Hook ──────────────────────────────────────────
function useAds() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ads", orgId],
    queryFn: async () => {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId!);
      if (!campaigns || campaigns.length === 0) return [];
      const campaignIds = campaigns.map((c) => c.id);
      const { data } = await supabase
        .from("ad_groups")
        .select("id, name, status, impressions, clicks, cost, ctr, campaigns(name)")
        .in("campaign_id", campaignIds)
        .order("impressions", { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!orgId,
  });
}

// ─── Helpers ──────────────────────────────────────────
function formatDate(date: string | null) {
  if (!date) return "Nunca";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const getType = (c: any) => (c.objective || c.campaign_type || "").toLowerCase();

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

// ═══════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════
export default function CampaignsListPage() {
  const router = useRouter();
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { days } = usePeriodStore();

  // Tab state — default to campanhas, read ?tab= on mount
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "campanhas";
    const params = new URLSearchParams(window.location.search);
    return (params.get("tab") as TabKey) || "campanhas";
  });

  // Campaigns data
  const { data: campaigns, isLoading: loadingCampaigns, refetch: refetchCampaigns } = useCampaigns(days);

  // Sales metrics by campaign (period-filtered, only paid sales)
  const { data: salesByC } = useSalesMetricsByCampaign(days);
  const salesMetrics = salesByC || {};

  // Ad Groups & Ads data
  const { data: adGroups, isLoading: loadingAdGroups } = useAdGroups();
  const { data: ads, isLoading: loadingAds } = useAds();

  // Accounts data
  const { data: adAccounts, isLoading: loadingAccounts, refetch: refetchAccounts } = useAdAccounts();

  // ─── Campaigns state ──────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(getDefaultVisibleColumns);

  // Budget dialog
  const [budgetDialog, setBudgetDialog] = useState<{ id: string; name: string; budget: number } | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  // Accounts state
  const [accountSyncing, setAccountSyncing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Search for ad groups & ads
  const [adGroupSearch, setAdGroupSearch] = useState("");
  const [adSearch, setAdSearch] = useState("");

  // ─── Filtered campaigns ──────────────────────────
  const filtered = useMemo(() => {
    return (campaigns || []).filter((c: any) => {
      // Search
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      // Status
      if (statusFilter === "active" && c.status !== "active") return false;
      if (statusFilter === "paused" && c.status !== "paused") return false;
      // Type
      if (typeFilter !== "all") {
        const t = getType(c);
        if (typeFilter === "search" && !t.includes("search")) return false;
        if (typeFilter === "display" && !t.includes("display")) return false;
        if (typeFilter === "pmax" && !t.includes("performance_max") && !t.includes("pmax")) return false;
        if (typeFilter === "demand_gen" && !t.includes("demand_gen")) return false;
        if (typeFilter === "video" && !t.includes("video")) return false;
      }
      return true;
    });
  }, [campaigns, search, statusFilter, typeFilter]);

  // Filtered ad groups
  const filteredAdGroups = useMemo(() => {
    if (!adGroupSearch) return adGroups || [];
    return (adGroups || []).filter((ag: any) =>
      ag.name.toLowerCase().includes(adGroupSearch.toLowerCase())
    );
  }, [adGroups, adGroupSearch]);

  // Filtered ads
  const filteredAds = useMemo(() => {
    if (!adSearch) return ads || [];
    return (ads || []).filter((ad: any) =>
      ad.name.toLowerCase().includes(adSearch.toLowerCase())
    );
  }, [ads, adSearch]);

  // ─── Selection helpers ──────────────────────────
  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c: any) => c.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Actions ──────────────────────────────────────
  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { organizationId: orgId, scope: "full" },
      });
      if (error) throw error;
      toast.success("Sincronização concluída!");
      refetchCampaigns();
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleStatus = async (campaignId: string, currentStatus: string) => {
    setToggling(campaignId);
    try {
      const newStatus = currentStatus === "active" ? "paused" : "active";
      const { error } = await supabase.functions.invoke("google-ads-oauth", {
        body: { action: "toggleStatus", campaignId, status: newStatus },
      });
      if (error) throw error;
      toast.success(`Campanha ${newStatus === "active" ? "ativada" : "pausada"}`);
      refetchCampaigns();
    } catch (err: any) {
      toast.error("Erro ao alterar status", { description: err?.message });
    } finally {
      setToggling(null);
    }
  };

  const handleBulkToggle = async (newStatus: "active" | "paused") => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await handleToggleStatus(id, newStatus === "active" ? "paused" : "active");
    }
    setSelected(new Set());
  };

  const handleSaveBudget = async () => {
    if (!budgetDialog) return;
    setSavingBudget(true);
    try {
      const { error } = await supabase.functions.invoke("google-ads-oauth", {
        body: { action: "updateBudget", campaignId: budgetDialog.id, budget: parseFloat(newBudget) },
      });
      if (error) throw error;
      toast.success("Orçamento atualizado!");
      setBudgetDialog(null);
      refetchCampaigns();
    } catch (err: any) {
      toast.error("Erro ao atualizar orçamento", { description: err?.message });
    } finally {
      setSavingBudget(false);
    }
  };

  // ─── Accounts actions ─────────────────────────────
  const handleSyncAccount = async (accountId: string) => {
    setAccountSyncing(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { organizationId: orgId, scope: "full" },
      });
      if (error) throw error;
      toast.success("Sincronização concluída!", {
        description: `${data?.results?.[0]?.campaigns || 0} campanhas sincronizadas`,
      });
      refetchAccounts();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setAccountSyncing(null);
    }
  };

  const handleDisconnect = async (accountId: string, accountName: string) => {
    setDisconnecting(accountId);
    try {
      const { error } = await supabase.functions.invoke("google-ads-oauth", {
        body: { action: "disconnect", accountId },
      });
      if (error) throw error;
      toast.success(`${accountName} desconectada`);
      refetchAccounts();
    } catch (err: any) {
      toast.error("Erro ao desconectar", { description: err?.message });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConnect = async () => {
    if (!orgId) return;
    setConnecting(true);
    try {
      const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectUri = `${canonicalOrigin}/connections/callback`;
      const result = (await getGoogleAdsAuthUrl(orgId, redirectUri)) as any;
      if (result?.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      toast.error("Erro ao obter URL de autenticação");
    } catch (err: any) {
      toast.error("Erro na conexão", { description: err?.message });
    } finally {
      setConnecting(false);
    }
  };

  // ─── Export CSV ──────────────────────────────────
  const exportToCSV = () => {
    if (!campaigns || campaigns.length === 0) return;
    const headers = ["Campanha", "Tipo", "Status", "Orçamento", "Investimento", "Vendas", "Reembolsos", "Receita Líquida", "Lucro", "CPA Real", "ROAS", "ROI", "Impressões", "Cliques", "CTR", "CPC"];
    const rows = filtered.map((c: any) => {
      const metrics = getCampaignMetricsForPeriod(c, days);
      const sm = salesMetrics[c.id] || { sales: 0, revenue: 0, refunds: 0, refundRevenue: 0 };
      const netRevenue = sm.revenue - sm.refundRevenue;
      const profit = netRevenue - metrics.spend;
      const roas = metrics.spend > 0 ? netRevenue / metrics.spend : 0;
      const roi = metrics.spend > 0 ? (profit / metrics.spend) * 100 : 0;
      const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
      const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
      return [
        c.name,
        typeLabel(c),
        c.status,
        c.daily_budget || 0,
        metrics.spend,
        sm.sales,
        sm.refunds,
        netRevenue.toFixed(2),
        profit.toFixed(2),
        sm.sales > 0 ? (metrics.spend / sm.sales).toFixed(2) : 0,
        roas.toFixed(2),
        roi.toFixed(0),
        metrics.impressions,
        metrics.clicks,
        ctr.toFixed(2),
        cpc.toFixed(2),
      ];
    });
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanhas-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Loading ──────────────────────────────────────
  const isLoading =
    (activeTab === "campanhas" && loadingCampaigns) ||
    (activeTab === "conjuntos" && loadingAdGroups) ||
    (activeTab === "anuncios" && loadingAds) ||
    (activeTab === "contas" && loadingAccounts);

  // ═══════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════
  return (
    <div className="space-y-4 animate-fade-up">
      {/* ─── Tab Navigation ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-s1 border border-border rounded-lg p-1">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSelected(new Set()); }}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === key
                  ? "bg-primary text-white shadow-sm"
                  : "text-t3 hover:text-t1 hover:bg-s2"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "campanhas" && (
            <>
              <ColumnSelector visibleColumns={visibleColumns} onColumnsChange={setVisibleColumns} />
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Exportar
              </Button>
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Sincronizar
              </Button>
              <Button size="sm" onClick={() => router.push("/campaigns/create")}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova campanha
              </Button>
            </>
          )}
          {activeTab === "contas" && (
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Conectar Conta
            </Button>
          )}
        </div>
      </div>

      {/* ─── Tab Content ─── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ════════ CAMPANHAS ════════ */}
          {activeTab === "campanhas" && (
            <>
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4" />
                  <Input
                    placeholder="Buscar campanha..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="active">Ativas</SelectItem>
                    <SelectItem value="paused">Pausadas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="search">Search</SelectItem>
                    <SelectItem value="display">Display</SelectItem>
                    <SelectItem value="pmax">PMax</SelectItem>
                    <SelectItem value="demand_gen">Demanda</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk actions bar */}
              {selected.size > 0 && (
                <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
                  <span className="text-sm font-medium text-primary">{selected.size} selecionada{selected.size > 1 ? "s" : ""}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkToggle("active")}>
                    <Play className="h-3 w-3 mr-1" /> Ativar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkToggle("paused")}>
                    <Pause className="h-3 w-3 mr-1" /> Pausar
                  </Button>
                </div>
              )}

              {/* Table */}
              <Card>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border w-8">
                            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                          </th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Campanha</th>
                          {visibleColumns.includes("type") && (
                            <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                          )}
                          {visibleColumns.includes("status") && (
                            <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                          )}
                          {visibleColumns.includes("budget") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Orçamento</th>
                          )}
                          {visibleColumns.includes("spend") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Investimento</th>
                          )}
                          {visibleColumns.includes("sales") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Vendas</th>
                          )}
                          {visibleColumns.includes("revenue") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Receita</th>
                          )}
                          {visibleColumns.includes("cpa") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CPA Real</th>
                          )}
                          {visibleColumns.includes("lucro") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Lucro</th>
                          )}
                          {visibleColumns.includes("roas") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">ROAS</th>
                          )}
                          {visibleColumns.includes("roi") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">ROI</th>
                          )}
                          {visibleColumns.includes("impressions") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Impressões</th>
                          )}
                          {visibleColumns.includes("clicks") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                          )}
                          {visibleColumns.includes("ctr") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CTR</th>
                          )}
                          {visibleColumns.includes("cpc") && (
                            <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CPC</th>
                          )}
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c: any) => {
                          const metrics = getCampaignMetricsForPeriod(c, days);
                          const sm = salesMetrics[c.id] || { sales: 0, revenue: 0, refunds: 0, refundRevenue: 0 };
                          const netRevenue = sm.revenue - sm.refundRevenue;
                          const profit = netRevenue - metrics.spend;
                          const roas = metrics.spend > 0 ? netRevenue / metrics.spend : 0;
                          const roi = metrics.spend > 0 ? (profit / metrics.spend) * 100 : 0;
                          const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
                          const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
                          const cellCls = "py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1";
                          return (
                            <tr key={c.id} className={cn("group", selected.has(c.id) && "bg-primary/5")}>
                              <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                              </td>
                              <td
                                className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[220px] truncate cursor-pointer"
                                onClick={() => router.push(`/campaigns/${c.id}`)}
                              >
                                {c.name}
                              </td>
                              {visibleColumns.includes("type") && (
                                <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1">{typeLabel(c)}</td>
                              )}
                              {visibleColumns.includes("status") && (
                                <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                                  <StatusPill variant={c.status === "active" ? "active" : c.status === "paused" ? "paused" : "learning"} />
                                </td>
                              )}
                              {visibleColumns.includes("budget") && (
                                <td className={cellCls}>{formatBRL(c.daily_budget || 0)}/dia</td>
                              )}
                              {visibleColumns.includes("spend") && (
                                <td className={cellCls}>{formatBRL(metrics.spend)}</td>
                              )}
                              {visibleColumns.includes("sales") && (
                                <td className={cn(cellCls, "font-medium text-t1")}>
                                  {sm.sales}
                                  {sm.refunds > 0 && <span className="text-destructive text-xs ml-1">(-{sm.refunds})</span>}
                                </td>
                              )}
                              {visibleColumns.includes("revenue") && (
                                <td className={cn(cellCls, "font-medium text-success")}>{formatBRL(netRevenue)}</td>
                              )}
                              {visibleColumns.includes("cpa") && (
                                <td className={cellCls}>
                                  {sm.sales > 0 ? formatBRL(metrics.spend / sm.sales) : "—"}
                                </td>
                              )}
                              {visibleColumns.includes("lucro") && (
                                <td className={cn(cellCls, "font-medium", profit >= 0 ? "text-success" : "text-destructive")}>
                                  {formatBRL(profit)}
                                </td>
                              )}
                              {visibleColumns.includes("roas") && (
                                <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                                  <RoasValue value={roas} />
                                </td>
                              )}
                              {visibleColumns.includes("roi") && (
                                <td className={cn(cellCls, "font-medium", roi >= 0 ? "text-success" : "text-destructive")}>
                                  {roi.toFixed(0)}%
                                </td>
                              )}
                              {visibleColumns.includes("impressions") && (
                                <td className={cellCls}>{formatCompact(metrics.impressions)}</td>
                              )}
                              {visibleColumns.includes("clicks") && (
                                <td className={cellCls}>{formatNumber(metrics.clicks)}</td>
                              )}
                              {visibleColumns.includes("ctr") && (
                                <td className={cellCls}>{ctr.toFixed(2)}%</td>
                              )}
                              {visibleColumns.includes("cpc") && (
                                <td className={cellCls}>{formatBRL(cpc)}</td>
                              )}
                              <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleToggleStatus(c.id, c.status)}
                                      disabled={toggling === c.id}
                                    >
                                      {c.status === "active" ? (
                                        <><Pause className="h-3.5 w-3.5 mr-2" /> Pausar</>
                                      ) : (
                                        <><Play className="h-3.5 w-3.5 mr-2" /> Ativar</>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setBudgetDialog({ id: c.id, name: c.name, budget: c.daily_budget || 0 });
                                        setNewBudget(String(c.daily_budget || 0));
                                      }}
                                    >
                                      <DollarSign className="h-3.5 w-3.5 mr-2" /> Editar budget
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(`/campaigns/${c.id}`)}>
                                      <Eye className="h-3.5 w-3.5 mr-2" /> Ver detalhes
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={visibleColumns.length + 3} className="py-8 text-center text-t3 text-sm">
                              Nenhuma campanha encontrada
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════════ CONJUNTOS (Ad Groups) ════════ */}
          {activeTab === "conjuntos" && (
            <>
              <div className="relative max-w-[320px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4" />
                <Input
                  placeholder="Buscar grupo de anúncio..."
                  value={adGroupSearch}
                  onChange={(e) => setAdGroupSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Card>
                <CardContent className="pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Grupo de Anúncio</th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Campanha</th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Impressões</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">CTR</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CPA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdGroups.map((ag: any) => {
                          const ctr = ag.impressions > 0 ? (ag.clicks / ag.impressions) * 100 : 0;
                          const cpa = ag.conversions > 0 ? ag.cost / ag.conversions : 0;
                          return (
                            <tr key={ag.id} className="group">
                              <td className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[200px] truncate">{ag.name}</td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1 max-w-[160px] truncate">{ag.campaigns?.name || "—"}</td>
                              <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                                <StatusPill variant={ag.status === "active" ? "active" : "paused"} />
                              </td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{formatCompact(ag.impressions || 0)}</td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatNumber(ag.clicks || 0)}</td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{ctr.toFixed(2)}%</td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatBRL(ag.cost || 0)}</td>
                              <td className="py-2.5 border-b border-border text-sm text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{formatBRL(cpa)}</td>
                            </tr>
                          );
                        })}
                        {filteredAdGroups.length === 0 && (
                          <tr><td colSpan={8} className="py-8 text-center text-t3 text-sm">Nenhum grupo de anúncio encontrado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════════ ANÚNCIOS ════════ */}
          {activeTab === "anuncios" && (
            <>
              <div className="relative max-w-[320px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4" />
                <Input
                  placeholder="Buscar anúncio..."
                  value={adSearch}
                  onChange={(e) => setAdSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              {filteredAds.length === 0 ? (
                <EmptyState icon="📢" title="Nenhum anúncio" subtitle="Conecte sua conta Google Ads para ver seus anúncios aqui" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredAds.map((ad: any, i: number) => (
                    <AdCard
                      key={ad.id}
                      name={ad.name}
                      platform="Google Ads"
                      ctr={ad.ctr ? `${Number(ad.ctr).toFixed(2)}%` : undefined}
                      thumbnailGradient={((i % 3) + 1) as 1 | 2 | 3}
                      thumbnailIcon={ad.campaigns?.name?.slice(0, 3)?.toUpperCase() || "AD"}
                      tag={ad.ctr > 5 ? { label: "TOP", variant: "top" } : undefined}
                      statusLabel={`${formatCompact(ad.impressions || 0)} impressões • ${formatCompact(ad.clicks || 0)} cliques`}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ════════ CONTAS ════════ */}
          {activeTab === "contas" && (
            <Card>
              <CardContent className="pt-4">
                {(adAccounts || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conta</th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">ID</th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                          <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">Último Sync</th>
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(adAccounts || []).map((account: any) => (
                          <tr key={account.id} className="group">
                            <td className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1">
                              {account.account_name}
                            </td>
                            <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                              <span className="font-mono text-xs text-t3">{account.account_id}</span>
                            </td>
                            <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                              <StatusPill
                                variant={account.status === "connected" ? "active" : account.status === "expired" ? "learning" : "paused"}
                                label={account.status === "connected" ? "Conectado" : account.status === "expired" ? "Expirado" : "Desconectado"}
                              />
                            </td>
                            <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">
                              <span className="text-xs text-t3">{formatDate(account.last_sync_at)}</span>
                            </td>
                            <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                              <div className="flex items-center justify-end gap-1">
                                {account.status === "connected" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleSyncAccount(account.id)}
                                    disabled={accountSyncing === account.id}
                                  >
                                    {accountSyncing === account.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <RefreshCw className="h-3.5 w-3.5" />
                                    }
                                  </Button>
                                )}
                                {account.status === "expired" && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleConnect}>
                                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                    Reconectar
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDisconnect(account.id, account.account_name)}
                                  disabled={disconnecting === account.id}
                                >
                                  {disconnecting === account.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Unplug className="h-3.5 w-3.5" />
                                  }
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon="🔗"
                    title="Nenhuma conta conectada"
                    subtitle="Conecte sua conta Google Ads para começar"
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Budget Dialog ─── */}
      <Dialog open={!!budgetDialog} onOpenChange={() => setBudgetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar orçamento diário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-t3 mb-2">{budgetDialog?.name}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-t2">R$</span>
            <Input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              className="flex-1"
              min={0}
              step={0.01}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveBudget} disabled={savingBudget}>
              {savingBudget && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
