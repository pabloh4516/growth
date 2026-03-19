"use client";

import { useState } from "react";
import { useCompetitors } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ExternalLink, Brain } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatBRL, formatCompact } from "@/lib/utils";

const supabase = createClient();

export default function CompetitorsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: competitors, isLoading } = useCompetitors();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "" });

  const handleCreate = async () => {
    if (!orgId || !form.name.trim()) return;
    const { error } = await supabase.from("competitors").insert({
      organization_id: orgId,
      name: form.name.trim(),
      domain: form.domain.trim(),
    });
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Competidor adicionado!");
      setForm({ name: "", domain: "" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const list = competitors || [];
  const totalAnalyses = list.reduce((s: number, c: any) => s + (c.competitor_ads?.length || 0), 0);
  const withDomain = list.filter((c: any) => c.domain).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Competidores</h1>
          <p className="text-sm text-t3">Monitore a estrategia de anuncios dos seus competidores</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              toast.info("Analisando competidores com IA...");
              const { analyzeCompetitors } = await import("@/lib/services/edge-functions");
              await analyzeCompetitors();
              toast.success("Analise concluida!");
              queryClient.invalidateQueries({ queryKey: ["competitors"] });
            } catch (err: any) { toast.error("Erro na analise", { description: err?.message }); }
          }}>
            <Brain className="h-4 w-4 mr-2" />
            Analisar com IA
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
        </div>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard label="Competidores" value={String(list.length)} gradient="purple" />
          <MetricCard label="Com Dominio" value={String(withDomain)} gradient="blue" />
          <MetricCard label="Analises" value={String(totalAnalyses)} gradient="green" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Concorrente X" /></div>
            <div className="flex-1 space-y-2"><Label>Dominio</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="concorrente.com.br" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Adicionar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {list.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Monitoramento</CardTitle>
              <span className="text-sm text-t3">{list.length} competidores</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Nome</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Dominio</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Analises</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Ultima Observacao</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((comp: any) => (
                    <tr key={comp.id} className="group">
                      <td className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1">
                        {comp.name}
                      </td>
                      <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1">
                        {comp.domain || "\u2014"}
                      </td>
                      <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                        {comp.competitor_ads?.length || 0}
                      </td>
                      <td className="py-2.5 border-b border-border text-xs text-t3 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell max-w-[250px] truncate">
                        {comp.competitor_ads?.length > 0
                          ? comp.competitor_ads[comp.competitor_ads.length - 1]?.description || comp.notes || "\u2014"
                          : comp.notes || "\u2014"}
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        {comp.domain && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(`https://${comp.domain}`, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="\ud83d\udd0d"
              title="Nenhum competidor adicionado"
              subtitle="Adicione competidores para monitorar suas estrategias de anuncios."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Adicionar Competidor
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
