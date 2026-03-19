"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useContacts, useDeals, usePipelines } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Kanban, BarChart3, Loader2, Plus, GripVertical } from "lucide-react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TABS = [
  { id: "contacts", label: "Contatos", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: Kanban },
  { id: "scoring", label: "Lead Scoring", icon: BarChart3 },
] as const;

const STAGE_PILL_MAP: Record<string, { variant: "active" | "paused" | "learning" | "review"; label: string }> = {
  subscriber: { variant: "paused", label: "Subscriber" },
  lead: { variant: "review", label: "Lead" },
  mql: { variant: "learning", label: "MQL" },
  sql: { variant: "learning", label: "SQL" },
  opportunity: { variant: "learning", label: "Opportunity" },
  customer: { variant: "active", label: "Customer" },
};

const AVATAR_COLORS = ["bg-blue-dim text-info", "bg-purple-dim text-primary", "bg-green-dim text-success", "bg-amber-dim text-warning"];

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function DraggableDealCard({ deal }: { deal: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="bg-s2 border border-border rounded-[11px] p-3 cursor-grab active:cursor-grabbing transition-all hover:border-[hsl(var(--border2))]">
        <div className="flex items-start gap-2">
          <div {...listeners}><GripVertical className="h-4 w-4 text-t3 mt-0.5 shrink-0" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-t1 truncate">{deal.title}</p>
            <p className="text-xs text-t3 mt-0.5">{deal.contacts?.name || deal.contacts?.email || "---"}</p>
            <p className="text-sm font-heading font-bold mt-1.5 text-primary">{formatBRL(deal.value || 0)}</p>
          </div>
        </div>
      </div>
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

  const totalContacts = contacts?.length || 0;
  const customers = contacts?.filter((c: any) => c.lifecycle_stage === "customer").length || 0;
  const avgScore = totalContacts > 0
    ? Math.round(contacts!.reduce((sum: number, c: any) => sum + (c.lead_score || 0), 0) / totalContacts)
    : 0;
  const totalPipelineValue = deals?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0;

  const pipeline = pipelines?.[0];
  const pipelineStages = pipeline?.stages?.length > 0 ? pipeline.stages : [
    { id: "new", name: "Novo" }, { id: "contacted", name: "Contactado" }, { id: "proposal", name: "Proposta" },
    { id: "negotiation", name: "Negociacao" }, { id: "won", name: "Ganho" },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Contatos" value={String(totalContacts)} gradient="blue" />
        <MetricCard label="Clientes" value={String(customers)} gradient="green" />
        <MetricCard label="Score Medio" value={String(avgScore)} gradient="purple" />
        <MetricCard label="Pipeline" value={formatBRL(totalPipelineValue)} gradient="amber" />
      </div>

      {/* Tabs + new contact button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-s2 rounded-lg p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors", tab === t.id ? "bg-card text-t1 border border-border" : "text-t3 hover:text-t1")}>
                <Icon className="h-4 w-4" />{t.label}
              </button>
            );
          })}
        </div>
        <Button size="sm" onClick={() => setCreatingContact(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Contato
        </Button>
      </div>

      {/* Create contact form */}
      {creatingContact && (
        <Card>
          <CardContent className="p-4 flex items-end gap-3">
            <div className="flex-1 space-y-2"><Label>Nome</Label><Input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="Joao Silva" /></div>
            <div className="flex-1 space-y-2"><Label>Email</Label><Input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} placeholder="joao@email.com" type="email" /></div>
            <Button onClick={handleCreateContact} disabled={!newContact.email.trim()}>Criar</Button>
            <Button variant="ghost" onClick={() => setCreatingContact(false)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      {/* Contacts tab */}
      {tab === "contacts" && (
        <Card>
          <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
          <CardContent>
            {!contacts || contacts.length === 0 ? (
              <EmptyState icon="👤" title="Nenhum contato ainda" subtitle="Crie seu primeiro contato para comecar a gerenciar seu CRM." action={<Button size="sm" onClick={() => setCreatingContact(true)}>Criar Contato</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Contato</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Email</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Estagio</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Score</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">LTV Previsto</th>
                      <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact: any, idx: number) => {
                      const stage = contact.lifecycle_stage || "lead";
                      const pill = STAGE_PILL_MAP[stage] || { variant: "paused" as const, label: stage };
                      const score = contact.lead_score || 0;
                      return (
                        <tr
                          key={contact.id}
                          className="group cursor-pointer"
                          onClick={() => router.push(`/crm/contacts/${contact.id}`)}
                        >
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold", AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                                {getInitials(contact.name)}
                              </div>
                              <span className="font-medium text-t1">{contact.name || "---"}</span>
                            </div>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-sm text-t3">{contact.email}</span>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <StatusPill variant={pill.variant} label={pill.label} />
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className={cn("font-mono font-semibold", score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-t3")}>{score}</span>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="font-mono text-sm">{formatBRL(contact.predicted_ltv || 0)}</span>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-xs text-t3">{contact.source || "---"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline tab */}
      {tab === "pipeline" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {pipelineStages.map((stage: any) => {
              const stageDeals = deals?.filter((d: any) => d.stage_id === stage.id) || [];
              const total = stageDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
              return (
                <div key={stage.id} className="min-w-[280px] flex-shrink-0">
                  <div className="bg-s2 rounded-[11px] border border-border p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-t1">{stage.name}</h3>
                        <p className="text-xs text-t3 mt-0.5">{stageDeals.length} deals &middot; {formatBRL(total)}</p>
                      </div>
                      <span className="text-xs font-mono text-t3 bg-s3 px-2 py-0.5 rounded-md">{stageDeals.length}</span>
                    </div>
                  </div>
                  <DroppableStage stageId={stage.id}>
                    {stageDeals.map((deal: any) => <DraggableDealCard key={deal.id} deal={deal} />)}
                    {stageDeals.length === 0 && (
                      <div className="py-8 text-center text-xs text-t3 border border-dashed border-border rounded-[11px]">Arraste deals aqui</div>
                    )}
                  </DroppableStage>
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* Scoring tab */}
      {tab === "scoring" && (
        <Card>
          <CardHeader><CardTitle>Distribuicao de Lead Scores</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { range: "90-100", label: "Muito Quente", color: "bg-success" },
                { range: "70-89", label: "Quente", color: "bg-green-500" },
                { range: "40-69", label: "Morno", color: "bg-warning" },
                { range: "20-39", label: "Frio", color: "bg-orange-500" },
                { range: "0-19", label: "Muito Frio", color: "bg-destructive" },
              ].map((bucket) => {
                const [min, max] = bucket.range.split("-").map(Number);
                const count = contacts?.filter((c: any) => (c.lead_score || 0) >= min && (c.lead_score || 0) <= max).length || 0;
                const total = contacts?.length || 1;
                const pct = (count / total) * 100;
                return (
                  <div key={bucket.range} className="flex items-center gap-3">
                    <span className="text-xs text-t3 font-mono w-16">{bucket.range}</span>
                    <div className="flex-1 h-7 bg-s2 rounded-md overflow-hidden">
                      <div className={cn("h-full rounded-md transition-all", bucket.color)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono font-semibold text-t1 w-10 text-right">{count}</span>
                    <span className="text-xs text-t3 w-20">{bucket.label}</span>
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
