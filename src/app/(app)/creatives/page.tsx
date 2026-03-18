"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreatives } from "@/lib/hooks/use-supabase-data";
import { MetricCard } from "@/components/shared/metric-card";
import { AdCard } from "@/components/shared/ad-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function CreativesPage() {
  const router = useRouter();
  const { data: creatives, isLoading } = useCreatives();
  const [filter, setFilter] = useState("all");

  const all = creatives || [];
  const googleCreatives = all.filter((c: any) => c.platform === "google" || c.platform === "google_ads");
  const tiktokCreatives = all.filter((c: any) => c.platform === "tiktok" || c.platform === "tiktok_ads");
  const fatigued = all.filter((c: any) => c.fatigue_score > 70 || c.status === "fatigued");
  const aiGenerated = all.filter((c: any) => c.source === "ai" || c.ai_generated);

  const filtered = filter === "all" ? all
    : filter === "google" ? googleCreatives
    : filter === "tiktok" ? tiktokCreatives
    : filter === "fatigued" ? fatigued
    : filter === "ai" ? aiGenerated
    : all;

  const avgCtr = all.length > 0 ? all.reduce((s: number, c: any) => s + (c.ctr || 0), 0) / all.length : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Criativos ativos" value={`${all.length}`} gradient="purple" />
        <MetricCard label="CTR médio" value={`${avgCtr.toFixed(2)}%`} gradient="green" />
        <MetricCard label="Em teste A/B" value="0" gradient="blue" />
        <MetricCard label="Fatigados" value={`${fatigued.length}`} gradient="amber" delta={fatigued.length > 0 ? `${fatigued.length}` : undefined} deltaType="down" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos ({all.length})</TabsTrigger>
          <TabsTrigger value="google">Google Ads ({googleCreatives.length})</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok ({tiktokCreatives.length})</TabsTrigger>
          <TabsTrigger value="fatigued">Fatigados ({fatigued.length})</TabsTrigger>
          <TabsTrigger value="ai">Gerados por IA ({aiGenerated.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Ad Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((creative: any, i: number) => {
          const isFatigued = creative.fatigue_score > 70 || creative.status === "fatigued";
          const isTop = creative.ctr > 5;
          return (
            <AdCard
              key={creative.id}
              name={creative.name || creative.headline || `Criativo #${i + 1}`}
              platform={creative.platform || "Google Ads"}
              ctr={creative.ctr ? `${Number(creative.ctr).toFixed(2)}%` : undefined}
              thumbnailGradient={((i % 3) + 1) as 1 | 2 | 3}
              thumbnailIcon={creative.type === "video" ? "▶" : creative.name?.slice(0, 2)?.toUpperCase() || "AD"}
              tag={isFatigued ? { label: "FATIGADO", variant: "fatigued" } : isTop ? { label: "TOP", variant: "top" } : creative.ai_generated ? { label: "IA", variant: "ai" } : undefined}
              statusLabel={isFatigued ? "⚠ CTR em queda" : isTop ? "↑ Melhor da conta" : undefined}
            />
          );
        })}
        {/* + Generate CTA */}
        <div
          onClick={() => router.push("/creatives/generate")}
          className="border-2 border-dashed border-border rounded-[12px] flex flex-col items-center justify-center py-12 text-t3 hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
        >
          <span className="text-2xl mb-2">✦</span>
          <span className="text-base font-medium">Gerar criativo com IA</span>
        </div>
      </div>

      {/* Fadiga Table */}
      {fatigued.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Análise de Fadiga</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Criativo</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Plataforma</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">CTR atual</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">CTR inicial</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Queda</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">Dias rodando</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status IA</th>
                </tr>
              </thead>
              <tbody>
                {fatigued.map((c: any) => {
                  const initialCtr = c.initial_ctr || (c.ctr || 0) * 1.5;
                  const drop = initialCtr > 0 ? ((initialCtr - (c.ctr || 0)) / initialCtr * 100) : 0;
                  return (
                    <tr key={c.id} className="group">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1">{c.name || "Criativo"}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">{c.platform || "Google"}</td>
                      <td className="py-2.5 border-b border-border text-base text-destructive text-right group-hover:bg-s2 transition-colors px-1">{(c.ctr || 0).toFixed(2)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{initialCtr.toFixed(2)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-destructive text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">-{drop.toFixed(0)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{c.days_running || "—"}</td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <span className="text-xs px-1.5 py-0.5 rounded-[5px] font-medium bg-red-dim text-destructive">Pausado pela IA</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
