"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const supabase = createClient();

export default function CustomDashboardsPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: dashboards, isLoading } = useQuery({
    queryKey: ["custom-dashboards", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("custom_dashboards").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false });
      return data;
    },
    enabled: !!orgId,
  });

  const handleCreate = async () => {
    if (!orgId || !newName.trim()) return;
    const { data, error } = await supabase.from("custom_dashboards").insert({
      organization_id: orgId,
      name: newName.trim(),
      layout: {},
    }).select().single();
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Dashboard criado!");
      setNewName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["custom-dashboards"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboards Customizados" description="Crie dashboards personalizados" actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Dashboard</Button>} />

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Meu Dashboard" /></div>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {dashboards && dashboards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((db: any, idx: number) => (
            <motion.div key={db.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer" onClick={() => router.push(`/dashboard/custom/${db.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{db.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(db.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><LayoutDashboard className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><p className="text-muted-foreground">Nenhum dashboard customizado.</p></CardContent></Card>
      )}
    </div>
  );
}
