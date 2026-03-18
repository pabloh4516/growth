"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { takeFunnelSnapshot } from "@/lib/services/edge-functions";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  "from-blue-500 to-blue-600",
  "from-purple-500 to-purple-600",
  "from-indigo-500 to-indigo-600",
  "from-violet-500 to-violet-600",
  "from-emerald-500 to-emerald-600",
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

  return (
    <div className="space-y-6 animate-fade-up">
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

      {creating && (
        <Card className="border-primary/30">
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
        <div className="max-w-2xl mx-auto space-y-0">
          {stages.map((stage: any, idx: number) => {
            const maxValue = stages[0]?.value || 1;
            const widthPct = Math.max(20, (stage.value / maxValue) * 100);
            const conversionRate = idx > 0 ? ((stage.value / stages[idx - 1].value) * 100).toFixed(1) : "100.0";
            return (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className={`bg-gradient-to-r ${STAGE_COLORS[idx % STAGE_COLORS.length]} rounded-lg py-4 px-6 text-white text-center transition-all`}
                  style={{ width: `${widthPct}%` }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{stage.name}</p>
                  <p className="text-2xl font-bold font-mono mt-1">{formatNumber(stage.value)}</p>
                </div>
                {idx < stages.length - 1 && (
                  <div className="flex items-center gap-2 py-2 text-xs text-t3">
                    <ArrowDown className="h-3 w-3" />
                    <span>{conversionRate}% de conversão</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-t3">Nenhum funil configurado.</p>
            <Button className="mt-4" onClick={() => setCreating(true)}>Criar Funil</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
