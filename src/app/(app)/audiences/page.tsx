"use client";

import { useState } from "react";
import { useAudiences } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { generateAudiences } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatCompact } from "@/lib/utils";

const supabase = createClient();

const TYPE_LABELS: Record<string, string> = {
  custom: "Custom", lookalike: "Lookalike", remarketing: "Remarketing", seed: "Seed",
};

function statusToVariant(status: string): "active" | "paused" | "learning" | "review" {
  if (status === "ready" || status === "synced") return "active";
  if (status === "building") return "learning";
  return "paused";
}

export default function AudiencesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: audiences, isLoading } = useAudiences();
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", type: "custom", source_type: "crm_list" });
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncToGoogle = async (audienceId: string) => {
    setSyncingId(audienceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-google-audience", {
        body: { audienceId },
      });
      if (error) throw error;
      toast.success("Audiencia sincronizada com Google Ads!");
      queryClient.invalidateQueries({ queryKey: ["audiences"] });
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreate = async () => {
    if (!orgId || !form.name.trim()) return;
    const { error } = await supabase.from("audiences").insert({
      organization_id: orgId,
      name: form.name.trim(),
      type: form.type,
      source_type: form.source_type,
      status: "building",
      contact_count: 0,
    });
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Publico criado!");
      setForm({ name: "", type: "custom", source_type: "crm_list" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["audiences"] });
    }
  };

  const handleGenerate = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      await generateAudiences(orgId, "top_ltv");
      toast.success("Audiencias geradas!", { description: "Novos publicos foram criados com base nos seus dados." });
      queryClient.invalidateQueries({ queryKey: ["audiences"] });
    } catch (err: any) {
      toast.error("Erro ao gerar audiencias", { description: err?.message });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const list = audiences || [];
  const totalContacts = list.reduce((s: number, a: any) => s + (a.contact_count || 0), 0);
  const readyCount = list.filter((a: any) => a.status === "ready" || a.status === "synced").length;
  const buildingCount = list.filter((a: any) => a.status === "building").length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Publicos-Alvo</h1>
          <p className="text-sm text-t3">Gerencie e gere audiencias com IA</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {generating ? "Gerando..." : "Gerar com IA"}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Publico
          </Button>
        </div>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Publicos" value={String(list.length)} gradient="purple" />
          <MetricCard label="Contatos" value={formatCompact(totalContacts)} gradient="blue" />
          <MetricCard label="Prontos" value={String(readyCount)} gradient="green" />
          <MetricCard label="Em Construcao" value={String(buildingCount)} gradient="amber" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Publico de compradores" /></div>
            <div className="w-36 space-y-2"><Label>Tipo</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="custom">Custom</option><option value="lookalike">Lookalike</option><option value="remarketing">Remarketing</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {list.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Audiencias</CardTitle>
              <span className="text-sm text-t3">{list.length} publicos</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Nome</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Fonte</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Contatos</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((aud: any) => (
                    <tr key={aud.id} className="group">
                      <td className="py-2.5 border-b border-border text-sm font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[220px] truncate">
                        {aud.name}
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <Badge variant="secondary">{TYPE_LABELS[aud.type] || aud.type}</Badge>
                      </td>
                      <td className="py-2.5 border-b border-border text-sm text-t2 group-hover:bg-s2 transition-colors px-1">
                        {aud.source_type || "\u2014"}
                      </td>
                      <td className="py-2.5 border-b border-border text-sm text-t2 text-right font-mono group-hover:bg-s2 transition-colors px-1">
                        {formatCompact(aud.contact_count || 0)}
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill
                          variant={statusToVariant(aud.status)}
                          label={aud.status === "synced" ? "Sincronizado" : aud.status === "ready" ? "Pronto" : aud.status === "building" ? "Construindo" : aud.status}
                        />
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        {aud.status === "ready" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleSyncToGoogle(aud.id)}
                            disabled={syncingId === aud.id}
                          >
                            {syncingId === aud.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                            Sync Google
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
              icon="\ud83d\udc65"
              title="Nenhum publico criado"
              subtitle="Crie publicos-alvo manualmente ou gere automaticamente com IA."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Criar Publico
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
