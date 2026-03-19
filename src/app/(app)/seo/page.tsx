"use client";

import { useState } from "react";
import { useSEOKeywords } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { syncSearchConsole } from "@/lib/services/edge-functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
  const avgCtr = list.length > 0
    ? list.reduce((s: number, k: any) => s + (k.ctr || 0), 0) / list.length
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
          <MetricCard label="Posicao Media" value={avgPosition > 0 ? avgPosition.toFixed(1) : "\u2014"} gradient="amber" />
          <MetricCard label="Top 3" value={String(top3Count)} gradient="green" />
        </div>
      )}

      {/* Table */}
      {list.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Keywords Organicas</CardTitle>
              <span className="text-sm text-t3">{list.length} keywords</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Keyword</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Posicao</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Impressoes</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CTR</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((kw: any, i: number) => {
                    const pos = kw.position || 0;
                    return (
                      <tr key={kw.id || i} className="group">
                        <td className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[250px] truncate">
                          {kw.keyword}
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-right font-mono font-bold group-hover:bg-s2 transition-colors px-1">
                          <span className={cn(
                            pos <= 3 ? "text-success" : pos <= 10 ? "text-warning" : "text-t3"
                          )}>
                            {pos > 0 ? pos : "\u2014"}
                          </span>
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                          {formatCompact(kw.impressions || 0)}
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                          {kw.clicks || 0}
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                          {(kw.ctr || 0).toFixed(2)}%
                        </td>
                        <td className="py-2.5 border-b border-border text-xs text-t3 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell max-w-[200px] truncate">
                          {kw.url || "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="\ud83d\udd0e"
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
