"use client";

import { useState, useMemo } from "react";
import { useKeywords, useCampaigns, useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, KeyRound, MousePointerClick, DollarSign, Target, TrendingUp, AlertTriangle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

// ─── Helpers ─────────────────────────────────────────

function getQSColor(qs: number) {
  if (qs >= 7) return "text-success";
  if (qs >= 5) return "text-amber-500";
  return "text-destructive";
}

function getQSBgColor(qs: number) {
  if (qs >= 7) return "bg-success";
  if (qs >= 5) return "bg-amber-500";
  return "bg-destructive";
}

const matchMap: Record<string, string> = { EXACT: "Exata", PHRASE: "Frase", BROAD: "Ampla" };
const matchVariant: Record<string, "default" | "secondary" | "outline"> = {
  EXACT: "default",
  PHRASE: "secondary",
  BROAD: "outline",
};

// ─── Columns ─────────────────────────────────────────

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "keyword_text",
    header: "Palavra-chave",
    cell: ({ row }) => (
      <div className="max-w-[280px]">
        <span className="font-medium text-t1">{row.original.keyword_text || row.original.text}</span>
        {row.original.ad_group_name && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{row.original.ad_group_name}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: "match_type",
    header: "Tipo",
    cell: ({ row }) => {
      const mt = row.original.match_type || "BROAD";
      return <Badge variant={matchVariant[mt] || "outline"}>{matchMap[mt] || mt}</Badge>;
    },
    meta: { className: "hidden sm:table-cell" },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status;
      return (
        <Badge variant={s === "active" ? "default" : "secondary"} className={s === "active" ? "bg-success/15 text-success border-success/30" : ""}>
          {s === "active" ? "Ativa" : "Pausada"}
        </Badge>
      );
    },
    meta: { className: "hidden lg:table-cell" },
  },
  {
    accessorKey: "quality_score",
    header: "QS",
    cell: ({ row }) => {
      const qs = row.original.quality_score;
      if (!qs) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-[40px] h-[4px] bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${getQSBgColor(qs)}`} style={{ width: `${(qs / 10) * 100}%` }} />
          </div>
          <span className={`text-xs font-mono font-semibold ${getQSColor(qs)}`}>{qs}</span>
        </div>
      );
    },
    meta: { className: "hidden md:table-cell" },
  },
  {
    accessorKey: "impressions",
    header: "Impressoes",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatCompact(row.original.impressions || 0)}</span>,
    meta: { className: "text-right hidden md:table-cell" },
  },
  {
    accessorKey: "clicks",
    header: "Cliques",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatNumber(row.original.clicks || 0)}</span>,
    meta: { className: "text-right" },
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ row }) => {
      const imp = row.original.impressions || 0;
      const cl = row.original.clicks || 0;
      const ctr = imp > 0 ? (cl / imp) * 100 : 0;
      return <span className="font-mono text-sm text-t2">{ctr.toFixed(2)}%</span>;
    },
    meta: { className: "text-right hidden lg:table-cell" },
    sortingFn: (rowA, rowB) => {
      const ctrA = (rowA.original as any).impressions > 0 ? (rowA.original as any).clicks / (rowA.original as any).impressions : 0;
      const ctrB = (rowB.original as any).impressions > 0 ? (rowB.original as any).clicks / (rowB.original as any).impressions : 0;
      return ctrA - ctrB;
    },
  },
  {
    accessorKey: "cpc",
    header: "CPC",
    cell: ({ row }) => {
      const cl = row.original.clicks || 0;
      const cost = row.original.cost || 0;
      const cpc = cl > 0 ? cost / cl : 0;
      return <span className="font-mono text-sm text-t2">{formatBRL(cpc)}</span>;
    },
    meta: { className: "text-right hidden lg:table-cell" },
    sortingFn: (rowA, rowB) => {
      const cpcA = (rowA.original as any).clicks > 0 ? (rowA.original as any).cost / (rowA.original as any).clicks : 0;
      const cpcB = (rowB.original as any).clicks > 0 ? (rowB.original as any).cost / (rowB.original as any).clicks : 0;
      return cpcA - cpcB;
    },
  },
  {
    accessorKey: "cost",
    header: "Custo",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatBRL(row.original.cost || 0)}</span>,
    meta: { className: "text-right" },
  },
  {
    accessorKey: "conversions",
    header: "Conv.",
    cell: ({ row }) => {
      const conv = row.original.conversions || 0;
      return (
        <span className={`font-mono text-sm font-semibold ${conv > 0 ? "text-success" : "text-muted-foreground"}`}>
          {conv}
        </span>
      );
    },
    meta: { className: "text-right" },
  },
  {
    accessorKey: "cpa",
    header: "CPA",
    cell: ({ row }) => {
      const conv = row.original.conversions || 0;
      const cost = row.original.cost || 0;
      if (conv === 0) return <span className="text-muted-foreground">—</span>;
      return <span className="font-mono text-sm text-t2">{formatBRL(cost / conv)}</span>;
    },
    meta: { className: "text-right hidden xl:table-cell" },
    sortingFn: (rowA, rowB) => {
      const cpaA = (rowA.original as any).conversions > 0 ? (rowA.original as any).cost / (rowA.original as any).conversions : Infinity;
      const cpaB = (rowB.original as any).conversions > 0 ? (rowB.original as any).cost / (rowB.original as any).conversions : Infinity;
      return cpaA - cpaB;
    },
  },
];

// ─── Page ─────────────────────────────────────────

export default function KeywordsPage() {
  const { data: keywords, isLoading } = useKeywords();
  const { data: campaigns } = useCampaigns();
  const { data: adAccounts } = useAdAccounts();

  const [accountFilter, setAccountFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [view, setView] = useState<"all" | "top-converters" | "low-qs" | "wasted">("all");

  // Build campaign name map
  const campaignMap = useMemo(() => {
    const map: Record<string, string> = {};
    (campaigns || []).forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [campaigns]);

  // Filter campaigns by selected account
  const filteredCampaignOptions = useMemo(() => {
    if (!campaigns) return [];
    if (accountFilter === "all") return campaigns;
    return campaigns.filter((c: any) => c.ad_account_id === accountFilter);
  }, [campaigns, accountFilter]);

  // Filtered keywords
  const filtered = useMemo(() => {
    if (!keywords) return [];
    return keywords.filter((kw: any) => {
      if (accountFilter !== "all" && kw.ad_account_id !== accountFilter) return false;
      if (campaignFilter !== "all" && kw.campaign_id !== campaignFilter) return false;
      if (statusFilter !== "all" && kw.status !== statusFilter) return false;
      if (matchFilter !== "all" && kw.match_type !== matchFilter) return false;

      if (view === "top-converters") return (kw.conversions || 0) > 0;
      if (view === "low-qs") return kw.quality_score != null && kw.quality_score < 5;
      if (view === "wasted") return (kw.cost || 0) > 10 && (kw.conversions || 0) === 0;

      return true;
    });
  }, [keywords, accountFilter, campaignFilter, statusFilter, matchFilter, view]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const impressions = filtered.reduce((s: number, k: any) => s + (k.impressions || 0), 0);
    const clicks = filtered.reduce((s: number, k: any) => s + (k.clicks || 0), 0);
    const cost = filtered.reduce((s: number, k: any) => s + (k.cost || 0), 0);
    const conversions = filtered.reduce((s: number, k: any) => s + (k.conversions || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const cpa = conversions > 0 ? cost / conversions : 0;
    const avgQS = (() => {
      const withQS = filtered.filter((k: any) => k.quality_score != null);
      if (withQS.length === 0) return 0;
      return withQS.reduce((s: number, k: any) => s + k.quality_score, 0) / withQS.length;
    })();
    const lowQS = filtered.filter((k: any) => k.quality_score != null && k.quality_score < 5).length;
    const wasted = filtered.filter((k: any) => (k.cost || 0) > 10 && (k.conversions || 0) === 0)
      .reduce((s: number, k: any) => s + (k.cost || 0), 0);

    return { total, impressions, clicks, cost, conversions, ctr, cpc, cpa, avgQS, lowQS, wasted };
  }, [filtered]);

  // Enrich keywords with campaign name for display
  const enriched = useMemo(() => {
    return filtered.map((kw: any) => ({
      ...kw,
      campaign_name: campaignMap[kw.campaign_id] || "—",
    }));
  }, [filtered, campaignMap]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-t1">Palavras-chave</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Analise o desempenho de todas as palavras-chave das suas campanhas de rede de pesquisa
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <KPICard
          title="Total Keywords"
          value={formatNumber(kpis.total)}
          icon={<KeyRound className="h-4 w-4" />}
          delay={0}
          size="sm"
        />
        <KPICard
          title="Cliques"
          value={formatCompact(kpis.clicks)}
          subtitle={`CTR ${kpis.ctr.toFixed(2)}%`}
          icon={<MousePointerClick className="h-4 w-4" />}
          delay={1}
          size="sm"
        />
        <KPICard
          title="Custo Total"
          value={formatBRL(kpis.cost)}
          subtitle={`CPC med. ${formatBRL(kpis.cpc)}`}
          icon={<DollarSign className="h-4 w-4" />}
          delay={2}
          size="sm"
        />
        <KPICard
          title="Conversoes"
          value={formatNumber(kpis.conversions)}
          subtitle={kpis.cpa > 0 ? `CPA ${formatBRL(kpis.cpa)}` : "Sem conv."}
          icon={<Target className="h-4 w-4" />}
          delay={3}
          size="sm"
        />
        <KPICard
          title="Quality Score Med."
          value={kpis.avgQS.toFixed(1)}
          subtitle={kpis.lowQS > 0 ? `${kpis.lowQS} com QS baixo` : "Nenhum QS baixo"}
          icon={<TrendingUp className="h-4 w-4" />}
          delay={4}
          size="sm"
        />
      </div>

      {/* Alerta de gasto desperdicado */}
      {kpis.wasted > 50 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-t2">
              <strong className="text-amber-500">{formatBRL(kpis.wasted)}</strong> gastos em keywords sem nenhuma conversao.
              <button
                onClick={() => setView("wasted")}
                className="ml-1 text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Ver keywords
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {([
            { key: "all", label: "Todas" },
            { key: "top-converters", label: "Top Conversoras" },
            { key: "low-qs", label: "QS Baixo" },
            { key: "wasted", label: "Sem Conversao" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === tab.key
                  ? "bg-background text-t1 shadow-sm"
                  : "text-muted-foreground hover:text-t2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Account filter */}
        {adAccounts && adAccounts.length > 1 && (
          <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setCampaignFilter("all"); }}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {adAccounts.map((acc: any) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.account_name || acc.account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Campaign filter */}
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[200px] h-9 text-xs">
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {filteredCampaignOptions.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
          </SelectContent>
        </Select>

        {/* Match type filter */}
        <Select value={matchFilter} onValueChange={setMatchFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="EXACT">Exata</SelectItem>
            <SelectItem value="PHRASE">Frase</SelectItem>
            <SelectItem value="BROAD">Ampla</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={enriched}
            columns={columns}
            searchPlaceholder="Buscar palavra-chave..."
            pageSize={25}
          />
        </CardContent>
      </Card>
    </div>
  );
}
