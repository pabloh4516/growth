"use client";

import { useState } from "react";
import { useAutomationRules } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/shared/status-pill";
import { Loader2, Plus, X } from "lucide-react";

const supabase = createClient();

const METRICS = [
  { value: "roas", label: "ROAS" },
  { value: "cpa", label: "CPA" },
  { value: "ctr", label: "CTR" },
  { value: "cost", label: "Custo" },
  { value: "conversions", label: "Conversões" },
  { value: "impressions", label: "Impressões" },
  { value: "clicks", label: "Cliques" },
  { value: "cpc", label: "CPC médio" },
];

const OPERATORS = [
  { value: ">", label: "maior que" },
  { value: "<", label: "menor que" },
  { value: "=", label: "igual a" },
];

const ACTIONS = [
  { value: "pause", label: "Pausar campanha" },
  { value: "enable", label: "Ativar campanha" },
  { value: "budget_increase", label: "Aumentar budget" },
  { value: "budget_decrease", label: "Reduzir budget" },
  { value: "duplicate", label: "Duplicar campanha" },
  { value: "alert", label: "Enviar alerta" },
];

const PERIODS = [
  { value: "1", label: "últimas 24h" },
  { value: "3", label: "últimos 3 dias" },
  { value: "7", label: "últimos 7 dias" },
  { value: "14", label: "últimos 14 dias" },
  { value: "30", label: "últimos 30 dias" },
];

const TEMPLATES = [
  { id: "pausar_sem_vender", label: "Pausar se gastar sem vender", metric: "conversions", op: "=", value: "0", period: "3", action: "pause", mode: "auto" },
  { id: "escalar_roas", label: "Escalar se ROAS alto", metric: "roas", op: ">", value: "5", period: "7", action: "budget_increase", mode: "approval" },
  { id: "pausar_criativo", label: "Pausar criativo fatigado", metric: "ctr", op: "<", value: "0.5", period: "7", action: "pause", mode: "auto" },
  { id: "cortar_horario", label: "Cortar horários ruins", metric: "cpa", op: ">", value: "100", period: "7", action: "pause", mode: "auto" },
  { id: "duplicar_top", label: "Duplicar top performer", metric: "roas", op: ">", value: "8", period: "14", action: "duplicate", mode: "approval" },
  { id: "alerta_cpa", label: "Alerta CPA alto", metric: "cpa", op: ">", value: "50", period: "1", action: "alert", mode: "auto" },
];

