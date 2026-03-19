"use client";

import { useState } from "react";
import { useGoals } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const STATUS_CONFIG: Record<string, { variant: "active" | "paused" | "learning" | "review"; label: string }> = {
  on_track: { variant: "active", label: "No Caminho" },
  at_risk: { variant: "learning", label: "Em Risco" },
  behind: { variant: "paused", label: "Atrasado" },
  achieved: { variant: "review", label: "Alcancado" },
};

export default function GoalsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: goals, isLoading } = useGoals();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", target_value: "" });

  const handleCreate = async () => {
    if (!orgId || !form.name.trim()) return;
    const { error } = await supabase.from("goals").insert({
      organization_id: orgId,
      name: form.name.trim(),
      target_value: Number(form.target_value) || 100,
      current_value: 0,
      status: "on_track",
    });
    if (error) toast.error("Erro ao criar meta", { description: error.message });
    else {
      toast.success("Meta criada!");
      setForm({ name: "", target_value: "" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const list = goals || [];
  const achievedCount = list.filter((g: any) => g.status === "achieved").length;
  const onTrackCount = list.filter((g: any) => g.status === "on_track").length;
  const atRiskCount = list.filter((g: any) => g.status === "at_risk" || g.status === "behind").length;
  const avgProgress = list.length > 0
    ? list.reduce((s: number, g: any) => {
        const p = g.current_value && g.target_value ? (g.current_value / g.target_value) * 100 : 0;
        return s + Math.min(p, 100);
      }, 0) / list.length
    : 0;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Metas & OKRs</h1>
          <p className="text-sm text-t3">Acompanhe o progresso das suas metas</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Nova Meta</Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Metas" value={String(list.length)} gradient="purple" />
          <MetricCard label="Progresso Medio" value={`${avgProgress.toFixed(0)}%`} gradient="blue" />
          <MetricCard label="No Caminho" value={String(onTrackCount)} gradient="green" />
          <MetricCard label="Em Risco" value={String(atRiskCount)} gradient="amber" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: 100 vendas no mes" /></div>
            <div className="w-32 space-y-2"><Label>Meta</Label><Input value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="100" type="number" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Goal cards */}
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((goal: any) => {
            const status = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
            const progress = goal.current_value && goal.target_value ? (goal.current_value / goal.target_value) * 100 : 0;
            const clampedProgress = Math.min(progress, 100);

            return (
              <Card key={goal.id} className="hover:border-[hsl(var(--border2))] transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-t1">{goal.name}</h3>
                    <StatusPill variant={status.variant} label={status.label} />
                  </div>

                  {/* Progress bar */}
                  <div className="mb-1">
                    <div className="flex justify-between text-xs text-t3 mb-1.5">
                      <span className="font-mono">{goal.current_value || 0} / {goal.target_value || 0}</span>
                      <span className="font-mono font-semibold">{clampedProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-s2 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          progress >= 100 ? "bg-success" : progress >= 60 ? "bg-primary" : "bg-warning"
                        )}
                        style={{ width: `${clampedProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Milestones */}
                  {goal.goal_milestones?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {goal.goal_milestones.slice(0, 3).map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 text-xs text-t3">
                          <CheckCircle className={cn("h-3 w-3 shrink-0", m.completed ? "text-success" : "text-t3/40")} />
                          <span className={m.completed ? "line-through" : ""}>{m.name}</span>
                        </div>
                      ))}
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
              icon="\ud83c\udfaf"
              title="Nenhuma meta criada"
              subtitle="Defina metas e OKRs para acompanhar o progresso do seu marketing."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Criar Meta
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
