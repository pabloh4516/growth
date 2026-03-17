"use client";

import { useUtmifySales } from "@/lib/hooks/use-supabase-data";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { KPICard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  paid: { label: "Pago", variant: "success" },
  waiting_payment: { label: "Aguardando", variant: "warning" },
  refused: { label: "Recusado", variant: "destructive" },
  refunded: { label: "Reembolsado", variant: "secondary" },
  chargedback: { label: "Chargeback", variant: "destructive" },
};

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "order_id",
    header: "Pedido",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.order_id}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = STATUS_MAP[row.original.status] || { label: row.original.status, variant: "secondary" as const };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
  },
  {
    accessorKey: "revenue",
    header: "Receita",
    cell: ({ row }) => <span className="font-mono font-semibold">{formatBRL(row.original.revenue || 0)}</span>,
  },
  {
    accessorKey: "customer_email",
    header: "Cliente",
    cell: ({ row }) => <span className="text-sm truncate max-w-[180px] block">{row.original.customer_email || "—"}</span>,
  },
  {
    accessorKey: "utm_source",
    header: "UTM Source",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.utm_source || "—"}</span>,
  },
  {
    accessorKey: "utm_campaign",
    header: "UTM Campaign",
    cell: ({ row }) => <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{row.original.utm_campaign || "—"}</span>,
  },
  {
    accessorKey: "campaigns",
    header: "Campanha Matched",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.campaigns?.name || "Sem match"}</span>
    ),
  },
  {
    accessorKey: "match_confidence",
    header: "Confiança",
    cell: ({ row }) => {
      const conf = row.original.match_confidence || 0;
      return (
        <span className={`font-mono text-xs ${conf >= 0.8 ? "text-success" : conf >= 0.5 ? "text-warning" : "text-destructive"}`}>
          {(conf * 100).toFixed(0)}%
        </span>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Data",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.original.created_at).toLocaleDateString("pt-BR")}
      </span>
    ),
  },
];

export default function SalesPage() {
  const { data: sales, isLoading } = useUtmifySales();

  const paidSales = sales?.filter((s: any) => s.status === "paid") || [];
  const totalRevenue = paidSales.reduce((sum: number, s: any) => sum + (s.revenue || 0), 0);
  const avgTicket = paidSales.length > 0 ? totalRevenue / paidSales.length : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas Reais"
        description="Dados de vendas confirmadas da Utmify — a verdade sobre seu ROAS"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Vendas" value={String(paidSales.length)} delay={0} icon={<ShoppingCart className="h-4 w-4" />} />
        <KPICard title="Receita Total" value={formatBRL(totalRevenue)} delay={1} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Ticket Médio" value={formatBRL(avgTicket)} delay={2} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard
          title="Sem Match"
          value={String(sales?.filter((s: any) => !s.matched_campaign_id).length || 0)}
          delay={3}
          icon={<AlertCircle className="h-4 w-4" />}
        />
      </div>

      <DataTable
        data={sales || []}
        columns={columns}
        searchPlaceholder="Buscar por pedido, email ou campanha..."
      />
    </div>
  );
}
