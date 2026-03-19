"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const SEGMENT_LABELS: Record<string, string> = {
  novo: "Novo (1 compra)",
  recorrente: "Recorrente (2-5)",
  vip: "VIP (6+)",
  inativo: "Inativo (90d+)",
};

const segmentColumns: ColumnDef<any, any>[] = [
  { accessorKey: "segment", header: "Segmento", cell: ({ row }) => <span className="font-medium text-t1">{SEGMENT_LABELS[row.original.segment] || row.original.segment}</span> },
  { accessorKey: "avg_ltv", header: "LTV Medio", cell: ({ row }) => <span>{formatBRL(row.original.avg_ltv || 0)}</span> },
  { accessorKey: "contact_count", header: "Clientes", cell: ({ row }) => <span>{formatNumber(row.original.contact_count || 0)}</span> },
  { accessorKey: "avg_purchase_frequency", header: "Freq. Compra", cell: ({ row }) => <span>{(row.original.avg_purchase_frequency || 0).toFixed(1)}x</span> },
  { accessorKey: "avg_ticket", header: "Ticket Medio", cell: ({ row }) => <span>{formatBRL(row.original.avg_ticket || 0)}</span> },
];

const customerColumns: ColumnDef<any, any>[] = [
  { accessorKey: "email", header: "Cliente", cell: ({ row }) => <span className="font-medium text-t1 max-w-[250px] truncate block">{row.original.email}</span> },
  { accessorKey: "total_revenue", header: "Receita Total", cell: ({ row }) => <span className="font-semibold text-success">{formatBRL(row.original.total_revenue)}</span> },
  { accessorKey: "purchase_count", header: "Compras", cell: ({ row }) => <span>{row.original.purchase_count}</span> },
  { accessorKey: "avg_ticket", header: "Ticket Medio", cell: ({ row }) => <span>{formatBRL(row.original.avg_ticket)}</span> },
  { accessorKey: "segment", header: "Segmento", cell: ({ row }) => <span className="text-xs capitalize">{SEGMENT_LABELS[row.original.segment] || row.original.segment}</span> },
];

export default function LTVPage() {
  const orgId = useOrgId();
  const [activeTab, setActiveTab] = useState("segments");

  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ["ltv-segments", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ltv_by_segment").select("*").eq("organization_id", orgId!);
      if (error || !data || data.length === 0) return null;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ["ltv-customers", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("utmify_sales")
        .select("customer_email, revenue, sale_date")
        .eq("organization_id", orgId!)
        .eq("status", "paid");

      if (error || !data || data.length === 0) return { customers: [], segments: [] };

      const byCustomer: Record<string, { total_revenue: number; purchase_count: number; dates: string[] }> = {};
      data.forEach((s) => {
        const email = s.customer_email || "unknown";
        if (!byCustomer[email]) byCustomer[email] = { total_revenue: 0, purchase_count: 0, dates: [] };
        byCustomer[email].total_revenue += Number(s.revenue || 0);
        byCustomer[email].purchase_count += 1;
        if (s.sale_date) byCustomer[email].dates.push(s.sale_date);
      });

      const now = Date.now();
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;

      const customers = Object.entries(byCustomer).map(([email, d]) => {
        const lastDate = d.dates.length > 0 ? Math.max(...d.dates.map((dt) => new Date(dt).getTime())) : 0;
        const isInactive = lastDate > 0 && (now - lastDate) > ninetyDays;
        const segment = isInactive ? "inativo" : d.purchase_count >= 6 ? "vip" : d.purchase_count >= 2 ? "recorrente" : "novo";
        return {
          email,
          total_revenue: d.total_revenue,
          purchase_count: d.purchase_count,
          avg_ticket: d.total_revenue / d.purchase_count,
          segment,
        };
      }).sort((a, b) => b.total_revenue - a.total_revenue);

      const segMap: Record<string, { total_ltv: number; count: number; total_purchases: number; total_revenue: number }> = {};
      customers.forEach((c) => {
        if (!segMap[c.segment]) segMap[c.segment] = { total_ltv: 0, count: 0, total_purchases: 0, total_revenue: 0 };
        segMap[c.segment].total_ltv += c.total_revenue;
        segMap[c.segment].count += 1;
        segMap[c.segment].total_purchases += c.purchase_count;
        segMap[c.segment].total_revenue += c.total_revenue;
      });

      const calcSegments = Object.entries(segMap).map(([segment, d]) => ({
        segment,
        avg_ltv: d.count > 0 ? d.total_ltv / d.count : 0,
        contact_count: d.count,
        avg_purchase_frequency: d.count > 0 ? d.total_purchases / d.count : 0,
        avg_ticket: d.total_purchases > 0 ? d.total_revenue / d.total_purchases : 0,
      }));

      return { customers: customers.slice(0, 100), segments: calcSegments };
    },
    enabled: !!orgId,
  });

  const isLoading = segmentsLoading && customersLoading;
  const displaySegments = segments || customerData?.segments || [];
  const displayCustomers = customerData?.customers || [];

  const avgLTV = useMemo(() => {
    if (displaySegments.length === 0) return 0;
    const totalWeighted = displaySegments.reduce((sum: number, s: any) => sum + (s.avg_ltv || 0) * (s.contact_count || 1), 0);
    const totalCount = displaySegments.reduce((sum: number, s: any) => sum + (s.contact_count || 1), 0);
    return totalCount > 0 ? totalWeighted / totalCount : 0;
  }, [displaySegments]);

  const totalCustomers = displaySegments.reduce((sum: number, s: any) => sum + (s.contact_count || 0), 0);
  const vipCount = displaySegments.find((s: any) => s.segment === "vip")?.contact_count || 0;
  const recurrentCount = displaySegments.find((s: any) => s.segment === "recorrente")?.contact_count || 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="LTV Medio" value={formatBRL(avgLTV)} gradient="purple" />
        <MetricCard label="Total Clientes" value={formatCompact(totalCustomers)} gradient="blue" />
        <MetricCard label="Clientes VIP" value={String(vipCount)} gradient="green" />
        <MetricCard label="Recorrentes" value={String(recurrentCount)} gradient="amber" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="segments">
            Segmentos
            {displaySegments.length > 0 && (
              <span className="ml-1.5 text-2xs bg-s3 text-t2 px-1.5 py-0.5 rounded-[5px] font-medium">
                {displaySegments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="customers">
            Top Clientes
            {displayCustomers.length > 0 && (
              <span className="ml-1.5 text-2xs bg-s3 text-t2 px-1.5 py-0.5 rounded-[5px] font-medium">
                {displayCustomers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="segments">
          {displaySegments.length > 0 ? (
            <DataTable data={displaySegments} columns={segmentColumns} searchPlaceholder="Buscar segmento..." />
          ) : (
            <Card>
              <CardContent className="py-0">
                <EmptyState icon="💰" title="Sem dados de segmentos" subtitle="Os segmentos de LTV aparecerão apos vendas confirmadas no checkout." />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="customers">
          {displayCustomers.length > 0 ? (
            <DataTable data={displayCustomers} columns={customerColumns} searchPlaceholder="Buscar cliente..." />
          ) : (
            <Card>
              <CardContent className="py-0">
                <EmptyState icon="👥" title="Sem dados de clientes" subtitle="Os clientes aparecerão apos vendas confirmadas no checkout." />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
