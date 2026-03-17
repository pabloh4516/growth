"use client";

import { useState } from "react";
import { useAlerts } from "@/lib/hooks/use-supabase-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Bell,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Plus,
  Trash2,
  Pencil,
  Shield,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const supabase = createClient();

const SEVERITY_CONFIG = {
  low: { icon: Info, color: "text-info", bg: "bg-info/10", label: "Baixa" },
  medium: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Média" },
  high: { icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10", label: "Alta" },
  critical: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Crítica" },
};

const METRICS = [
  { value: "CPA", label: "CPA (Custo por Aquisição)" },
  { value: "ROAS", label: "ROAS (Retorno sobre Ad Spend)" },
  { value: "CTR", label: "CTR (Click-Through Rate)" },
  { value: "budget_spent_pct", label: "% Budget Gasto" },
  { value: "conversion_rate", label: "Taxa de Conversão" },
  { value: "cost", label: "Custo Total" },
];

const OPERATORS = [
  { value: ">", label: "Maior que" },
  { value: "<", label: "Menor que" },
  { value: ">=", label: "Maior ou igual a" },
  { value: "<=", label: "Menor ou igual a" },
  { value: "=", label: "Igual a" },
];

export default function AlertsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: alerts, isLoading: loadingAlerts } = useAlerts();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for alert rules
  const [formMetric, setFormMetric] = useState("CPA");
  const [formOperator, setFormOperator] = useState(">");
  const [formThreshold, setFormThreshold] = useState("");
  const [formSeverity, setFormSeverity] = useState("medium");
  const [formEnabled, setFormEnabled] = useState(true);

  const { data: alertRules, isLoading: loadingRules } = useQuery({
    queryKey: ["alert-rules", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const handleResolve = async (alertId: string) => {
    const { error } = await supabase
      .from("alerts")
      .update({ status: "resolved" })
      .eq("id", alertId);

    if (error) {
      toast.error("Erro ao resolver alerta");
    } else {
      toast.success("Alerta resolvido");
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  };

  const resetRuleForm = () => {
    setFormMetric("CPA");
    setFormOperator(">");
    setFormThreshold("");
    setFormSeverity("medium");
    setFormEnabled(true);
    setCreating(false);
    setEditingId(null);
  };

  const handleCreateRule = async () => {
    if (!orgId || !formThreshold) return;
    setSaving(true);

    const payload = {
      organization_id: orgId,
      metric: formMetric,
      operator: formOperator,
      threshold: parseFloat(formThreshold),
      severity: formSeverity,
      enabled: formEnabled,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("alert_rules")
        .update(payload)
        .eq("id", editingId));
    } else {
      ({ error } = await supabase.from("alert_rules").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar regra", { description: error.message });
    } else {
      toast.success(editingId ? "Regra atualizada!" : "Regra criada!");
      resetRuleForm();
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    }
  };

  const handleEditRule = (rule: any) => {
    setEditingId(rule.id);
    setFormMetric(rule.metric || "CPA");
    setFormOperator(rule.operator || ">");
    setFormThreshold(String(rule.threshold ?? ""));
    setFormSeverity(rule.severity || "medium");
    setFormEnabled(rule.enabled ?? true);
    setCreating(true);
  };

  const handleDeleteRule = async (ruleId: string) => {
    const { error } = await supabase.from("alert_rules").delete().eq("id", ruleId);

    if (error) {
      toast.error("Erro ao excluir regra");
    } else {
      toast.success("Regra removida");
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    }
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    const { error } = await supabase
      .from("alert_rules")
      .update({ enabled: !currentEnabled })
      .eq("id", ruleId);

    if (error) {
      toast.error("Erro ao alterar status");
    } else {
      toast.success(!currentEnabled ? "Regra ativada" : "Regra desativada");
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    }
  };

  if (loadingAlerts && loadingRules) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeAlerts = alerts?.filter((a: any) => a.status === "active") || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description={`${activeAlerts.length} alerta(s) ativo(s)`}
      />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            <Bell className="h-4 w-4 mr-2" />
            Alertas Ativos
            {activeAlerts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {activeAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Shield className="h-4 w-4 mr-2" />
            Regras de Alerta
            {alertRules && alertRules.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {alertRules.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Alerts */}
        <TabsContent value="active">
          {alerts && alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert: any, idx: number) => {
                const severity =
                  SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ||
                  SEVERITY_CONFIG.medium;
                const Icon = severity.icon;
                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "surface-glow",
                        alert.status === "active" && "border-l-2 border-l-warning"
                      )}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className={cn("p-2 rounded-lg", severity.bg)}>
                          <Icon className={cn("h-4 w-4", severity.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{alert.title}</p>
                            <Badge
                              variant={alert.status === "active" ? "warning" : "success"}
                              className="text-[10px]"
                            >
                              {alert.status === "active" ? "Ativo" : "Resolvido"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{alert.message}</p>
                          {alert.triggered_at && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(alert.triggered_at).toLocaleString("pt-BR")}
                            </p>
                          )}
                        </div>
                        {alert.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResolve(alert.id)}
                            title="Resolver alerta"
                          >
                            <CheckCircle className="h-4 w-4 text-success" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <Card className="surface-glow">
              <CardContent className="py-16 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum alerta registrado.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Alert Rules */}
        <TabsContent value="rules">
          <div className="space-y-4">
            {/* Add Rule button */}
            <div className="flex justify-end">
              <Button onClick={() => { resetRuleForm(); setCreating(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Regra
              </Button>
            </div>

            {/* Rule creation/edit form */}
            <AnimatePresence>
              {creating && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card className="surface-glow border-primary/30">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-heading font-semibold">
                          {editingId ? "Editar Regra" : "Nova Regra de Alerta"}
                        </h3>
                        <Button variant="ghost" size="sm" onClick={resetRuleForm}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="space-y-2">
                          <Label>Métrica</Label>
                          <select
                            value={formMetric}
                            onChange={(e) => setFormMetric(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {METRICS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Operador</Label>
                          <select
                            value={formOperator}
                            onChange={(e) => setFormOperator(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {OPERATORS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Limite (Threshold)</Label>
                          <Input
                            type="number"
                            value={formThreshold}
                            onChange={(e) => setFormThreshold(e.target.value)}
                            placeholder="Ex: 50.00"
                            step="0.01"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Severidade</Label>
                          <select
                            value={formSeverity}
                            onChange={(e) => setFormSeverity(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
                              <option key={key} value={key}>
                                {cfg.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Habilitada</Label>
                          <button
                            onClick={() => setFormEnabled(!formEnabled)}
                            className={cn(
                              "flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors",
                              formEnabled
                                ? "bg-success/10 border-success/30 text-success"
                                : "bg-muted border-input text-muted-foreground"
                            )}
                          >
                            {formEnabled ? "Sim" : "Não"}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          onClick={handleCreateRule}
                          disabled={!formThreshold || saving}
                        >
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {editingId ? "Salvar Alterações" : "Criar Regra"}
                        </Button>
                        <Button variant="ghost" onClick={resetRuleForm}>
                          Cancelar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Rules list */}
            {alertRules && alertRules.length > 0 ? (
              <div className="space-y-3">
                {alertRules.map((rule: any, idx: number) => {
                  const severity =
                    SEVERITY_CONFIG[rule.severity as keyof typeof SEVERITY_CONFIG] ||
                    SEVERITY_CONFIG.medium;
                  const Icon = severity.icon;
                  const metricLabel = METRICS.find((m) => m.value === rule.metric)?.label ?? rule.metric;
                  const operatorLabel = OPERATORS.find((o) => o.value === rule.operator)?.label ?? rule.operator;

                  return (
                    <motion.div
                      key={rule.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className={cn(
                          "surface-glow",
                          !rule.enabled && "opacity-60"
                        )}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className={cn("p-2 rounded-lg", severity.bg)}>
                            <Icon className={cn("h-4 w-4", severity.color)} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium">
                                {metricLabel}
                              </p>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px]",
                                  rule.enabled
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {rule.enabled ? "Ativa" : "Desativada"}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={cn("text-[10px]", severity.bg, severity.color)}
                              >
                                {severity.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Alertar quando {rule.metric} {operatorLabel.toLowerCase()} {rule.threshold}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleRule(rule.id, rule.enabled)}
                              title={rule.enabled ? "Desativar" : "Ativar"}
                            >
                              {rule.enabled ? (
                                <CheckCircle className="h-4 w-4 text-success" />
                              ) : (
                                <Bell className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditRule(rule)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <Card className="surface-glow">
                <CardContent className="py-16 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    Nenhuma regra de alerta configurada.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Crie regras para ser notificado quando métricas ultrapassarem limites definidos.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
