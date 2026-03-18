"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { KPICard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Globe, Plus, ExternalLink, Eye, MousePointer, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
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

  // Aggregate totals
  const allMetrics = pages?.flatMap((p: any) => p.page_metrics_daily || []) || [];
  const totalVisitors = allMetrics.reduce((s: number, m: any) => s + (m.visitors || 0), 0);
  const totalPageViews = allMetrics.reduce((s: number, m: any) => s + (m.page_views || 0), 0);
  const totalFormSubmissions = allMetrics.reduce((s: number, m: any) => s + (m.form_submissions || 0), 0);
  const avgConversion = totalVisitors > 0 ? (totalFormSubmissions / totalVisitors) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landing Pages"
        description="Métricas de visitantes, conversão e bounce das suas landing pages"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Landing Page
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Visitantes" value={formatCompact(totalVisitors)} delay={0} icon={<Eye className="h-4 w-4" />} />
        <KPICard title="Page Views" value={formatCompact(totalPageViews)} delay={1} icon={<Globe className="h-4 w-4" />} />
        <KPICard title="Conversões" value={String(totalFormSubmissions)} delay={2} icon={<MousePointer className="h-4 w-4" />} />
        <KPICard title="Taxa Conversão" value={`${avgConversion.toFixed(1)}%`} delay={3} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Página de Vendas v1" /></div>
            <div className="flex-1 space-y-2"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://meusite.com/vendas" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim() || !form.url.trim()}>Cadastrar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {pages && pages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page: any, idx: number) => {
            const metrics = page.page_metrics_daily || [];
            const latestMetrics = metrics[0];
            const totalVisits = metrics.reduce((s: number, m: any) => s + (m.visitors || 0), 0);
            return (
              <motion.div key={page.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="surface-glow hover:surface-glow-hover transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Globe className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="text-sm font-semibold truncate">{page.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={page.status === "active" ? "active" : "paused"} />
                        {page.url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(page.url, "_blank")}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-3">{page.url}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Visitantes</p>
                        <p className="text-xs font-mono font-semibold">{formatCompact(totalVisits)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Conversão</p>
                        <p className="text-xs font-mono font-semibold">{(latestMetrics?.conversion_rate || 0).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Bounce</p>
                        <p className="text-xs font-mono font-semibold">{(latestMetrics?.bounce_rate || 0).toFixed(1)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="surface-glow">
          <CardContent className="py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma landing page cadastrada.</p>
            <p className="text-xs text-muted-foreground mt-1">Cadastre suas páginas para rastrear visitantes e conversões automaticamente.</p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Landing Page
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
