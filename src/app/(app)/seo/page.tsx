"use client";

import { useState } from "react";
import { useSEOKeywords } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { syncSearchConsole } from "@/lib/services/edge-functions";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "keyword", header: "Keyword", cell: ({ row }) => <span className="font-medium text-t1 max-w-[250px] truncate block">{row.original.keyword}</span> },
  {
    accessorKey: "position",
    header: "Posicao",
    cell: ({ row }) => {
      const pos = row.original.position || 0;
      return (
        <span className={cn("font-mono font-bold", pos <= 3 ? "text-success" : pos <= 10 ? "text-warning" : "text-t3")}>
          {pos > 0 ? pos : "—"}
        </span>
      );
    },
  },
  { accessorKey: "impressions", header: "Impressoes", cell: ({ row }) => <span className="font-mono">{formatCompact(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono">{row.original.clicks || 0}</span> },
  { accessorKey: "ctr", header: "CTR", cell: ({ row }) => <span className="font-mono">{(row.original.ctr || 0).toFixed(2)}%</span> },
  { accessorKey: "url", header: "URL", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-t3 max-w-[200px] truncate block">{row.original.url || "—"}</span> },
];

export default function SEOPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: keywords, isLoading } = useSEOKeywords();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      await syncSearchConsole(orgId);
      toast.success("Search Console sincronizado!");
      queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const list = keywords || [];
  const totalClicks = list.reduce((s: number, k: any) => s + (k.clicks || 0), 0);
  const totalImpressions = list.reduce((s: number, k: any) => s + (k.impressions || 0), 0);
  const avgPosition = list.length > 0
    ? list.reduce((s: number, k: any) => s + (k.position || 0), 0) / list.length
    : 0;
  const top3Count = list.filter((k: any) => (k.position || 0) <= 3 && k.position > 0).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">SEO Monitor</h1>
          <p className="text-sm text-t3">Acompanhe rankings, impressoes e cliques organicos</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          Sync Search Console
        </Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard label="Keywords" value={String(list.length)} gradient="purple" />
          <MetricCard label="Cliques" value={formatCompact(totalClicks)} gradient="green" />
          <MetricCard label="Impressoes" value={formatCompact(totalImpressions)} gradient="blue" />
          <MetricCard label="Posicao Media" value={avgPosition > 0 ? avgPosition.toFixed(1) : "—"} gradient="amber" />
          <MetricCard label="Top 3" value={String(top3Count)} gradient="green" />
        </div>
      )}

      {/* Table */}
      {list.length > 0 ? (
        <DataTable data={list} columns={columns} searchPlaceholder="Buscar keyword..." />
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="🔎"
              title="Nenhuma keyword rastreada"
              subtitle="Conecte o Google Search Console para monitorar seus rankings organicos."
              action={
                <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizar Search Console
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
