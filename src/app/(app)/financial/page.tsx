"use client";

import { useState } from "react";
import { useFinancialRecords } from "@/lib/hooks/use-supabase-data";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TYPE_LABELS: Record<string, { label: string; variant: "active" | "paused" | "learning" | "review" }> = {
  revenue: { label: "Receita", variant: "active" },
  ad_spend: { label: "Ads", variant: "learning" },
  operational_cost: { label: "Operacional", variant: "review" },
  refund: { label: "Reembolso", variant: "paused" },
};

export default function FinancialPage() {
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const queryClient = useQueryClient();
  const { data: records, isLoading } = useFinancialRecords();
  const { data: metrics } = useDashboardMetrics(days);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: "operational_cost", amount: "", description: "", category: "", date: new Date().toISOString().split("T")[0] });

  const handleCreate = async () => {
    if (!orgId || !form.amount) return;
    const { error } = await supabase.from("financial_records").insert({
      organization_id: orgId,
      type: form.type,
      amount: parseFloat(form.amount),
      description: form.description,
      category: form.category,
      date: form.date,
    });
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Registro criado!");
      setForm({ type: "operational_cost", amount: "", description: "", category: "", date: new Date().toISOString().split("T")[0] });
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["financial-records"] });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const revenue = records?.filter((r: any) => r.type === "revenue").reduce((s: number, r: any) => s + (r.amount || 0), 0) || 0;
  const adSpend = records?.filter((r: any) => r.type === "ad_spend").reduce((s: number, r: any) => s + Math.abs(r.amount || 0), 0) || 0;
  const costs = records?.filter((r: any) => r.type !== "revenue").reduce((s: number, r: any) => s + Math.abs(r.amount || 0), 0) || 0;
  const profit = revenue - costs;
  const effectiveAdSpend = adSpend || (metrics?.cost ?? 0);
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-t1">Financeiro</h1>
          <p className="text-sm text-t3 mt-0.5">DRE simplificado e projecao de resultados</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Registro
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Receita Total"
          value={formatBRL(revenue)}
          gradient="green"
          delta={revenue > 0 ? "receita" : undefined}
          deltaType="up"
        />
        <MetricCard
          label="Custos Ads"
          value={formatBRL(effectiveAdSpend)}
          gradient="amber"
        />
        <MetricCard
          label="Custos Operacionais"
          value={formatBRL(costs > effectiveAdSpend ? costs - effectiveAdSpend : 0)}
          gradient="blue"
        />
        <MetricCard
          label="Lucro Liquido"
          value={formatBRL(profit)}
          delta={`${margin}% margem`}
          deltaType={profit >= 0 ? "up" : "down"}
          gradient="purple"
        />
      </div>

      {/* Create Form */}
      {creating && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Novo Registro Financeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Tipo</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-s2 px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="revenue">Receita</option>
                  <option value="ad_spend">Gasto com Ads</option>
                  <option value="operational_cost">Custo Operacional</option>
                  <option value="refund">Reembolso</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Valor (R$)</label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="bg-s2 border-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Categoria</label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Equipe" className="bg-s2 border-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Descricao</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descricao" className="bg-s2 border-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Data</label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="bg-s2 border-input" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} disabled={!form.amount}>Salvar</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Records Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Registros Financeiros</CardTitle>
            <span className="text-sm text-t3">{records?.length || 0} registros</span>
          </div>
        </CardHeader>
        <CardContent>
          {records && records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Data</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Categoria</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Descricao</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record: any) => {
                    const t = TYPE_LABELS[record.type] || { label: record.type, variant: "paused" as const };
                    const isRevenue = record.type === "revenue";
                    return (
                      <tr key={record.id} className="group">
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                          {new Date(record.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                          <StatusPill variant={t.variant} label={t.label} />
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                          {record.category || "—"}
                        </td>
                        <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell max-w-[200px] truncate">
                          {record.description || "—"}
                        </td>
                        <td className={`py-2.5 border-b border-border text-base font-mono font-semibold text-right group-hover:bg-s2 transition-colors px-1 ${isRevenue ? "text-success" : "text-destructive"}`}>
                          {isRevenue ? "+" : "-"}{formatBRL(Math.abs(record.amount || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="💰"
              title="Nenhum registro financeiro"
              subtitle="Adicione registros de receita e custos para acompanhar seu DRE."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Registro
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
