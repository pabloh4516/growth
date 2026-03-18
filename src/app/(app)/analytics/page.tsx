"use client";

import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, formatCompact } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const ANALYTICS_SECTIONS = [
  { href: "/analytics/search-terms", icon: "🔍", title: "Search Terms", desc: "Termos de busca e intenção" },
  { href: "/analytics/schedule", icon: "🕐", title: "Horários & Dispositivos", desc: "Performance por hora e device" },
  { href: "/analytics/geo", icon: "🌎", title: "Geográfico", desc: "Métricas por localização" },
  { href: "/analytics/placements", icon: "📍", title: "Placements", desc: "Impressões por posicionamento" },
  { href: "/analytics/quality-score", icon: "⭐", title: "Quality Score", desc: "Score e sugestões de melhoria" },
  { href: "/analytics/ltv", icon: "📈", title: "Análise LTV", desc: "Lifetime value dos clientes" },
];

export default function AnalyticsOverviewPage() {
  const { days } = usePeriodStore();
  const { data: metrics, isLoading } = useDashboardMetrics(days);

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Impressões" value={formatCompact(metrics?.impressions ?? 0)} gradient="purple" />
        <MetricCard label="Cliques" value={formatCompact(metrics?.clicks ?? 0)} gradient="blue" />
        <MetricCard label="CTR" value={`${(metrics?.ctr ?? 0).toFixed(2)}%`} gradient="green" />
        <MetricCard label="Investimento" value={formatBRL(metrics?.cost ?? 0)} gradient="amber" />
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ANALYTICS_SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="cursor-pointer group h-full">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-s2 flex items-center justify-center text-lg">{section.icon}</div>
                  <div className="flex-1">
                    <div className="text-md font-medium text-t1 group-hover:text-primary transition-colors">{section.title}</div>
                    <div className="text-xs text-t3">{section.desc}</div>
                  </div>
                  <span className="text-t4 group-hover:text-t2 transition-colors">→</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
