"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, Users, TrendingUp, Clock } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const supabase = createClient();

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "segment", header: "Segmento", cell: ({ row }) => <span className="font-medium capitalize">{row.original.segment}</span> },
  { accessorKey: "avg_ltv", header: "LTV Médio", cell: ({ row }) => <span className="font-mono">{formatBRL(row.original.avg_ltv || 0)}</span> },
  { accessorKey: "contact_count", header: "Contatos", cell: ({ row }) => <span className="font-mono">{row.original.contact_count || 0}</span> },
  { accessorKey: "avg_purchase_frequency", header: "Freq. Compra", cell: ({ row }) => <span className="font-mono">{(row.original.avg_purchase_frequency || 0).toFixed(1)}</span> },
  { accessorKey: "avg_ticket", header: "Ticket Médio", cell: ({ row }) => <span className="font-mono">{formatBRL(row.original.avg_ticket || 0)}</span> },
];

export default function LTVPage() {
  const orgId = useOrgId();
  const { data: segments, isLoading } = useQuery({
    queryKey: ["ltv-segments", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ltv_by_segment").select("*").eq("organization_id", orgId!);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const avgLTV = segments && segments.length > 0
    ? segments.reduce((sum: number, s: any) => sum + (s.avg_ltv || 0), 0) / segments.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Análise de LTV" description="Lifetime Value por segmento de cliente" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="LTV Médio" value={formatBRL(avgLTV)} delay={0} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Segmentos" value={String(segments?.length || 0)} delay={1} icon={<Users className="h-4 w-4" />} />
      </div>

      {segments && segments.length > 0 && (
        <Card className="surface-glow">
          <CardHeader><CardTitle className="text-base font-heading">LTV por Segmento</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segments}>
                  <XAxis dataKey="segment" tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(240 17% 6%)", border: "1px solid hsl(240 10% 18%)", borderRadius: "8px" }} />
                  <Bar dataKey="avg_ltv" name="LTV Médio" fill="#6C5CE7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable data={segments || []} columns={columns} searchPlaceholder="Buscar segmento..." />
    </div>
  );
}
