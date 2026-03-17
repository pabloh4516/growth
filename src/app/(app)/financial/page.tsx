"use client";

import { useFinancialRecords } from "@/lib/hooks/use-supabase-data";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, TrendingDown, TrendingUp, PieChart } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

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
  const { data: records, isLoading } = useFinancialRecords();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const revenue = records?.filter((r: any) => r.type === "revenue").reduce((s: number, r: any) => s + (r.amount || 0), 0) || 0;
  const costs = records?.filter((r: any) => r.type !== "revenue").reduce((s: number, r: any) => s + Math.abs(r.amount || 0), 0) || 0;
  const profit = revenue - costs;

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Receitas, custos e lucratividade" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Receita Total" value={formatBRL(revenue)} delay={0} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="Custos Totais" value={formatBRL(costs)} delay={1} icon={<TrendingDown className="h-4 w-4" />} />
        <KPICard title="Lucro Líquido" value={formatBRL(profit)} change={profit > 0 ? 5 : -5} delay={2} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Margem" value={revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "0%"} delay={3} icon={<PieChart className="h-4 w-4" />} />
      </div>
      <DataTable data={records || []} columns={columns} searchPlaceholder="Buscar registros..." />
    </div>
  );
}
