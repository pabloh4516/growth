"use client";

import { useState } from "react";
import { useTasks } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  { id: "todo", label: "A Fazer", color: "border-t-muted-foreground" },
  { id: "in_progress", label: "Em Andamento", color: "border-t-primary" },
  { id: "review", label: "Revisão", color: "border-t-warning" },
  { id: "done", label: "Concluído", color: "border-t-success" },
];

const PRIORITY_BADGE: Record<string, "destructive" | "warning" | "secondary" | "info"> = {
  urgent: "destructive", high: "warning", medium: "secondary", low: "info",
};

function DraggableTaskCard({ task }: { task: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div {...listeners}><GripVertical className="h-4 w-4 text-t3 mt-0.5 shrink-0" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{task.title}</p>
              {task.description && <p className="text-xs text-t3 line-clamp-2 mt-1">{task.description}</p>}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={PRIORITY_BADGE[task.priority] || "secondary"} className="text-[10px]">{task.priority}</Badge>
                {task.due_date && <span className="text-[10px] text-t3">{new Date(task.due_date).toLocaleDateString("pt-BR")}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-t1">Equipe & Tarefas</h1>
          <p className="text-sm text-t3">Kanban de tarefas do time</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Nova Tarefa</Button>
      </div>

      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Título</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Descreva a tarefa..." /></div>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {COLUMNS.map((col) => {
            const colTasks = tasks?.filter((t: any) => t.status === col.id) || [];
            return (
              <div key={col.id} className="min-w-[280px] flex-shrink-0">
                <div className={cn("border-t-2 rounded-t-lg px-3 py-2 mb-3 bg-muted/30", col.color)}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
                  </div>
                </div>
                <DroppableColumn columnId={col.id}>
                  {colTasks.map((task: any) => <DraggableTaskCard key={task.id} task={task} />)}
                  {colTasks.length === 0 && <div className="py-8 text-center text-xs text-t3 border border-dashed rounded-lg">Arraste tarefas aqui</div>}
                </DroppableColumn>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
