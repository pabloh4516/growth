"use client";

import { useState, useMemo } from "react";
import { useSearchTerms, useCampaigns, useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { StatusPill } from "@/components/shared/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, MousePointerClick, DollarSign, Target, TrendingUp, TrendingDown, AlertTriangle, Sparkles } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

// ─── Helpers ─────────────────────────────────────────

const HIGH_INTENT_WORDS = [
  "comprar", "preço", "preco", "desconto", "cupom", "buy", "price",
  "oferta", "promoção", "promocao", "melhor", "como", "quanto custa",
  "vale a pena", "funciona", "é bom", "assinatura", "plano",
];

function classifyTerm(term: string) {
  const words = term.trim().split(/\s+/);
  const lower = term.toLowerCase();
  const highIntent = HIGH_INTENT_WORDS.some((kw) => lower.includes(kw));
  const brand = /^[A-Z]/.test(term) && words.length <= 2;
  const longTail = words.length >= 4;
  return { highIntent, brand, longTail };
}

function getIntentBadge(term: string) {
  const cls = classifyTerm(term);
  if (cls.highIntent) return { label: "Alta intencao", color: "bg-success/15 text-success border-success/30" };
  if (cls.brand) return { label: "Marca", color: "bg-blue-500/15 text-blue-500 border-blue-500/30" };
  if (cls.longTail) return { label: "Long-tail", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" };
  return null;
}

// ─── Columns ─────────────────────────────────────────

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "term",
    header: "Termo de Busca",
    cell: ({ row }) => {
      const badge = getIntentBadge(row.original.term || "");
      return (
        <div className="max-w-[320px]">
          <span className="font-medium text-t1">{row.original.term}</span>
          {row.original.campaign_name && row.original.campaign_name !== "—" && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{row.original.campaign_name}</p>
          )}
          {badge && (
            <Badge variant="outline" className={`mt-1 text-[10px] ${badge.color}`}>
              {badge.label}
            </Badge>
          )}
        </div>
      );
    },
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
      const ctr = row.original.ctr || 0;
      return <span className="font-mono text-sm text-t2">{ctr.toFixed(2)}%</span>;
    },
    meta: { className: "text-right hidden lg:table-cell" },
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
  {
    accessorKey: "suggested_action",
    header: "Acao",
    cell: ({ row }) => {
      const action = row.original.suggested_action;
      if (!action) return <span className="text-muted-foreground text-xs">—</span>;
      if (action === "promote") {
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
            Promover
          </Badge>
        );
      }
      if (action === "negate") {
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
            Negativar
          </Badge>
        );
      }
      return <StatusPill variant="paused" label={action} />;
    },
  },
];

// ─── Page ─────────────────────────────────────────

type ViewTab = "all" | "converters" | "promote" | "negate" | "high-intent" | "long-tail" | "wasted";

