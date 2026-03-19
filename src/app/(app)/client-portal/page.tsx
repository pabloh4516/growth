"use client";

import { useAuth } from "@/lib/hooks/use-auth";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function ClientPortalPage() {
  const { currentOrg } = useAuth();
  const { data: metrics, isLoading } = useDashboardMetrics(30);

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Portal do Cliente</h1>
        <p className="text-sm text-t3">Dashboard simplificado para {currentOrg?.name || "o cliente"}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Impressoes" value={formatCompact(metrics?.impressions ?? 0)} gradient="purple" />
        <MetricCard label="Cliques" value={formatCompact(metrics?.clicks ?? 0)} gradient="blue" />
        <MetricCard label="Investimento" value={formatBRL(metrics?.cost ?? 0)} gradient="amber" />
        <MetricCard label="ROAS" value={`${(metrics?.roas ?? 0).toFixed(2)}x`} gradient="green" />
      </div>

      <Card>
        <CardContent className="py-8 text-center text-sm text-t3">
          Dashboard simplificado para clientes. Relatorios e aprovacoes em breve.
        </CardContent>
      </Card>
    </div>
  );
}
