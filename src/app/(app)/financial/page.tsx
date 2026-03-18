"use client";

import { useState } from "react";
import { useFinancialRecords } from "@/lib/hooks/use-supabase-data";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, DollarSign, TrendingDown, TrendingUp, PieChart, Plus, RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TYPE_LABELS: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "secondary" }> = {
  revenue: { label: "Receita", variant: "success" },
  ad_spend: { label: "Ads", variant: "destructive" },
  operational_cost: { label: "Operacional", variant: "warning" },
  refund: { label: "Reembolso", variant: "secondary" },
};

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "date",
    header: "Data",
    cell: ({ row }) => <span className="text-sm">{new Date(row.original.date).toLocaleDateString("pt-BR")}</span>,
  },
  {
    accessorKey: "type",
    header: "Tipo",
    cell: ({ row }) => {
      const t = TYPE_LABELS[row.original.type] || { label: row.original.type, variant: "secondary" as const };
      return <Badge variant={t.variant}>{t.label}</Badge>;
    },
  },
  { accessorKey: "category", header: "Categoria", cell: ({ row }) => <span className="text-sm">{row.original.category || "—"}</span> },
  { accessorKey: "description", header: "Descrição", cell: ({ row }) => <span className="text-sm truncate max-w-[200px] block">{row.original.description || "—"}</span> },
  {
    accessorKey: "amount",
    header: "Valor",
    cell: ({ row }) => {
      const isRevenue = row.original.type === "revenue";
      return <span className={`font-mono font-semibold ${isRevenue ? "text-success" : "text-destructive"}`}>{isRevenue ? "+" : "-"}{formatBRL(Math.abs(row.original.amount || 0))}</span>;
    },
  },
];

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

  // If no financial records but has metrics, show ad spend from Google Ads
  const effectiveAdSpend = adSpend || (metrics?.cost ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Receitas, custos e lucratividade"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Registro
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Receita Total" value={formatBRL(revenue)} delay={0} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="Custos Totais" value={formatBRL(costs || effectiveAdSpend)} delay={1} icon={<TrendingDown className="h-4 w-4" />} />
        <KPICard title="Lucro Líquido" value={formatBRL(profit)} change={profit > 0 ? 5 : -5} delay={2} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Margem" value={revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "0%"} delay={3} icon={<PieChart className="h-4 w-4" />} />
      </div>

      {creating && (
        <Card className="surface-glow border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Novo Registro Financeiro</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="revenue">Receita</option>
                  <option value="ad_spend">Gasto com Ads</option>
                  <option value="operational_cost">Custo Operacional</option>
                  <option value="refund">Reembolso</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Equipe" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição" />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!form.amount}>Salvar</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable data={records || []} columns={columns} searchPlaceholder="Buscar registros..." />
    </div>
  );
}
