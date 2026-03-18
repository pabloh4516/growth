"use client";

import { useState, useMemo } from "react";
import { useSearchTerms } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber } from "@/lib/utils";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "term",
    header: "Termo de Busca",
    cell: ({ row }) => <span className="font-medium text-t1">{row.original.term}</span>,
  },
  {
    accessorKey: "impressions",
    header: "Impressões",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatNumber(row.original.impressions || 0)}</span>,
  },
  {
    accessorKey: "clicks",
    header: "Cliques",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatNumber(row.original.clicks || 0)}</span>,
  },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{(row.original.ctr || 0).toFixed(2)}%</span>,
  },
  {
    accessorKey: "cost",
    header: "Custo",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{formatBRL(row.original.cost || 0)}</span>,
  },
  {
    accessorKey: "conversions",
    header: "Conv.",
    cell: ({ row }) => <span className="font-mono text-sm text-t2">{row.original.conversions || 0}</span>,
  },
  {
    accessorKey: "suggested_action",
    header: "Ação Sugerida",
    cell: ({ row }) => {
      const action = row.original.suggested_action;
      if (!action) return <span className="text-t3">—</span>;
      const variant = action === "negate" ? "review" : action === "promote" ? "active" : "paused";
      return <StatusPill variant={variant} label={action} />;
    },
  },
];

type TabFilter = "all" | "high-intent" | "brand" | "long-tail";

function classifyTerm(term: string): { highIntent: boolean; brand: boolean; longTail: boolean } {
  const words = term.trim().split(/\s+/);
  const lowerTerm = term.toLowerCase();
  const highIntentKeywords = ["comprar", "preço", "desconto", "cupom", "buy", "price", "oferta", "promoção", "melhor", "como"];
  const highIntent = highIntentKeywords.some((kw) => lowerTerm.includes(kw));
  const brand = /^[A-Z]/.test(term) && words.length <= 2;
  const longTail = words.length >= 4;
  return { highIntent, brand, longTail };
}

export default function SearchTermsPage() {
  const { data: terms, isLoading } = useSearchTerms();
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  const filteredTerms = useMemo(() => {
    if (!terms) return [];
    if (activeTab === "all") return terms;
    return terms.filter((t: any) => {
      const cls = classifyTerm(t.term || "");
      if (activeTab === "high-intent") return cls.highIntent;
      if (activeTab === "brand") return cls.brand;
      if (activeTab === "long-tail") return cls.longTail;
      return true;
    });
  }, [terms, activeTab]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Tab filters */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
        <TabsList>
          <TabsTrigger value="all">
            Todos
            <span className="ml-1.5 text-2xs bg-s3 text-t2 px-1.5 py-0.5 rounded-[5px] font-medium">
              {terms?.length ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="high-intent">High intent</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="long-tail">Long-tail</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Data table */}
      {filteredTerms.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <DataTable data={filteredTerms} columns={columns} searchPlaceholder="Buscar termos..." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon="🔍"
              title="Nenhum termo encontrado"
              subtitle={activeTab !== "all" ? "Tente outro filtro ou aguarde a sincronização." : "Os termos de busca aparecerão após a primeira sincronização do Google Ads."}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
