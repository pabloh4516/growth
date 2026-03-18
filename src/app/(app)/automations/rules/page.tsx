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
  Zap,
  Trash2,
  X,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  Filter,
  Cog,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const supabase = createClient();

const TRIGGERS = [
  { value: "contact_created", label: "Contato criado" },
  { value: "contact_updated", label: "Contato atualizado" },
  { value: "form_submitted", label: "Formulário enviado" },
  { value: "sale_completed", label: "Venda concluída" },
  { value: "campaign_metric_change", label: "Mudança de métrica" },
  { value: "manual", label: "Manual" },
];

const CONDITION_FIELDS = [
  { value: "lead_score", label: "Lead Score" },
  { value: "lifecycle_stage", label: "Estágio do Ciclo" },
  { value: "source", label: "Fonte" },
  { value: "tag", label: "Tag" },
  { value: "utm_source", label: "UTM Source" },
  { value: "city", label: "Cidade" },
  { value: "email", label: "Email" },
];

const OPERATORS = [
  { value: "=", label: "Igual a" },
  { value: ">", label: "Maior que" },
  { value: "<", label: "Menor que" },
  { value: ">=", label: "Maior ou igual" },
  { value: "<=", label: "Menor ou igual" },
  { value: "contains", label: "Contém" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Enviar email" },
  { value: "add_tag", label: "Adicionar tag" },
  { value: "change_stage", label: "Alterar estágio" },
  { value: "notify_team", label: "Notificar equipe" },
  { value: "start_sequence", label: "Iniciar sequência" },
  { value: "assign_to", label: "Atribuir a" },
];

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface Action {
  type: string;
  config: string;
}

export default function AutomationRulesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("manual");
  const [formStatus, setFormStatus] = useState("draft");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [actions, setActions] = useState<Action[]>([]);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["automation-rules", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const resetForm = () => {
    setFormName("");
    setFormTrigger("manual");
    setFormStatus("draft");
    setConditions([]);
    setActions([]);
    setCreating(false);
  };

  const addCondition = () => {
    setConditions([...conditions, { field: "lead_score", operator: "=", value: "" }]);
  };

  const updateCondition = (idx: number, updates: Partial<Condition>) => {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const addAction = () => {
    setActions([...actions, { type: "send_email", config: "" }]);
  };

  const updateAction = (idx: number, updates: Partial<Action>) => {
    setActions(actions.map((a, i) => (i === idx ? { ...a, ...updates } : a)));
  };

  const removeAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!orgId || !formName.trim()) return;
    if (conditions.length === 0) {
      toast.error("Adicione pelo menos uma condição");
      return;
    }
    if (actions.length === 0) {
      toast.error("Adicione pelo menos uma ação");
      return;
    }
    setSaving(true);

    const { error } = await supabase.from("automation_rules").insert({
      organization_id: orgId,
      name: formName,
      trigger: formTrigger,
      conditions: conditions,
      actions: actions,
      status: formStatus,
    });

    setSaving(false);
    if (error) {
      toast.error("Erro ao criar regra", { description: error.message });
    } else {
      toast.success("Regra criada com sucesso!");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    }
  };

  const handleToggleStatus = async (ruleId: string, currentStatus: string) => {
    const newSt = currentStatus === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("automation_rules")
      .update({ status: newSt })
      .eq("id", ruleId);

    if (error) {
      toast.error("Erro ao alterar status");
    } else {
      toast.success(newSt === "active" ? "Regra ativada" : "Regra pausada");
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    }
  };

  const handleDelete = async (ruleId: string) => {
    const { error } = await supabase.from("automation_rules").delete().eq("id", ruleId);

    if (error) {
      toast.error("Erro ao excluir regra");
    } else {
      toast.success("Regra removida");
      if (expandedId === ruleId) setExpandedId(null);
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
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
          <h1 className="text-2xl font-heading font-bold text-t1">Rules Engine</h1>
          <p className="text-sm text-t3 mt-1">Configure regras automáticas com condições e ações</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/automations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <Button onClick={() => { resetForm(); setCreating(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Regra
          </Button>
        </div>
      </div>

      {/* Creation form */}
      {creating && (
        <Card className="border-primary/30">
          <CardContent className="p-6 space-y-6">
            <h3 className="text-sm font-heading font-semibold">Nova Regra de Automação</h3>

            {/* Basic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nome da Regra</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Qualificar leads quentes"
                />
              </div>
              <div className="space-y-2">
                <Label>Trigger</Label>
                <select
                  value={formTrigger}
                  onChange={(e) => setFormTrigger(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                </select>
              </div>
            </div>

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Quando...</Label>
                </div>
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Condição
                </Button>
              </div>

              {conditions.length === 0 ? (
                <p className="text-xs text-t3 pl-6">
                  Nenhuma condição adicionada. Clique em &quot;+ Condição&quot; para começar.
                </p>
              ) : (
                <div className="space-y-2">
                  {conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border"
                    >
                      {idx > 0 && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          E
                        </Badge>
                      )}
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(idx, { field: e.target.value })}
                        className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm flex-1 min-w-0"
                      >
                        {CONDITION_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                        className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm w-32"
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, { value: e.target.value })}
                        placeholder="Valor"
                        className="h-9 flex-1 min-w-0"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCondition(idx)}
                        className="shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cog className="h-4 w-4 text-warning" />
                  <Label className="text-sm font-semibold">Então...</Label>
                </div>
                <Button variant="outline" size="sm" onClick={addAction}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ação
                </Button>
              </div>

              {actions.length === 0 ? (
                <p className="text-xs text-t3 pl-6">
                  Nenhuma ação adicionada. Clique em &quot;+ Ação&quot; para começar.
                </p>
              ) : (
                <div className="space-y-2">
                  {actions.map((action, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20"
                    >
                      <Badge variant="secondary" className="text-[10px] shrink-0 bg-warning/10 text-warning">
                        {idx + 1}
                      </Badge>
                      <select
                        value={action.type}
                        onChange={(e) => updateAction(idx, { type: e.target.value })}
                        className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm flex-1 min-w-0"
                      >
                        {ACTION_TYPES.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={action.config}
                        onChange={(e) => updateAction(idx, { config: e.target.value })}
                        placeholder="Configuração (ex: nome-da-tag, email@, etc.)"
                        className="h-9 flex-1 min-w-0"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAction(idx)}
                        className="shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button onClick={handleCreate} disabled={!formName.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Regra
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {rules && rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule: any) => {
            const isExpanded = expandedId === rule.id;
            const conditionsArr = Array.isArray(rule.conditions) ? rule.conditions : [];
            const actionsArr = Array.isArray(rule.actions) ? rule.actions : [];
            const triggerLabel = TRIGGERS.find((t) => t.value === rule.trigger)?.label ?? rule.trigger;

            return (
              <Card key={rule.id}>
                <CardContent className="p-0">
                  {/* Header */}
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                  >
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Zap className="h-5 w-5 text-warning" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{rule.name}</p>
                      <p className="text-xs text-t3">
                        Trigger: {triggerLabel} · {conditionsArr.length}{" "}
                        {conditionsArr.length === 1 ? "condição" : "condições"} · {actionsArr.length}{" "}
                        {actionsArr.length === 1 ? "ação" : "ações"} · {rule.executions_count ?? 0} execuções
                      </p>
                    </div>

                    <StatusBadge
                      status={
                        rule.status === "active"
                          ? "active"
                          : rule.status === "paused"
                          ? "paused"
                          : "draft"
                      }
                    />

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(rule.id, rule.status);
                        }}
                        title={rule.status === "active" ? "Pausar" : "Ativar"}
                      >
                        {rule.status === "active" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(rule.id);
                        }}
                        title="Excluir"
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

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 border-t border-border space-y-4">
                        {/* Conditions */}
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-semibold text-primary">Condições</span>
                          </div>
                          {conditionsArr.length > 0 ? (
                            conditionsArr.map((c: any, cIdx: number) => (
                              <div
                                key={cIdx}
                                className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30"
                              >
                                {cIdx > 0 && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    E
                                  </Badge>
                                )}
                                <span className="font-medium">
                                  {CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field}
                                </span>
                                <span className="text-t3">
                                  {OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator}
                                </span>
                                <Badge variant="secondary">{c.value || "—"}</Badge>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-t3">Nenhuma condição definida</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Cog className="h-3.5 w-3.5 text-warning" />
                            <span className="text-xs font-semibold text-warning">Ações</span>
                          </div>
                          {actionsArr.length > 0 ? (
                            actionsArr.map((a: any, aIdx: number) => (
                              <div
                                key={aIdx}
                                className="flex items-center gap-2 text-xs p-2 rounded bg-warning/5"
                              >
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-warning/10 text-warning"
                                >
                                  {aIdx + 1}
                                </Badge>
                                <span className="font-medium">
                                  {ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                                </span>
                                {a.config && (
                                  <span className="text-t3">→ {a.config}</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-t3">Nenhuma ação definida</p>
                          )}
                        </div>
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
            <Zap className="h-12 w-12 text-t3/30 mx-auto mb-4" />
            <p className="text-t3 mb-2">Nenhuma regra de automação criada.</p>
            <p className="text-sm text-t3">
              Crie regras para automatizar ações baseadas em triggers e condições.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
