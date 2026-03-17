"use client";

import { useState } from "react";
import { useAudiences } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { generateAudiences } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, UsersRound, Sparkles, Upload } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TYPE_LABELS: Record<string, string> = {
  custom: "Custom", lookalike: "Lookalike", remarketing: "Remarketing", seed: "Seed",
};

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
      toast.success("Audiência sincronizada com Google Ads!");
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
      toast.success("Público criado!");
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
      toast.success("Audiências geradas!", { description: "Novos públicos foram criados com base nos seus dados." });
      queryClient.invalidateQueries({ queryKey: ["audiences"] });
    } catch (err: any) {
      toast.error("Erro ao gerar audiências", { description: err?.message });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Públicos-Alvo"
        description="Gerencie e gere audiências com IA"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? "Gerando..." : "Gerar com IA"}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Público
            </Button>
          </div>
        }
      />
      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Público de compradores" /></div>
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

      {audiences && audiences.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {audiences.map((aud: any, idx: number) => (
            <motion.div key={aud.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UsersRound className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">{aud.name}</h3>
                    </div>
                    <StatusBadge status={aud.status === "ready" || aud.status === "synced" ? "active" : aud.status === "building" ? "pending" : "error"} />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <Badge variant="secondary">{TYPE_LABELS[aud.type] || aud.type}</Badge>
                    <Badge variant="outline">{aud.source_type || "—"}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">{aud.contact_count || 0} contatos</p>
                    {aud.status === "ready" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleSyncToGoogle(aud.id); }}
                        disabled={syncingId === aud.id}
                      >
                        {syncingId === aud.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                        Sync Google
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><UsersRound className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><p className="text-muted-foreground">Nenhum público criado.</p></CardContent></Card>
      )}
    </div>
  );
}
