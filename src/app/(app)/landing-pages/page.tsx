"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

const supabase = createClient();

export default function LandingPagesPage() {
  const orgId = useOrgId();
  const { data: pages, isLoading } = useQuery({
    queryKey: ["landing-pages", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("landing_pages").select("*, page_metrics_daily(*)").eq("organization_id", orgId!).order("created_at", { ascending: false });
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Landing Pages" description="Métricas das suas landing pages" />
      {pages && pages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page: any, idx: number) => {
            const latestMetrics = page.page_metrics_daily?.[0];
            return (
              <motion.div key={page.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold truncate">{page.name}</h3>
                      </div>
                      <StatusBadge status={page.status === "active" ? "active" : "paused"} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-3">{page.url}</p>
                    {latestMetrics && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-[10px] text-muted-foreground">Visitantes</p><p className="text-xs font-mono font-semibold">{latestMetrics.visitors || 0}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Conversão</p><p className="text-xs font-mono font-semibold">{(latestMetrics.conversion_rate || 0).toFixed(1)}%</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Bounce</p><p className="text-xs font-mono font-semibold">{(latestMetrics.bounce_rate || 0).toFixed(1)}%</p></div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="surface-glow"><CardContent className="py-16 text-center"><p className="text-muted-foreground">Nenhuma landing page cadastrada.</p></CardContent></Card>
      )}
    </div>
  );
}
