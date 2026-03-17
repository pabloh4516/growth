"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useContacts, useDeals, usePipelines } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Kanban, BarChart3, Loader2, Plus, GripVertical } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TABS = [
  { id: "contacts", label: "Contatos", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: Kanban },
  { id: "scoring", label: "Lead Scoring", icon: BarChart3 },
] as const;

const STAGE_COLORS: Record<string, string> = {
  subscriber: "bg-slate-500/20 text-slate-400",
  lead: "bg-blue-500/20 text-blue-400",
  mql: "bg-purple-500/20 text-purple-400",
  sql: "bg-indigo-500/20 text-indigo-400",
  opportunity: "bg-amber-500/20 text-amber-400",
  customer: "bg-emerald-500/20 text-emerald-400",
};

const contactColumns: ColumnDef<any, any>[] = [
  { accessorKey: "name", header: "Nome", cell: ({ row }) => <span className="font-medium">{row.original.name || "—"}</span> },
  { accessorKey: "email", header: "Email", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.email}</span> },
  {
    accessorKey: "lifecycle_stage", header: "Estágio",
    cell: ({ row }) => {
      const stage = row.original.lifecycle_stage || "lead";
      return <Badge className={STAGE_COLORS[stage] || "bg-muted text-muted-foreground"}>{stage.toUpperCase()}</Badge>;
    },
  },
  {
    accessorKey: "lead_score", header: "Score",
    cell: ({ row }) => {
      const score = row.original.lead_score || 0;
      return <span className={cn("font-mono font-semibold", score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-muted-foreground")}>{score}</span>;
    },
  },
  { accessorKey: "predicted_ltv", header: "LTV Previsto", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.predicted_ltv || 0)}</span> },
  { accessorKey: "source", header: "Fonte", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.source || "—"}</span> },
];

function DraggableDealCard({ deal }: { deal: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="surface-glow cursor-grab active:cursor-grabbing hover:surface-glow-hover transition-all">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div {...listeners}><GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{deal.title}</p>
              <p className="text-xs text-muted-foreground">{deal.contacts?.name || deal.contacts?.email || "—"}</p>
              <p className="text-sm font-mono font-semibold mt-1 text-primary">{formatBRL(deal.value || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableStage({ stageId, children }: { stageId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div ref={setNodeRef} className={cn("space-y-2 min-h-[100px] p-1 rounded-lg transition-colors", isOver && "bg-primary/5 ring-1 ring-primary/20")}>
      {children}
    </div>
  );
}

export default function CRMPage() {
  const router = useRouter();
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("contacts");
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: pipelines } = usePipelines();
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", email: "" });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleCreateContact = async () => {
    if (!orgId || !newContact.email.trim()) return;
    const { error } = await supabase.from("contacts").insert({
      organization_id: orgId,
      name: newContact.name,
      email: newContact.email,
      lifecycle_stage: "lead",
    });
    if (error) {
      toast.error("Erro ao criar contato", { description: error.message });
    } else {
      toast.success("Contato criado!");
      setNewContact({ name: "", email: "" });
      setCreatingContact(false);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const dealId = active.id as string;
    const newStageId = over.id as string;

    const { error } = await supabase
      .from("deals")
      .update({ stage_id: newStageId })
      .eq("id", dealId);

    if (error) {
      toast.error("Erro ao mover deal");
    } else {
      toast.success("Deal movido!");
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    }
  };

  const isLoading = contactsLoading || dealsLoading;
  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const pipeline = pipelines?.[0];
  const pipelineStages = pipeline?.stages?.length > 0 ? pipeline.stages : [
    { id: "new", name: "Novo" }, { id: "contacted", name: "Contactado" }, { id: "proposal", name: "Proposta" },
    { id: "negotiation", name: "Negociação" }, { id: "won", name: "Ganho" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description="Gerencie contatos, pipeline de vendas e lead scoring"
        actions={
          <Button onClick={() => setCreatingContact(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Contato
          </Button>
        }
      />

      {creatingContact && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="João Silva" /></div>
            <div className="flex-1 space-y-2"><Label>Email</Label><Input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="joao@email.com" type="email" /></div>
            <Button onClick={handleCreateContact} disabled={!newContact.email.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreatingContact(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors", tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />{t.label}
            </button>
          );
        })}
      </div>

      {tab === "contacts" && (
        <DataTable data={contacts || []} columns={contactColumns} searchPlaceholder="Buscar contatos..." onRowClick={(row: any) => router.push(`/crm/contacts/${row.id}`)} />
      )}

      {tab === "pipeline" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {pipelineStages.map((stage: any) => {
              const stageDeals = deals?.filter((d: any) => d.stage_id === stage.id) || [];
              const total = stageDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
              return (
                <div key={stage.id} className="min-w-[280px] flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold">{stage.name}</h3>
                      <p className="text-xs text-muted-foreground">{stageDeals.length} deals · {formatBRL(total)}</p>
                    </div>
                  </div>
                  <DroppableStage stageId={stage.id}>
                    {stageDeals.map((deal: any) => <DraggableDealCard key={deal.id} deal={deal} />)}
                    {stageDeals.length === 0 && (
                      <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">Arraste deals aqui</div>
                    )}
                  </DroppableStage>
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      {tab === "scoring" && (
        <Card className="surface-glow">
          <CardHeader><CardTitle className="text-base font-heading">Distribuição de Lead Scores</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { range: "90-100", label: "Muito Quente", color: "bg-emerald-500" },
                { range: "70-89", label: "Quente", color: "bg-green-500" },
                { range: "40-69", label: "Morno", color: "bg-yellow-500" },
                { range: "20-39", label: "Frio", color: "bg-orange-500" },
                { range: "0-19", label: "Muito Frio", color: "bg-red-500" },
              ].map((bucket) => {
                const [min, max] = bucket.range.split("-").map(Number);
                const count = contacts?.filter((c: any) => (c.lead_score || 0) >= min && (c.lead_score || 0) <= max).length || 0;
                const total = contacts?.length || 1;
                const pct = (count / total) * 100;
                return (
                  <div key={bucket.range} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">{bucket.range}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", bucket.color)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">{count}</span>
                    <span className="text-[10px] text-muted-foreground w-10">{bucket.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
