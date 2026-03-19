"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatCompact } from "@/lib/utils";

const supabase = createClient();

export default function LandingPagesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", url: "" });

  const { data: pages, isLoading } = useQuery({
    queryKey: ["landing-pages", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("landing_pages").select("*, page_metrics_daily(*)").eq("organization_id", orgId!).order("created_at", { ascending: false });
      return data;
    },
    enabled: !!orgId,
  });

  const handleCreate = async () => {
    if (!orgId || !form.name.trim() || !form.url.trim()) return;
    const { error } = await supabase.from("landing_pages").insert({
      organization_id: orgId,
      name: form.name.trim(),
      url: form.url.trim(),
      status: "active",
    });
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Landing page cadastrada!");
      setForm({ name: "", url: "" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["landing-pages"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const list = pages || [];

  // Aggregate totals
  const allMetrics = list.flatMap((p: any) => p.page_metrics_daily || []);
  const totalVisitors = allMetrics.reduce((s: number, m: any) => s + (m.visitors || 0), 0);
  const totalPageViews = allMetrics.reduce((s: number, m: any) => s + (m.page_views || 0), 0);
  const totalFormSubmissions = allMetrics.reduce((s: number, m: any) => s + (m.form_submissions || 0), 0);
  const avgConversion = totalVisitors > 0 ? (totalFormSubmissions / totalVisitors) * 100 : 0;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Landing Pages</h1>
          <p className="text-sm text-t3">Metricas de visitantes, conversao e bounce</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova Landing Page
        </Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Visitantes" value={formatCompact(totalVisitors)} gradient="purple" />
          <MetricCard label="Page Views" value={formatCompact(totalPageViews)} gradient="blue" />
          <MetricCard label="Conversoes" value={String(totalFormSubmissions)} gradient="green" />
          <MetricCard label="Taxa Conversao" value={`${avgConversion.toFixed(1)}%`} gradient="amber" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pagina de Vendas v1" /></div>
            <div className="flex-1 space-y-2"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://meusite.com/vendas" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim() || !form.url.trim()}>Cadastrar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {list.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Paginas Cadastradas</CardTitle>
              <span className="text-sm text-t3">{list.length} paginas</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Nome</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Visitantes</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Conversao</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Bounce</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((page: any) => {
                    const metrics = page.page_metrics_daily || [];
                    const latestMetrics = metrics[0];
                    const totalVisits = metrics.reduce((s: number, m: any) => s + (m.visitors || 0), 0);
                    return (
                      <tr key={page.id} className="group">
                        <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                          <div className="text-sm font-medium text-t1 truncate max-w-[200px]">{page.name}</div>
                          <div className="text-xs text-t3 truncate max-w-[200px]">{page.url}</div>
                        </td>
                        <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                          <StatusPill variant={page.status === "active" ? "active" : "paused"} />
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                          {formatCompact(totalVisits)}
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                          {(latestMetrics?.conversion_rate || 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                          {(latestMetrics?.bounce_rate || 0).toFixed(1)}%
                        </td>
                        <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                          {page.url && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(page.url, "_blank")}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
              icon="\ud83c\udf10"
              title="Nenhuma landing page cadastrada"
              subtitle="Cadastre suas paginas para rastrear visitantes e conversoes automaticamente."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Cadastrar Landing Page
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
