"use client";

import { useState } from "react";
import { useCalendarEvents } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

export default function CalendarPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useCalendarEvents();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", start_date: "", type: "campaign" });

  const handleCreate = async () => {
    if (!orgId || !form.title.trim() || !form.start_date) return;
    const { error } = await supabase.from("calendar_events").insert({
      organization_id: orgId,
      title: form.title.trim(),
      start_date: form.start_date,
      end_date: form.start_date,
      type: form.type,
    });
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Evento criado!");
      setForm({ title: "", start_date: "", type: "campaign" });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const grouped = (events || []).reduce((acc: Record<string, any[]>, event: any) => {
    const date = new Date(event.start_date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title="Calendário de Marketing" description="Eventos, lançamentos e datas importantes" actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Evento</Button>} />

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lançamento campanha X" /></div>
            <div className="w-44 space-y-2"><Label>Data</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <Button onClick={handleCreate} disabled={!form.title.trim() || !form.start_date}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateEvents]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold capitalize mb-3">{date}</h3>
              <div className="space-y-2">
                {(dateEvents as any[]).map((event: any, idx: number) => (
                  <motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                    <Card className="surface-glow hover:surface-glow-hover transition-all">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.title}</p>
                          {event.description && <p className="text-xs text-muted-foreground truncate">{event.description}</p>}
                        </div>
                        {event.type && <Badge variant="secondary" className="text-[10px]">{event.type}</Badge>}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><CalendarIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><p className="text-muted-foreground">Nenhum evento no calendário.</p><Button className="mt-4" onClick={() => setCreating(true)}>Novo Evento</Button></CardContent></Card>
      )}
    </div>
  );
}
