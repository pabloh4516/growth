"use client";

import { useState } from "react";
import { useUtmifySales } from "@/lib/hooks/use-supabase-data";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, cn } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";

const STATUS_PILL_MAP: Record<string, { variant: "active" | "paused" | "learning" | "review"; label: string }> = {
  paid: { variant: "active", label: "Pago" },
  waiting_payment: { variant: "learning", label: "Aguardando" },
  refused: { variant: "paused", label: "Recusado" },
  refunded: { variant: "review", label: "Reembolsado" },
  chargedback: { variant: "paused", label: "Chargeback" },
};

type QuickFilter = "all" | "unmatched" | "paid" | "pending";

const supabase = createClient();

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "created_at", header: "Data", cell: ({ row }) => <span className="text-xs text-t3">{new Date(row.original.created_at).toLocaleDateString("pt-BR")}</span> },
  { accessorKey: "order_id", header: "Pedido", cell: ({ row }) => <span className="font-mono text-xs">{row.original.order_id}</span> },
  { accessorKey: "customer_email", header: "Cliente", cell: ({ row }) => <span className="text-sm truncate max-w-[180px] block">{row.original.customer_email || "---"}</span> },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = STATUS_PILL_MAP[row.original.status] || { variant: "paused" as const, label: row.original.status };
      return <StatusPill variant={status.variant} label={status.label} />;
    },
  },
  { accessorKey: "revenue", header: "Valor", cell: ({ row }) => <span className="font-mono font-semibold text-t1">{formatBRL(row.original.revenue || 0)}</span> },
  { accessorKey: "utm_source", header: "UTM Source", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-t3">{row.original.utm_source || "—"}</span> },
  { accessorKey: "utm_campaign", header: "UTM Campaign", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-t3 truncate max-w-[120px] block">{row.original.utm_campaign || "—"}</span> },
  {
    accessorKey: "campaigns",
    header: "Campanha",
    cell: ({ row }) => (
      <span className={cn("text-sm", row.original.campaigns?.name ? "text-t1" : "text-t3")}>
        {row.original.campaigns?.name || "Sem match"}
      </span>
    ),
  },
  {
    accessorKey: "match_confidence",
    header: "Confianca",
    cell: ({ row }) => {
      const conf = row.original.match_confidence || 0;
      return (
        <span className={cn("font-mono text-xs", conf >= 0.8 ? "text-success" : conf >= 0.5 ? "text-warning" : "text-t3")}>
          {(conf * 100).toFixed(0)}%
        </span>
      );
    },
  },
];

export default function SalesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { days } = usePeriodStore();
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [rematching, setRematching] = useState(false);

  const handleRematch = async () => {
    if (!orgId) return;
    setRematching(true);
    try {
      const { data, error } = await supabase.functions.invoke("rematch-sales", {
        body: { organizationId: orgId },
      });
      if (error) throw error;
      toast.success("Re-match concluido!", {
        description: `${data?.newlyMatched || 0} novas vinculacoes, ${data?.improved || 0} melhoradas`,
      });
      queryClient.invalidateQueries({ queryKey: ["utmify-sales"] });
      queryClient.invalidateQueries({ queryKey: ["checkout-sales"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error("Erro no re-match", { description: err?.message });
    } finally {
      setRematching(false);
    }
  };

  const dateFrom = (() => {
    const d = new Date();
    if (days <= 1) { d.setHours(0, 0, 0, 0); } else { d.setDate(d.getDate() - days); }
    return d.toISOString();
  })();

  const { data: sales, isLoading } = useUtmifySales({ dateFrom });

  const filteredSales = (() => {
    if (!sales) return [];
    switch (quickFilter) {
      case "unmatched": return sales.filter((s: any) => !s.matched_campaign_id);
      case "paid": return sales.filter((s: any) => s.status === "paid");
      case "pending": return sales.filter((s: any) => s.status === "waiting_payment");
      default: return sales;
    }
  })();

  const paidSales = sales?.filter((s: any) => s.status === "paid") || [];
  const totalRevenue = paidSales.reduce((sum: number, s: any) => sum + (s.revenue || 0), 0);
  const avgTicket = paidSales.length > 0 ? totalRevenue / paidSales.length : 0;
  const unmatchedCount = sales?.filter((s: any) => !s.matched_campaign_id).length || 0;
  const matchRate = sales && sales.length > 0 ? (((sales.length - unmatchedCount) / sales.length) * 100).toFixed(0) : "0";
  const unmatchedPercent = sales && sales.length > 0 ? (unmatchedCount / sales.length) * 100 : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Unmatched warning */}
      {unmatchedPercent > 20 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-dim border border-border">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium text-t1">{unmatchedCount} vendas sem vinculo com campanha ({unmatchedPercent.toFixed(0)}%)</p>
            <p className="text-xs text-t3">Verifique se os UTMs estao configurados corretamente nos links de checkout.</p>
          </div>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Vendas Pagas" value={String(paidSales.length)} gradient="green" />
        <MetricCard label="Receita Total" value={formatBRL(totalRevenue)} gradient="blue" />
        <MetricCard label="Ticket Medio" value={formatBRL(avgTicket)} gradient="purple" />
        <MetricCard label="Taxa de Match" value={`${matchRate}%`} gradient="amber" />
      </div>

      {/* Quick filters + rematch */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-s2 rounded-lg p-1">
          {([
            { key: "all", label: "Todas" },
            { key: "unmatched", label: "Sem Match" },
            { key: "paid", label: "Pagas" },
            { key: "pending", label: "Pendentes" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                quickFilter === f.key ? "bg-card text-t1 border border-border" : "text-t3 hover:text-t1"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleRematch} disabled={rematching}>
            {rematching ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
            Re-vincular Campanhas
          </Button>
        </div>
      </div>

      {/* Sales table */}
      {filteredSales.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon="🛒" title="Nenhuma venda encontrada" subtitle="As vendas aparecerao aqui quando forem recebidas via webhook." />
          </CardContent>
        </Card>
      ) : (
        <DataTable data={filteredSales} columns={columns} searchPlaceholder="Buscar por pedido, email ou campanha..." />
      )}
    </div>
  );
}
