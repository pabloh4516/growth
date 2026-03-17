"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, FlaskConical, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const supabase = createClient();
const STATUS_BADGE: Record<string, "success" | "warning" | "secondary" | "info"> = { running: "warning", completed: "success", draft: "secondary", winner_declared: "info" };

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

  return (
    <div className="space-y-6">
      <PageHeader title="Testes A/B" description="Compare variantes e encontre vencedores" actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Teste</Button>} />

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Teste headline v1 vs v2" /></div>
            <div className="w-40 space-y-2"><Label>Tipo</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="creative">Criativo</option><option value="page">Página</option><option value="audience">Audiência</option><option value="copy">Copy</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {tests && tests.length > 0 ? (
        <div className="space-y-3">
          {tests.map((test: any, idx: number) => (
            <motion.div key={test.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <FlaskConical className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{test.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={STATUS_BADGE[test.status] || "secondary"}>{test.status}</Badge>
                      <span className="text-xs text-muted-foreground">{test.type}</span>
                      {test.statistical_significance && <span className="text-xs font-mono text-success">{(test.statistical_significance * 100).toFixed(0)}% significância</span>}
                    </div>
                  </div>
                  {test.winner && <Trophy className="h-4 w-4 text-warning" />}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><p className="text-muted-foreground">Nenhum teste A/B criado.</p></CardContent></Card>
      )}
    </div>
  );
}