export default function SearchTermsPage() {
  const { data: terms, isLoading } = useSearchTerms();
  const { data: campaigns } = useCampaigns();
  const { data: adAccounts } = useAdAccounts();

  const [accountFilter, setAccountFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [view, setView] = useState<ViewTab>("all");

  // Campaign name map
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

  // Filtered & enriched terms
  const filtered = useMemo(() => {
    if (!terms) return [];
    return terms
      .filter((t: any) => {
        if (accountFilter !== "all" && t.ad_account_id !== accountFilter) return false;
        if (campaignFilter !== "all" && t.campaign_id !== campaignFilter) return false;

        if (view === "converters") return (t.conversions || 0) > 0;
        if (view === "promote") return t.suggested_action === "promote";
        if (view === "negate") return t.suggested_action === "negate";
        if (view === "high-intent") return classifyTerm(t.term || "").highIntent;
        if (view === "long-tail") return classifyTerm(t.term || "").longTail;
        if (view === "wasted") return (t.cost || 0) > 10 && (t.conversions || 0) === 0;

        return true;
      })
      .map((t: any) => ({
        ...t,
        campaign_name: campaignMap[t.campaign_id] || "—",
      }));
  }, [terms, accountFilter, campaignFilter, view, campaignMap]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const impressions = filtered.reduce((s: number, t: any) => s + (t.impressions || 0), 0);
    const clicks = filtered.reduce((s: number, t: any) => s + (t.clicks || 0), 0);
    const cost = filtered.reduce((s: number, t: any) => s + (t.cost || 0), 0);
    const conversions = filtered.reduce((s: number, t: any) => s + (t.conversions || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = conversions > 0 ? cost / conversions : 0;
    const withConv = filtered.filter((t: any) => (t.conversions || 0) > 0).length;
    const toPromote = filtered.filter((t: any) => t.suggested_action === "promote").length;
    const toNegate = filtered.filter((t: any) => t.suggested_action === "negate").length;
    const wasted = filtered
      .filter((t: any) => (t.cost || 0) > 10 && (t.conversions || 0) === 0)
      .reduce((s: number, t: any) => s + (t.cost || 0), 0);

    return { total, impressions, clicks, cost, conversions, ctr, cpa, withConv, toPromote, toNegate, wasted };
  }, [filtered]);

  // Top converting terms for highlight
  const topConverters = useMemo(() => {
    if (!terms) return [];
    return [...(terms || [])]
      .filter((t: any) => (t.conversions || 0) > 0)
      .sort((a: any, b: any) => (b.conversions || 0) - (a.conversions || 0))
      .slice(0, 5);
  }, [terms]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-t1">Termos de Pesquisa</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Descubra o que as pessoas realmente buscam para encontrar seus anuncios e identifique oportunidades de novas keywords
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <KPICard
          title="Total de Termos"
          value={formatNumber(kpis.total)}
          subtitle={`${kpis.withConv} com conversao`}
          icon={<Search className="h-4 w-4" />}
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
          icon={<DollarSign className="h-4 w-4" />}
          delay={2}
          size="sm"
        />
        <KPICard
          title="Conversoes"
          value={formatNumber(kpis.conversions)}
          subtitle={kpis.cpa > 0 ? `CPA med. ${formatBRL(kpis.cpa)}` : "Sem conv."}
          icon={<Target className="h-4 w-4" />}
          delay={3}
          size="sm"
        />
        <KPICard
          title="Oportunidades"
          value={`${kpis.toPromote}`}
          subtitle={`${kpis.toNegate} para negativar`}
          icon={<Sparkles className="h-4 w-4" />}
          delay={4}
          size="sm"
        />
      </div>

      {/* Top converters + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top converting terms */}
        {topConverters.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-success" />
                <h3 className="text-sm font-semibold text-t1">Top termos que convertem</h3>
              </div>
              <div className="space-y-2">
                {topConverters.map((t: any, i: number) => {
                  const cpa = t.conversions > 0 ? t.cost / t.conversions : 0;
                  return (
                    <div key={t.id || i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                        <span className="text-sm font-medium text-t1 truncate">{t.term}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-success font-semibold">{t.conversions} conv.</span>
                        <span className="text-xs font-mono text-muted-foreground">CPA {formatBRL(cpa)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wasted spend alert */}
        {kpis.wasted > 50 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-t1">Gasto sem retorno</h3>
              </div>
              <p className="text-sm text-t2 mb-2">
                <strong className="text-amber-500">{formatBRL(kpis.wasted)}</strong> gastos em termos de busca que nao geraram nenhuma conversao.
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {kpis.toNegate} termos sugeridos para negativar — adicione como palavras-chave negativas para parar de gastar.
              </p>
              <button
                onClick={() => setView("negate")}
                className="text-xs text-primary font-medium underline underline-offset-2 hover:text-primary/80"
              >
                Ver termos para negativar
              </button>
            </CardContent>
          </Card>
        )}

        {/* Promote suggestions */}
        {kpis.toPromote > 0 && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-success" />
                <h3 className="text-sm font-semibold text-t1">Novas keywords sugeridas</h3>
              </div>
              <p className="text-sm text-t2 mb-2">
                <strong className="text-success">{kpis.toPromote} termos</strong> com bom CPA que podem ser adicionados como palavras-chave exatas para melhor controle.
              </p>
              <button
                onClick={() => setView("promote")}
                className="text-xs text-primary font-medium underline underline-offset-2 hover:text-primary/80"
              >
                Ver sugestoes
              </button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">
          {([
            { key: "all", label: "Todos" },
            { key: "converters", label: "Com Conversao" },
            { key: "promote", label: "Promover" },
            { key: "negate", label: "Negativar" },
            { key: "high-intent", label: "Alta Intencao" },
            { key: "long-tail", label: "Long-tail" },
            { key: "wasted", label: "Sem Retorno" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={filtered}
            columns={columns}
            searchPlaceholder="Buscar termos de pesquisa..."
            pageSize={25}
          />
        </CardContent>
      </Card>
    </div>
  );
}
