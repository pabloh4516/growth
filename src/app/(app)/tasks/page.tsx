"use client";

import { useState } from "react";
import { useTasks } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, DragEndEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const COLUMNS = [
  { id: "todo", label: "A Fazer", variant: "paused" as const },
  { id: "in_progress", label: "Em Andamento", variant: "learning" as const },
  { id: "review", label: "Revisao", variant: "review" as const },
  { id: "done", label: "Concluido", variant: "active" as const },
];

const PRIORITY_BADGE: Record<string, "destructive" | "warning" | "secondary" | "info"> = {
  urgent: "destructive", high: "warning", medium: "secondary", low: "info",
};

function DraggableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="bg-s2 border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[hsl(var(--border2))] transition-all">
        <div className="flex items-start gap-2">
          <div {...listeners}><GripVertical className="h-4 w-4 text-t3 mt-0.5 shrink-0" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-t1">{task.title}</p>
            {task.description && <p className="text-xs text-t3 line-clamp-2 mt-1">{task.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={PRIORITY_BADGE[task.priority] || "secondary"} className="text-[10px]">{task.priority}</Badge>
              {task.due_date && <span className="text-[10px] text-t3">{new Date(task.due_date).toLocaleDateString("pt-BR")}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({ columnId, children }: { columnId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  return (
    <div ref={setNodeRef} className={cn("space-y-2 min-h-[100px] p-1 rounded-lg transition-colors", isOver && "bg-primary/5 ring-1 ring-primary/20")}>
      {children}
    </div>
  );
}

export default function TasksPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useTasks();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleCreate = async () => {
    if (!orgId || !newTitle.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      organization_id: orgId,
      title: newTitle.trim(),
      status: "todo",
      priority: "medium",
    });
    if (error) {
      toast.error("Erro ao criar tarefa", { description: error.message });
    } else {
      toast.success("Tarefa criada!");
      setNewTitle("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;

    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error("Erro ao mover tarefa");
    } else {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const list = tasks || [];
  const todoCount = list.filter((t: any) => t.status === "todo").length;
  const inProgressCount = list.filter((t: any) => t.status === "in_progress").length;
  const doneCount = list.filter((t: any) => t.status === "done").length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Equipe & Tarefas</h1>
          <p className="text-sm text-t3">Kanban de tarefas do time</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Nova Tarefa</Button>
      </div>

      {/* Metrics */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Tarefas" value={String(list.length)} gradient="purple" />
          <MetricCard label="A Fazer" value={String(todoCount)} gradient="amber" />
          <MetricCard label="Em Andamento" value={String(inProgressCount)} gradient="blue" />
          <MetricCard label="Concluidas" value={String(doneCount)} gradient="green" />
        </div>
      )}

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Titulo</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Descreva a tarefa..." /></div>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Kanban board */}
      {list.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
            {COLUMNS.map((col) => {
              const colTasks = list.filter((t: any) => t.status === col.id);
              return (
                <div key={col.id} className="min-w-[270px] flex-shrink-0">
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="flex items-center gap-2">
                      <StatusPill variant={col.variant} label={col.label} />
                    </div>
                    <span className="text-xs text-t3 font-mono">{colTasks.length}</span>
                  </div>
                  <DroppableColumn columnId={col.id}>
                    {colTasks.map((task: any) => <DraggableTaskCard key={task.id} task={task} />)}
                    {colTasks.length === 0 && (
                      <div className="py-8 text-center text-xs text-t3 border border-dashed border-border rounded-lg">
                        Arraste tarefas aqui
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>
        </DndContext>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon="\u2705"
              title="Nenhuma tarefa criada"
              subtitle="Crie tarefas para organizar o trabalho do seu time."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />Nova Tarefa
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
