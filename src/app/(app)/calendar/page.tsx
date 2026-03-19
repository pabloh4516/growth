"use client";

import { useState } from "react";
import { useCalendarEvents } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TYPE_COLORS: Record<string, string> = {
  campaign: "bg-primary",
  launch: "bg-success",
  meeting: "bg-info",
  deadline: "bg-warning",
  other: "bg-t3",
};

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

  const list = events || [];

  // Group by date
  const grouped = list.reduce((acc: Record<string, any[]>, event: any) => {
    const date = new Date(event.start_date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {});

  const upcomingCount = list.filter((e: any) => new Date(e.start_date) >= new Date()).length;
  const typeCounts = list.reduce((acc: Record<string, number>, e: any) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(typeCounts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "\u2014";

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Calendario de Marketing</h1>
          <p className="text-sm text-t3">Eventos, lancamentos e datas importantes</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo Evento</Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard label="Total Eventos" value={String(list.length)} gradient="purple" />
          <MetricCard label="Proximos" value={String(upcomingCount)} gradient="blue" />
          <MetricCard label="Tipo Principal" value={topType} gradient="green" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Titulo</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lancamento campanha X" /></div>
            <div className="w-44 space-y-2"><Label>Data</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="w-36 space-y-2"><Label>Tipo</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="campaign">Campanha</option><option value="launch">Lancamento</option><option value="meeting">Reuniao</option><option value="deadline">Deadline</option><option value="other">Outro</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={!form.title.trim() || !form.start_date}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Event list grouped by date */}
      {Object.entries(grouped).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, dateEvents]) => (
            <Card key={date}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize">{date}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dateEvents as any[]).map((event: any) => (
                    <div key={event.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0 group hover:bg-s2 transition-colors rounded px-2 -mx-2">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${TYPE_COLORS[event.type] || TYPE_COLORS.other}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-t1">{event.title}</p>
                        {event.description && <p className="text-xs text-t3 truncate">{event.description}</p>}
                      </div>
                      {event.type && <Badge variant="secondary" className="text-[10px]">{event.type}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="\ud83d\udcc5"
              title="Nenhum evento no calendario"
              subtitle="Adicione eventos, lancamentos e datas importantes do marketing."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Novo Evento
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
