"use client";

import { useAuth } from "@/lib/hooks/use-auth";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatCompact } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, MousePointerClick, DollarSign, TrendingUp } from "lucide-react";

export default function ClientPortalPage() {
  const { currentOrg } = useAuth();
  const { data: metrics, isLoading } = useDashboardMetrics(30);

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Portal do Cliente" description={`Dashboard simplificado para ${currentOrg?.name || "o cliente"}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Impressões" value={formatCompact(metrics?.impressions ?? 0)} delay={0} icon={<Eye className="h-4 w-4" />} />
        <KPICard title="Cliques" value={formatCompact(metrics?.clicks ?? 0)} delay={1} icon={<MousePointerClick className="h-4 w-4" />} />
        <KPICard title="Investimento" value={formatBRL(metrics?.cost ?? 0)} delay={2} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="ROAS" value={`${(metrics?.roas ?? 0).toFixed(2)}x`} delay={3} icon={<TrendingUp className="h-4 w-4" />} />
      </div>
      <Card className="surface-glow">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Dashboard simplificado para clientes. Relatórios e aprovações em breve.
        </CardContent>
      </Card>
    </div>
  );
}
