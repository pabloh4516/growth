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
  ArrowUp,
  ArrowDown,
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

// ─── Sortable Table Header ────────────────────────────
function SortTh({ col, label, align = "right", sortCol, sortDir, onSort }: {
  col: string; label: string; align?: "left" | "right";
  sortCol: string | null; sortDir: "asc" | "desc"; onSort: (col: string) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className={cn(
        "text-xs font-medium text-t3 pb-3 uppercase tracking-wide border-b border-border cursor-pointer select-none hover:text-t1 transition-colors",
        align === "left" ? "text-left" : "text-right"
      )}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
        ) : (
          <span className="h-3 w-3" />
        )}
      </span>
    </th>
  );
}

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
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  // ─── Sort helper ─────────────────────────────────
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  // ─── Enriched + Filtered + Sorted campaigns ─────
  const filtered = useMemo(() => {
    // 1. Filter
    const list = (campaigns || []).filter((c: any) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === "active" && c.status !== "active") return false;
      if (statusFilter === "paused" && c.status !== "paused") return false;
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

    // 2. Enrich with computed metrics (for sorting)
    const enriched = list.map((c: any) => {
      const m = getCampaignMetricsForPeriod(c, days);
      const sm = salesMetrics[c.id] || { sales: 0, revenue: 0, refunds: 0, refundRevenue: 0 };
      const netRevenue = sm.revenue - sm.refundRevenue;
      const profit = netRevenue - m.spend;
      const roas = m.spend > 0 ? netRevenue / m.spend : 0;
      const roi = m.spend > 0 ? (profit / m.spend) * 100 : 0;
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
      const cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
      const cpa = sm.sales > 0 ? m.spend / sm.sales : 0;
      return { ...c, _m: m, _sm: sm, _netRevenue: netRevenue, _profit: profit, _roas: roas, _roi: roi, _ctr: ctr, _cpc: cpc, _cpa: cpa };
    });

    // 3. Sort
    if (!sortCol) return enriched;
    const sortMap: Record<string, (c: any) => number | string> = {
      name: (c) => c.name.toLowerCase(),
      type: (c) => typeLabel(c),
      status: (c) => c.status,
      budget: (c) => c.daily_budget || 0,
      spend: (c) => c._m.spend,
      sales: (c) => c._sm.sales,
      revenue: (c) => c._netRevenue,
      cpa: (c) => c._cpa,
      lucro: (c) => c._profit,
      roas: (c) => c._roas,
      roi: (c) => c._roi,
      impressions: (c) => c._m.impressions,
      clicks: (c) => c._m.clicks,
      ctr: (c) => c._ctr,
      cpc: (c) => c._cpc,
    };
    const getter = sortMap[sortCol];
    if (!getter) return enriched;
    return enriched.sort((a: any, b: any) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [campaigns, search, statusFilter, typeFilter, salesMetrics, days, sortCol, sortDir]);

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
                          <SortTh col="name" label="Campanha" align="left" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          {visibleColumns.includes("type") && (
                            <SortTh col="type" label="Tipo" align="left" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("status") && (
                            <SortTh col="status" label="Status" align="left" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("budget") && (
                            <SortTh col="budget" label="Orçamento" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("spend") && (
                            <SortTh col="spend" label="Investimento" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("sales") && (
                            <SortTh col="sales" label="Vendas" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("revenue") && (
                            <SortTh col="revenue" label="Receita" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("cpa") && (
                            <SortTh col="cpa" label="CPA Real" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("lucro") && (
                            <SortTh col="lucro" label="Lucro" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("roas") && (
                            <SortTh col="roas" label="ROAS" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("roi") && (
                            <SortTh col="roi" label="ROI" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("impressions") && (
                            <SortTh col="impressions" label="Impressões" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("clicks") && (
                            <SortTh col="clicks" label="Cliques" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("ctr") && (
                            <SortTh col="ctr" label="CTR" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          {visibleColumns.includes("cpc") && (
                            <SortTh col="cpc" label="CPC" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                          )}
                          <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c: any) => {
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
                                <td className={cellCls}>{formatBRL(c._m.spend)}</td>
                              )}
                              {visibleColumns.includes("sales") && (
                                <td className={cn(cellCls, "font-medium text-t1")}>
                                  {c._sm.sales}
                                  {c._sm.refunds > 0 && <span className="text-destructive text-xs ml-1">(-{c._sm.refunds})</span>}
                                </td>
                              )}
                              {visibleColumns.includes("revenue") && (
                                <td className={cn(cellCls, "font-medium text-success")}>{formatBRL(c._netRevenue)}</td>
                              )}
                              {visibleColumns.includes("cpa") && (
                                <td className={cellCls}>
                                  {c._sm.sales > 0 ? formatBRL(c._cpa) : "—"}
                                </td>
                              )}
                              {visibleColumns.includes("lucro") && (
                                <td className={cn(cellCls, "font-medium", c._profit >= 0 ? "text-success" : "text-destructive")}>
                                  {formatBRL(c._profit)}
                                </td>
                              )}
                              {visibleColumns.includes("roas") && (
                                <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                                  <RoasValue value={c._roas} />
                                </td>
                              )}
                              {visibleColumns.includes("roi") && (
                                <td className={cn(cellCls, "font-medium", c._roi >= 0 ? "text-success" : "text-destructive")}>
                                  {c._roi.toFixed(0)}%
                                </td>
                              )}
                              {visibleColumns.includes("impressions") && (
                                <td className={cellCls}>{formatCompact(c._m.impressions)}</td>
                              )}
                              {visibleColumns.includes("clicks") && (
                                <td className={cellCls}>{formatNumber(c._m.clicks)}</td>
                              )}
                              {visibleColumns.includes("ctr") && (
                                <td className={cellCls}>{c._ctr.toFixed(2)}%</td>
                              )}
                              {visibleColumns.includes("cpc") && (
                                <td className={cellCls}>{formatBRL(c._cpc)}</td>
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

              {/* ─── Totals Summary ─── */}
              {filtered.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {(() => {
                    const totals = filtered.reduce((acc: any, c: any) => ({
                      spend: acc.spend + c._m.spend,
                      sales: acc.sales + c._sm.sales,
                      refunds: acc.refunds + c._sm.refunds,
                      revenue: acc.revenue + c._netRevenue,
                      profit: acc.profit + c._profit,
                      impressions: acc.impressions + c._m.impressions,
                      clicks: acc.clicks + c._m.clicks,
                    }), { spend: 0, sales: 0, refunds: 0, revenue: 0, profit: 0, impressions: 0, clicks: 0 });
                    const tRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
                    const tCpa = totals.sales > 0 ? totals.spend / totals.sales : 0;
                    const tCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
                    return (
                      <>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">Investimento</div>
                          <div className="text-lg font-semibold text-t1 mt-1">{formatBRL(totals.spend)}</div>
                        </div>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">Vendas</div>
                          <div className="text-lg font-semibold text-t1 mt-1">
                            {totals.sales}
                            {totals.refunds > 0 && <span className="text-destructive text-sm ml-1">(-{totals.refunds})</span>}
                          </div>
                        </div>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">Receita</div>
                          <div className="text-lg font-semibold text-success mt-1">{formatBRL(totals.revenue)}</div>
                        </div>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">Lucro</div>
                          <div className={cn("text-lg font-semibold mt-1", totals.profit >= 0 ? "text-success" : "text-destructive")}>
                            {formatBRL(totals.profit)}
                          </div>
                        </div>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">ROAS</div>
                          <div className="mt-1"><RoasValue value={tRoas} /></div>
                        </div>
                        <div className="bg-s1 border border-border rounded-lg p-3">
                          <div className="text-xs text-t4 uppercase tracking-wide">CPA Real</div>
                          <div className="text-lg font-semibold text-t1 mt-1">{totals.sales > 0 ? formatBRL(tCpa) : "—"}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
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
