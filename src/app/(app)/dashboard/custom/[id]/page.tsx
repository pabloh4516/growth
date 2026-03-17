"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { KPICard } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Eye, MousePointerClick, DollarSign, ShoppingCart, TrendingUp, Target } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const supabase = createClient();

export default function CustomDashboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const { data: metrics } = useDashboardMetrics(days);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["custom-dashboard", orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_dashboards").select("*, dashboard_widgets(*)").eq("id", id).eq("organization_id", orgId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!dashboard) return <div className="text-center py-16 text-muted-foreground">Dashboard não encontrado</div>;

  const dailyData = metrics?.daily?.map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    cost: d.cost || 0,
    revenue: d.revenue || 0,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-heading font-bold">{dashboard.name}</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Impressões" value={formatCompact(metrics?.impressions ?? 0)} delay={0} icon={<Eye className="h-4 w-4" />} />
        <KPICard title="Cliques" value={formatCompact(metrics?.clicks ?? 0)} delay={1} icon={<MousePointerClick className="h-4 w-4" />} />
        <KPICard title="Investimento" value={formatBRL(metrics?.cost ?? 0)} delay={2} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="ROAS" value={`${(metrics?.roas ?? 0).toFixed(2)}x`} delay={3} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <Card className="surface-glow">
        <CardHeader><CardTitle className="text-base font-heading">Receita vs Investimento</CardTitle></CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(240 5% 60%)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(240 17% 6%)", border: "1px solid hsl(240 10% 18%)", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="revenue" name="Receita" stroke="#6C5CE7" strokeWidth={2} fill="#6C5CE7" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="cost" name="Investimento" stroke="#00D2FF" strokeWidth={2} fill="#00D2FF" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados para o período</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
