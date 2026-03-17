"use client";

import { useState } from "react";
import { useGoals } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Target, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  on_track: { color: "text-success", label: "No Caminho" },
  at_risk: { color: "text-warning", label: "Em Risco" },
  behind: { color: "text-destructive", label: "Atrasado" },
  achieved: { color: "text-info", label: "Alcançado" },
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

  return (
    <div className="space-y-6">
      <PageHeader title="Metas & OKRs" description="Acompanhe o progresso das suas metas" actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Nova Meta</Button>} />

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: 100 vendas no mês" /></div>
            <div className="w-32 space-y-2"><Label>Meta</Label><Input value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="100" type="number" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {goals && goals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal: any, idx: number) => {
            const status = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
            const progress = goal.current_value && goal.target_value ? (goal.current_value / goal.target_value) * 100 : 0;
            return (
              <motion.div key={goal.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className="surface-glow hover:surface-glow-hover transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{goal.name}</h3></div>
                      <Badge variant="outline" className={status.color}>{status.label}</Badge>
                    </div>
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{goal.current_value || 0} / {goal.target_value || 0}</span><span>{progress.toFixed(0)}%</span></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", progress >= 100 ? "bg-success" : progress >= 60 ? "bg-primary" : "bg-warning")} style={{ width: `${Math.min(progress, 100)}%` }} /></div>
                    </div>
                    {goal.goal_milestones?.slice(0, 3).map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle className={cn("h-3 w-3", m.completed ? "text-success" : "text-muted-foreground/40")} />
                        <span className={m.completed ? "line-through" : ""}>{m.name}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><p className="text-muted-foreground">Nenhuma meta criada.</p><Button className="mt-4" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Criar Meta</Button></CardContent></Card>
      )}
    </div>
  );
}
