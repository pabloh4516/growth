"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL } from "@/lib/utils";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, Users, TrendingUp, Repeat } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const supabase = createClient();

const SEGMENT_LABELS: Record<string, string> = {
  novo: "Novo (1 compra)",
  recorrente: "Recorrente (2-5)",
  vip: "VIP (6+)",
  inativo: "Inativo (90d+)",
};

const segmentColumns: ColumnDef<any, any>[] = [
  { accessorKey: "segment", header: "Segmento", cell: ({ row }) => <span className="font-medium capitalize">{SEGMENT_LABELS[row.original.segment] || row.original.segment}</span> },
  { accessorKey: "avg_ltv", header: "LTV Médio", cell: ({ row }) => <span className="font-mono">{formatBRL(row.original.avg_ltv || 0)}</span> },
  { accessorKey: "contact_count", header: "Clientes", cell: ({ row }) => <span className="font-mono">{row.original.contact_count || 0}</span> },
  { accessorKey: "avg_purchase_frequency", header: "Freq. Compra", cell: ({ row }) => <span className="font-mono">{(row.original.avg_purchase_frequency || 0).toFixed(1)}x</span> },
  { accessorKey: "avg_ticket", header: "Ticket Médio", cell: ({ row }) => <span className="font-mono">{formatBRL(row.original.avg_ticket || 0)}</span> },
];

const customerColumns: ColumnDef<any, any>[] = [
  { accessorKey: "email", header: "Cliente", cell: ({ row }) => <span className="text-sm">{row.original.email}</span> },
  { accessorKey: "total_revenue", header: "Receita Total", cell: ({ row }) => <span className="font-mono font-semibold text-success">{formatBRL(row.original.total_revenue)}</span> },
  { accessorKey: "purchase_count", header: "Compras", cell: ({ row }) => <span className="font-mono">{row.original.purchase_count}</span> },
  { accessorKey: "avg_ticket", header: "Ticket Médio", cell: ({ row }) => <span className="font-mono">{formatBRL(row.original.avg_ticket)}</span> },
  { accessorKey: "segment", header: "Segmento", cell: ({ row }) => <span className="capitalize text-xs">{SEGMENT_LABELS[row.original.segment] || row.original.segment}</span> },
];

export default function LTVPage() {
  const orgId = useOrgId();

  // Try ltv_by_segment table first (populated by cron), fallback to real-time calc from utmify_sales
  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ["ltv-segments", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ltv_by_segment").select("*").eq("organization_id", orgId!);
      if (error || !data || data.length === 0) return null;
      return data;
    },
    enabled: !!orgId,
  });

  // Real-time calculation from utmify_sales as primary/fallback
  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ["ltv-customers", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("utmify_sales")
        .select("customer_email, revenue, sale_date")
        .eq("organization_id", orgId!)
        .eq("status", "paid");

      if (error || !data || data.length === 0) return { customers: [], segments: [] };

      // Group by customer
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

      // Calculate segments from customer data
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

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const avgLTV = displaySegments.length > 0
    ? displaySegments.reduce((sum: number, s: any) => sum + (s.avg_ltv || 0) * (s.contact_count || 1), 0) / displaySegments.reduce((sum: number, s: any) => sum + (s.contact_count || 1), 0)
    : 0;
  const totalCustomers = displaySegments.reduce((sum: number, s: any) => sum + (s.contact_count || 0), 0);
  const vipCount = displaySegments.find((s: any) => s.segment === "vip")?.contact_count || 0;
  const recurrentCount = displaySegments.find((s: any) => s.segment === "recorrente")?.contact_count || 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-heading font-bold text-t1">Análise de LTV</h1>
        <p className="text-sm text-t3">Lifetime Value por segmento — calculado das vendas reais do checkout</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="LTV Médio" value={formatBRL(avgLTV)} delay={0} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Total Clientes" value={String(totalCustomers)} delay={1} icon={<Users className="h-4 w-4" />} />
        <KPICard title="Clientes VIP" value={String(vipCount)} delay={2} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="Recorrentes" value={String(recurrentCount)} delay={3} icon={<Repeat className="h-4 w-4" />} />
      </div>

      {displaySegments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-heading">LTV por Segmento</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displaySegments.map((s: any) => ({ ...s, label: SEGMENT_LABELS[s.segment] || s.segment }))}>
                  <XAxis dataKey="label" tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(240 17% 6%)", border: "1px solid hsl(240 10% 18%)", borderRadius: "8px" }} />
                  <Bar dataKey="avg_ltv" name="LTV Médio" fill="#6C5CE7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable data={displaySegments} columns={segmentColumns} searchPlaceholder="Buscar segmento..." />

      {displayCustomers.length > 0 && (
        <>
          <h3 className="text-sm font-heading font-semibold mt-8">Top Clientes por Receita</h3>
          <DataTable data={displayCustomers} columns={customerColumns} searchPlaceholder="Buscar cliente..." />
        </>
      )}
    </div>
  );
}
