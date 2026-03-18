"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Mail,
  ChevronDown,
  ChevronRight,
  Trash2,
  Clock,
  Send,
  Eye,
  MousePointer,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const supabase = createClient();

const TRIGGER_TYPES = [
  { value: "form_submit", label: "Formulário enviado" },
  { value: "tag_added", label: "Tag adicionada" },
  { value: "list_joined", label: "Entrou na lista" },
  { value: "manual", label: "Manual" },
];

export default function EmailSequencesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingStepTo, setAddingStepTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for new sequence
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("manual");
  const [newStatus, setNewStatus] = useState("draft");

  // Form state for new step
  const [stepSubject, setStepSubject] = useState("");
  const [stepBody, setStepBody] = useState("");
  const [stepDelay, setStepDelay] = useState("24");

  const { data: sequences, isLoading } = useQuery({
    queryKey: ["email-sequences", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_sequences")
        .select("*, email_sequence_steps(*)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const handleCreateSequence = async () => {
    if (!orgId || !newName.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("email_sequences").insert({
      organization_id: orgId,
      name: newName,
      trigger_type: newTrigger,
      status: newStatus,
    });

    setSaving(false);
    if (error) {
      toast.error("Erro ao criar sequência", { description: error.message });
    } else {
      toast.success("Sequência criada com sucesso!");
      setNewName("");
      setNewTrigger("manual");
      setNewStatus("draft");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    }
  };

  const handleAddStep = async (sequenceId: string) => {
    if (!orgId || !stepSubject.trim()) return;
    setSaving(true);

    // Get current step count to determine order
    const sequence = sequences?.find((s: any) => s.id === sequenceId);
    const stepCount = sequence?.email_sequence_steps?.length ?? 0;

    const { error } = await supabase.from("email_sequence_steps").insert({
      sequence_id: sequenceId,
      organization_id: orgId,
      step_order: stepCount + 1,
      subject: stepSubject,
      body_html: stepBody,
      delay_hours: parseInt(stepDelay) || 24,
    });

    setSaving(false);
    if (error) {
      toast.error("Erro ao adicionar etapa", { description: error.message });
    } else {
      toast.success("Etapa adicionada!");
      setStepSubject("");
      setStepBody("");
      setStepDelay("24");
      setAddingStepTo(null);
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    const { error } = await supabase
      .from("email_sequence_steps")
      .delete()
      .eq("id", stepId);

    if (error) {
      toast.error("Erro ao excluir etapa");
    } else {
      toast.success("Etapa removida");
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    }
  };

  const handleDeleteSequence = async (sequenceId: string) => {
    const { error } = await supabase
      .from("email_sequences")
      .delete()
      .eq("id", sequenceId);

    if (error) {
      toast.error("Erro ao excluir sequência");
    } else {
      toast.success("Sequência removida");
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    }
  };

  const handleToggleStatus = async (sequenceId: string, currentStatus: string) => {
    const newSt = currentStatus === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("email_sequences")
      .update({ status: newSt })
      .eq("id", sequenceId);

    if (error) {
      toast.error("Erro ao alterar status");
    } else {
      toast.success(newSt === "active" ? "Sequência ativada" : "Sequência pausada");
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-t1">Email Sequences</h1>
          <p className="text-sm text-t3 mt-1">Crie e gerencie sequências de email automatizadas</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/automations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Sequência
          </Button>
        </div>
      </div>

      {/* Creation form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-heading font-semibold">Nova Sequência de Email</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nome da Sequência</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Onboarding Novos Leads"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Trigger</Label>
                <select
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Status Inicial</Label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleCreateSequence} disabled={!newName.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Sequência
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sequences list */}
      {sequences && sequences.length > 0 ? (
        <div className="space-y-3">
          {sequences.map((seq: any) => {
            const steps = seq.email_sequence_steps ?? [];
            const isExpanded = expandedId === seq.id;
            const totalSends = steps.reduce((acc: number, s: any) => acc + (s.sends_count || 0), 0);

            return (
              <Card key={seq.id}>
                <CardContent className="p-0">
                  {/* Sequence header */}
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : seq.id)}
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{seq.name}</p>
                      <p className="text-xs text-t3">
                        {steps.length} {steps.length === 1 ? "etapa" : "etapas"} ·{" "}
                        Trigger: {TRIGGER_TYPES.find((t) => t.value === seq.trigger_type)?.label ?? seq.trigger_type} ·{" "}
                        {totalSends} envios
                      </p>
                    </div>

                    <StatusBadge status={seq.status === "active" ? "active" : seq.status === "paused" ? "paused" : "draft"} />

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(seq.id, seq.status);
                        }}
                        title={seq.status === "active" ? "Pausar" : "Ativar"}
                      >
                        {seq.status === "active" ? "Pausar" : "Ativar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSequence(seq.id);
                        }}
                        title="Excluir sequência"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-t3" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-t3" />
                      )}
                    </div>
                  </div>

                  {/* Expanded steps */}
                  {isExpanded && (
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 border-t border-border">
                        {/* Steps timeline */}
                        {steps.length > 0 ? (
                          <div className="relative ml-6 mt-4">
                            {/* Vertical line */}
                            <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />

                            {steps
                              .sort((a: any, b: any) => (a.step_order ?? 0) - (b.step_order ?? 0))
                              .map((step: any, sIdx: number) => (
                                <div key={step.id} className="relative pl-8 pb-6 last:pb-0">
                                  {/* Dot */}
                                  <div className="absolute left-0 top-2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background" />

                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="secondary" className="text-[10px]">
                                          Etapa {step.step_order ?? sIdx + 1}
                                        </Badge>
                                        <span className="flex items-center gap-1 text-[10px] text-t3">
                                          <Clock className="h-3 w-3" />
                                          {step.delay_hours}h de espera
                                        </span>
                                      </div>
                                      <p className="text-sm font-medium">{step.subject}</p>
                                      {step.body_html && (
                                        <p className="text-xs text-t3 line-clamp-2 mt-1">
                                          {step.body_html.replace(/<[^>]*>/g, "").slice(0, 120)}
                                        </p>
                                      )}

                                      {/* Stats */}
                                      <div className="flex items-center gap-4 mt-2">
                                        <span className="flex items-center gap-1 text-[10px] text-t3">
                                          <Send className="h-3 w-3" />
                                          {step.sends_count ?? 0} enviados
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] text-t3">
                                          <Eye className="h-3 w-3" />
                                          {step.opens_count ?? 0} abertos
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px] text-t3">
                                          <MousePointer className="h-3 w-3" />
                                          {step.clicks_count ?? 0} cliques
                                        </span>
                                      </div>
                                    </div>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteStep(step.id)}
                                      title="Remover etapa"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-sm text-t3 text-center py-4">
                            Nenhuma etapa configurada nesta sequência.
                          </p>
                        )}

                        {/* Add Step form */}
                        {addingStepTo === seq.id ? (
                          <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                            <h4 className="text-sm font-medium">Nova Etapa</h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Assunto do Email</Label>
                                <Input
                                  value={stepSubject}
                                  onChange={(e) => setStepSubject(e.target.value)}
                                  placeholder="Ex: Bem-vindo ao GrowthOS!"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Delay (horas)</Label>
                                <Input
                                  type="number"
                                  value={stepDelay}
                                  onChange={(e) => setStepDelay(e.target.value)}
                                  placeholder="24"
                                  min="0"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Corpo do Email (HTML)</Label>
                              <textarea
                                value={stepBody}
                                onChange={(e) => setStepBody(e.target.value)}
                                placeholder="<p>Olá {{nome}}, seja bem-vindo...</p>"
                                rows={4}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-t3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleAddStep(seq.id)}
                                disabled={!stepSubject.trim() || saving}
                              >
                                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Adicionar Etapa
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAddingStepTo(null);
                                  setStepSubject("");
                                  setStepBody("");
                                  setStepDelay("24");
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setAddingStepTo(seq.id)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Adicionar Etapa
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <Mail className="h-12 w-12 text-t3/30 mx-auto mb-4" />
            <p className="text-t3 mb-2">Nenhuma sequência de email criada.</p>
            <p className="text-sm text-t3">
              Crie sua primeira sequência para automatizar o envio de emails.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