export default function RulesPage() {
  const orgId = useOrgId();
  const { data: rules, isLoading, refetch } = useAutomationRules();
  const [builderOpen, setBuilderOpen] = useState(false);

  // Builder state
  const [ruleName, setRuleName] = useState("");
  const [metric, setMetric] = useState("roas");
  const [operator, setOperator] = useState(">");
  const [value, setValue] = useState("5");
  const [period, setPeriod] = useState("7");
  const [action, setAction] = useState("pause");
  const [mode, setMode] = useState<"auto" | "approval">("approval");
  const [actionValue, setActionValue] = useState("30");
  const [saving, setSaving] = useState(false);

  const metricLabel = METRICS.find((m) => m.value === metric)?.label || metric;
  const opLabel = OPERATORS.find((o) => o.value === operator)?.label || operator;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || period;
  const actionLabel = ACTIONS.find((a) => a.value === action)?.label || action;
  const needsValue = action === "budget_increase" || action === "budget_decrease";

  const preview = `Se ${metricLabel} ${opLabel} ${value}${metric === "ctr" || metric === "roas" ? "x" : ""} nos ${periodLabel} → ${actionLabel}${needsValue ? ` em ${actionValue}%` : ""} ${mode === "auto" ? "automaticamente" : "com aprovação"}`;

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setMetric(tpl.metric);
    setOperator(tpl.op);
    setValue(tpl.value);
    setPeriod(tpl.period);
    setAction(tpl.action);
    setMode(tpl.mode as "auto" | "approval");
    setRuleName(tpl.label);
  };

  const saveRule = async () => {
    if (!orgId || !ruleName) { toast.error("Preencha o nome da regra"); return; }
    setSaving(true);
    try {
      await supabase.from("automation_rules").insert({
        organization_id: orgId,
        name: ruleName,
        rule_type: "campaign",
        conditions: { metric, operator, value: Number(value), period_days: Number(period) },
        actions: { type: action, value: needsValue ? Number(actionValue) : null },
        mode,
        is_active: true,
        platform: "google_ads",
      });
      toast.success("Regra criada!");
      setBuilderOpen(false);
      setRuleName("");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    } finally { setSaving(false); }
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    await supabase.from("automation_rules").update({ is_active: !isActive }).eq("id", id);
    refetch();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Actions */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setBuilderOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova regra
        </Button>
      </div>

      {/* Rule Builder Modal */}
      {builderOpen && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Criar Regra Automática</CardTitle>
              <button onClick={() => setBuilderOpen(false)} className="text-t3 hover:text-t1 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Nome da regra</label>
              <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Ex: Pausar se ROAS baixo"
                className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45" />
            </div>

            {/* Condition */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Métrica</label>
                <select value={metric} onChange={(e) => setMetric(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Operador</label>
                <select value={operator} onChange={(e) => setOperator(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Valor</label>
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45" />
              </div>
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Período</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Action */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Ação</label>
                <select value={action} onChange={(e) => setAction(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {needsValue && (
                <div>
                  <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Valor (%)</label>
                  <input type="number" value={actionValue} onChange={(e) => setActionValue(e.target.value)}
                    className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45" />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Modo</label>
                <div className="flex gap-2">
                  <button onClick={() => setMode("auto")}
                    className={`flex-1 px-3 py-2 rounded-sm text-sm transition-colors cursor-pointer ${mode === "auto" ? "bg-primary text-white" : "bg-s2 border border-input text-t2 hover:text-t1"}`}>
                    Autônomo
                  </button>
                  <button onClick={() => setMode("approval")}
                    className={`flex-1 px-3 py-2 rounded-sm text-sm transition-colors cursor-pointer ${mode === "approval" ? "bg-primary text-white" : "bg-s2 border border-input text-t2 hover:text-t1"}`}>
                    Aprovação
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-s2 border border-border rounded-md p-3">
              <div className="text-xs font-medium text-t3 uppercase tracking-wide mb-1">Preview</div>
              <div className="text-base text-t1 leading-relaxed">{preview}</div>
            </div>

            {/* Templates */}
            <div>
              <div className="text-xs font-medium text-t3 uppercase tracking-wide mb-2">Templates rápidos</div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                    className="text-xs px-2.5 py-1.5 rounded-[6px] border border-border text-t2 bg-transparent hover:border-primary hover:text-primary transition-colors cursor-pointer">
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBuilderOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveRule} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Salvar regra
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Regras ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Nome</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Condição</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">Ação</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Modo</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border w-20"></th>
                </tr>
              </thead>
              <tbody>
                {(rules || []).map((rule: any) => {
                  const cond = rule.conditions || {};
                  const act = rule.actions || {};
                  return (
                    <tr key={rule.id} className="group">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1">{rule.name}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                        {cond.metric} {cond.operator} {cond.value} ({cond.period_days}d)
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{act.type}</td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-[5px] font-medium ${rule.mode === "auto" ? "bg-green-dim text-success" : "bg-purple-dim text-primary"}`}>
                          {rule.mode === "auto" ? "Autônomo" : "Aprovação"}
                        </span>
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill variant={rule.is_active ? "active" : "paused"} />
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        <button
                          onClick={() => toggleRule(rule.id, rule.is_active)}
                          className={`text-xs px-2 py-1 rounded-[5px] border transition-colors cursor-pointer ${
                            rule.is_active ? "border-destructive/30 text-destructive hover:bg-red-dim" : "border-success/30 text-success hover:bg-green-dim"
                          }`}
                        >
                          {rule.is_active ? "Pausar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {(!rules || rules.length === 0) && (
                  <tr><td colSpan={6} className="py-8 text-center text-t3 text-sm">Nenhuma regra criada. Use o botão acima para criar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
