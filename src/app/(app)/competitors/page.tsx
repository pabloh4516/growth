"use client";

import { useState } from "react";
import { useCompetitors } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Globe, ExternalLink, Brain } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

  return (
    <div className="space-y-6">
      <PageHeader title="Competidores" description="Monitore a estratégia de anúncios dos seus competidores" actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              toast.info("Analisando competidores com IA...");
              const { analyzeCompetitors } = await import("@/lib/services/edge-functions");
              await analyzeCompetitors();
              toast.success("Análise concluída!");
              queryClient.invalidateQueries({ queryKey: ["competitors"] });
            } catch (err: any) { toast.error("Erro na análise", { description: err?.message }); }
          }}>
            <Brain className="h-4 w-4 mr-2" />
            Analisar com IA
          </Button>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Adicionar Competidor</Button>
        </div>
      } />

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Concorrente X" /></div>
            <div className="flex-1 space-y-2"><Label>Domínio</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="concorrente.com.br" /></div>
            <Button onClick={handleCreate} disabled={!form.name.trim()}>Adicionar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {competitors && competitors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {competitors.map((comp: any, idx: number) => (
            <motion.div key={comp.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
              <Card className="surface-glow hover:surface-glow-hover transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold">{comp.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />{comp.domain}</div>
                    </div>
                    {comp.domain && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`https://${comp.domain}`, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Badge variant="secondary">{comp.competitor_ads?.length || 0} análises</Badge>
                  {comp.competitor_ads?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{comp.competitor_ads[comp.competitor_ads.length - 1]?.description || ""}</p>
                  )}
                  {comp.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{comp.notes}</p>}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><p className="text-muted-foreground">Nenhum competidor adicionado.</p><Button className="mt-4" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Adicionar Competidor</Button></CardContent></Card>
      )}
    </div>
  );
}
