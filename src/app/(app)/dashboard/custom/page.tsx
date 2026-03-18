"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, LayoutDashboard } from "lucide-react";
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
    <div className="animate-fade-up space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-t1">Dashboards Customizados</h1>
          <p className="text-sm text-t3 mt-1">Crie dashboards personalizados</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Dashboard</Button>
      </div>

      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Meu Dashboard" /></div>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {dashboards && dashboards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((db: any) => (
            <Card key={db.id} className="hover:border-primary/30 transition-all cursor-pointer" onClick={() => router.push(`/dashboard/custom/${db.id}`)}>
              <CardContent className="p-4 flex items-center gap-3">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{db.name}</p>
                  <p className="text-xs text-t3">{new Date(db.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-16 text-center"><LayoutDashboard className="h-12 w-12 text-t3/30 mx-auto mb-4" /><p className="text-t3">Nenhum dashboard customizado.</p></CardContent></Card>
      )}
    </div>
  );
}
