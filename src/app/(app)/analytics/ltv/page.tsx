"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

const supabase = createClient();

const SEGMENT_LABELS: Record<string, string> = {
  novo: "Novo (1 compra)",
  recorrente: "Recorrente (2-5)",
  vip: "VIP (6+)",
  inativo: "Inativo (90d+)",
};

export default function LTVPage() {
  const orgId = useOrgId();
  const [activeTab, setActiveTab] = useState("segments");

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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>LTV por Segmento</CardTitle>
                  <span className="text-sm text-t3">{displaySegments.length} segmentos</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Segmento</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">LTV Medio</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Clientes</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Freq. Compra</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Ticket Medio</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">% do Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displaySegments.map((s: any) => {
                        const pct = totalCustomers > 0 ? ((s.contact_count || 0) / totalCustomers) * 100 : 0;
                        return (
                          <tr key={s.segment} className="group cursor-default">
                            <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1">
                              {SEGMENT_LABELS[s.segment] || s.segment}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatBRL(s.avg_ltv || 0)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatNumber(s.contact_count || 0)}
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {(s.avg_purchase_frequency || 0).toFixed(1)}x
                            </td>
                            <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                              {formatBRL(s.avg_ticket || 0)}
                            </td>
                            <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                              <div className="flex items-center gap-2">
                                <div className="w-[50px] h-[3px] bg-s3 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-base text-t2">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon="💰"
                  title="Sem dados de segmentos"
                  subtitle="Os segmentos de LTV aparecerão apos vendas confirmadas no checkout."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="customers">
          {displayCustomers.length > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Top Clientes por Receita</CardTitle>
                  <span className="text-sm text-t3">{displayCustomers.length} clientes</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Cliente</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Receita Total</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Compras</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Ticket Medio</th>
                        <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Segmento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCustomers.map((c: any, idx: number) => (
                        <tr key={idx} className="group cursor-default">
                          <td className="py-2.5 border-b border-border text-base text-t1 font-medium group-hover:bg-s2 transition-colors px-1 max-w-[250px] truncate">
                            {c.email}
                          </td>
                          <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                            <span className="text-base font-semibold text-success">{formatBRL(c.total_revenue)}</span>
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {c.purchase_count}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            {formatBRL(c.avg_ticket)}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-xs capitalize">{SEGMENT_LABELS[c.segment] || c.segment}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon="👥"
                  title="Sem dados de clientes"
                  subtitle="Os clientes aparecerão apos vendas confirmadas no checkout."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
