"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

function testStatusToVariant(status: string): "active" | "paused" | "learning" | "review" {
  if (status === "running") return "learning";
  if (status === "completed" || status === "winner_declared") return "active";
  return "paused";
}

function testStatusLabel(status: string): string {
  if (status === "running") return "Rodando";
  if (status === "completed") return "Concluido";
  if (status === "winner_declared") return "Vencedor";
  if (status === "draft") return "Rascunho";
  return status;
}

export default function ABTestsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", type: "creative" });

  const { data: tests, isLoading } = useQuery({
    queryKey: ["ab-tests", orgId],
    queryFn: async () => { const { data } = await supabase.from("ab_tests").select("*, ab_test_results(*)").eq("organization_id", orgId!).order("created_at", { ascending: false }); return data; },
    enabled: !!orgId,
  });

  const handleCreate = async () => {
    if (!orgId || !form.name.trim()) return;
    const { error } = await supabase.from("ab_tests").insert({ organization_id: orgId, name: form.name, type: form.type, status: "draft", variants: [] });
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success("Teste A/B criado!"); setForm({ name: "", type: "creative" }); setCreating(false); queryClient.invalidateQueries({ queryKey: ["ab-tests"] }); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const list = tests || [];
  const runningCount = list.filter((t: any) => t.status === "running").length;
  const completedCount = list.filter((t: any) => t.status === "completed" || t.status === "winner_declared").length;
  const winnersCount = list.filter((t: any) => t.winner).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Testes A/B</h1>
          <p className="text-sm text-t3">Compare variantes e encontre vencedores</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Teste</Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Testes" value={String(list.length)} gradient="purple" />
          <MetricCard label="Rodando" value={String(runningCount)} gradient="amber" />
          <MetricCard label="Concluidos" value={String(completedCount)} gradient="green" />
          <MetricCard label="Vencedores" value={String(winnersCount)} gradient="blue" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Teste headline v1 vs v2" /></div>
            <div className="w-40 space-y-2"><Label>Tipo</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="creative">Criativo</option><option value="page">Pagina</option><option value="audience">Audiencia</option><option value="copy">Copy</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Cards grid */}
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((test: any) => {
            const results = test.ab_test_results || [];
            const variantA = results.find((r: any) => r.variant === "A" || r.variant === "control");
            const variantB = results.find((r: any) => r.variant === "B" || r.variant === "challenger");
            return (
              <Card key={test.id} className="hover:border-[hsl(var(--border2))] transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-t1 truncate">{test.name}</p>
                      <Badge variant="secondary" className="mt-1 text-[10px]">{test.type}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {test.winner && <Trophy className="h-4 w-4 text-warning" />}
                      <StatusPill variant={testStatusToVariant(test.status)} label={testStatusLabel(test.status)} />
                    </div>
                  </div>

                  {/* Variant comparison */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-s2 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-t3 uppercase tracking-wide mb-1">Variante A</p>
                      <p className="text-sm font-mono font-semibold text-t1">
                        {variantA?.conversions ?? "\u2014"}
                      </p>
                      <p className="text-[10px] text-t3">conversoes</p>
                    </div>
                    <div className="bg-s2 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-t3 uppercase tracking-wide mb-1">Variante B</p>
                      <p className="text-sm font-mono font-semibold text-t1">
                        {variantB?.conversions ?? "\u2014"}
                      </p>
                      <p className="text-[10px] text-t3">conversoes</p>
                    </div>
                  </div>

                  {/* Confidence */}
                  {test.statistical_significance != null && test.statistical_significance > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-t3">Significancia</span>
                      <span className="text-xs font-mono font-semibold text-success">
                        {(test.statistical_significance * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="\u2697\ufe0f"
              title="Nenhum teste A/B criado"
              subtitle="Crie testes para comparar variantes de criativos, paginas ou audiencias."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Novo Teste
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
