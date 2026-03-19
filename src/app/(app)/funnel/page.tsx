"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { takeFunnelSnapshot } from "@/lib/services/edge-functions";
import { formatNumber, formatCompact, cn } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, ArrowDown, Plus } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

function useFunnels() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["funnels", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels")
        .select("*, funnel_snapshots(*)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

const STAGE_COLORS = [
  "bg-blue-dim text-info border-info/20",
  "bg-purple-dim text-primary border-primary/20",
  "bg-amber-dim text-warning border-warning/20",
  "bg-green-dim text-success border-success/20",
  "bg-blue-dim text-info border-info/20",
];

export default function FunnelPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: funnels, isLoading } = useFunnels();
  const [snapshotting, setSnapshotting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const funnel = funnels?.[0];
  const stages = funnel?.stages || [];

  const handleSnapshot = async () => {
    if (!funnel) return;
    setSnapshotting(true);
    try {
      await takeFunnelSnapshot(funnel.id);
      toast.success("Snapshot atualizado!");
      queryClient.invalidateQueries({ queryKey: ["funnels"] });
    } catch (err: any) {
      toast.error("Erro ao atualizar snapshot", { description: err?.message });
    } finally {
      setSnapshotting(false);
    }
  };

  const handleCreate = async () => {
    if (!orgId || !newName.trim()) return;
    setCreating(false);
    const defaultStages = [
      { name: "Visitantes", value: 10000 },
      { name: "Leads", value: 2500 },
      { name: "MQLs", value: 800 },
      { name: "SQLs", value: 300 },
      { name: "Clientes", value: 80 },
    ];
    const { error } = await supabase.from("funnels").insert({
      organization_id: orgId,
      name: newName.trim(),
      stages: defaultStages,
    });
    if (error) {
      toast.error("Erro ao criar funil", { description: error.message });
    } else {
      toast.success("Funil criado!");
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["funnels"] });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const topValue = stages[0]?.value || 0;
  const bottomValue = stages[stages.length - 1]?.value || 0;
  const overallConversion = topValue > 0 ? ((bottomValue / topValue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {funnel && (
          <Button variant="outline" size="sm" onClick={handleSnapshot} disabled={snapshotting}>
            {snapshotting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
            Atualizar Snapshot
          </Button>
        )}
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-2" />
          Criar Funil
        </Button>
      </div>

      {/* Create funnel form */}
      {creating && (
        <Card>
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>Nome do Funil</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Funil Principal" />
            </div>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {stages.length > 0 ? (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Topo do Funil" value={formatCompact(topValue)} gradient="blue" />
            <MetricCard label="Final do Funil" value={formatCompact(bottomValue)} gradient="green" />
            <MetricCard label="Conversao Total" value={`${overallConversion}%`} gradient="purple" />
            <MetricCard label="Etapas" value={String(stages.length)} gradient="amber" />
          </div>

          {/* Funnel visualization */}
          <Card>
            <CardHeader><CardTitle>{funnel?.name || "Funil"}</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-2xl mx-auto space-y-0">
                {stages.map((stage: any, idx: number) => {
                  const maxValue = stages[0]?.value || 1;
                  const widthPct = Math.max(25, (stage.value / maxValue) * 100);
                  const conversionRate = idx > 0 ? ((stage.value / stages[idx - 1].value) * 100).toFixed(1) : "100.0";
                  const colorClass = STAGE_COLORS[idx % STAGE_COLORS.length];
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div
                        className={cn("rounded-[11px] border py-4 px-6 text-center transition-all", colorClass)}
                        style={{ width: `${widthPct}%` }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{stage.name}</p>
                        <p className="text-2xl font-heading font-bold mt-1">{formatNumber(stage.value)}</p>
                      </div>
                      {idx < stages.length - 1 && (
                        <div className="flex items-center gap-2 py-2 text-xs text-t3">
                          <ArrowDown className="h-3 w-3" />
                          <span>{conversionRate}% conversao</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Stage breakdown table */}
          <Card>
            <CardHeader><CardTitle>Detalhamento por Etapa</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Etapa</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Volume</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Taxa de Conversao</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Perda</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stage: any, idx: number) => {
                    const convRate = idx > 0 ? ((stage.value / stages[idx - 1].value) * 100).toFixed(1) : "---";
                    const loss = idx > 0 ? stages[idx - 1].value - stage.value : 0;
                    return (
                      <tr key={idx} className="group">
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          <span className="font-medium text-t1">{stage.name}</span>
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          <span className="font-mono">{formatNumber(stage.value)}</span>
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          <span className={cn("font-mono", idx === 0 ? "text-t3" : parseFloat(convRate) >= 50 ? "text-success" : parseFloat(convRate) >= 20 ? "text-warning" : "text-destructive")}>
                            {convRate}{idx > 0 ? "%" : ""}
                          </span>
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          <span className="font-mono text-t3">{idx > 0 ? `-${formatNumber(loss)}` : "---"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon="🔄"
              title="Nenhum funil configurado"
              subtitle="Crie seu primeiro funil para visualizar a jornada de conversao dos seus leads."
              action={<Button size="sm" onClick={() => setCreating(true)}>Criar Funil</Button>}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
