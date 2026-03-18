"use client";

import { useState } from "react";
import { useUtmifySales } from "@/lib/hooks/use-supabase-data";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { KPICard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, ShoppingCart, TrendingUp, AlertCircle, Loader2, AlertTriangle, HelpCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { toast } from "sonner";
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
    meta: { className: "hidden md:table-cell" },
    cell: ({ row }) => <span className="text-xs text-t3">{row.original.utm_source || "—"}</span>,
  },
  {
    accessorKey: "utm_campaign",
    header: "UTM Campaign",
    meta: { className: "hidden md:table-cell" },
    cell: ({ row }) => <span className="text-xs text-t3 truncate max-w-[150px] block">{row.original.utm_campaign || "—"}</span>,
  },
  {
    accessorKey: "campaigns",
    header: "Campanha Matched",
    cell: ({ row }) => (
      <span className={`text-sm ${row.original.campaigns?.name ? "" : "text-t3"}`}>
        {row.original.campaigns?.name || "Sem match"}
      </span>
    ),
  },
  {
    accessorKey: "match_confidence",
    header: () => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 cursor-help">
            Confiança
            <HelpCircle className="h-3 w-3 text-t3" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[200px]">
          <p className="text-xs">Indica o grau de certeza da vinculação entre a venda e a campanha, baseado em UTMs e parâmetros de tracking.</p>
        </TooltipContent>
      </Tooltip>
    ),
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
      <span className="text-xs text-t3">
        {new Date(row.original.created_at).toLocaleDateString("pt-BR")}
      </span>
    ),
  },
];

type QuickFilter = "all" | "unmatched" | "paid" | "pending";

const supabase = createClient();

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
      toast.success("Re-match concluído!", {
        description: `${data?.newlyMatched || 0} novas vinculações, ${data?.improved || 0} melhoradas`,
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
  const unmatchedPercent = sales && sales.length > 0 ? (unmatchedCount / sales.length) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Unmatched warning */}
      {unmatchedPercent > 20 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-medium">{unmatchedCount} vendas sem vínculo com campanha ({unmatchedPercent.toFixed(0)}%)</p>
              <p className="text-xs text-t3">Verifique se os UTMs estão configurados corretamente nos links de checkout.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Vendas" value={String(paidSales.length)} delay={0} icon={<ShoppingCart className="h-4 w-4" />} />
        <KPICard title="Receita Total" value={formatBRL(totalRevenue)} delay={1} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Ticket Médio" value={formatBRL(avgTicket)} delay={2} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard
          title="Sem Match"
          value={String(unmatchedCount)}
          delay={3}
          icon={<AlertCircle className="h-4 w-4" />}
        />
      </div>

      {/* Quick filters */}
      <div className="flex items-center gap-2">
        {([
          { key: "all", label: "Todas" },
          { key: "unmatched", label: "Sem Match" },
          { key: "paid", label: "Pagas" },
          { key: "pending", label: "Pendentes" },
        ] as const).map((f) => (
          <Button
            key={f.key}
            variant={quickFilter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setQuickFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleRematch} disabled={rematching}>
            {rematching ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
            Re-vincular Campanhas
          </Button>
        </div>
      </div>

      <DataTable
        data={filteredSales}
        columns={columns}
        searchPlaceholder="Buscar por pedido, email ou campanha..."
      />
    </div>
  );
}
