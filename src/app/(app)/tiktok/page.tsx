"use client";

import { useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { PlatformHero } from "@/components/shared/platform-hero";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/utils";

export default function TikTokOverviewPage() {
  const { data: adAccounts } = useAdAccounts();

  const tiktokAccounts = (adAccounts || []).filter((a: any) => a.platform === "tiktok_ads");
  const hasAccounts = tiktokAccounts.length > 0;

  if (!hasAccounts) {
    return (
      <div className="animate-fade-up">
        <div className="max-w-[420px] mx-auto mt-12">
          <Card className="text-center p-7">
            <div className="w-14 h-14 rounded-[16px] bg-tiktok-dim text-tiktok flex items-center justify-center text-2xl font-extrabold font-heading mx-auto mb-4">T</div>
            <h2 className="font-heading text-[16px] font-bold mb-2">Conectar TikTok Ads</h2>
            <p className="text-base text-t3 leading-relaxed mb-5">Conecte sua conta TikTok Business para sincronizar campanhas, métricas e criativos automaticamente.</p>
            <Button>Conectar TikTok Ads</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PlatformHero
        platform="tiktok"
        name="TikTok Ads"
        subtitle={tiktokAccounts[0]?.account_name || "Conta conectada"}
        stats={[
          { label: "Investimento", value: formatBRL(0) },
          { label: "ROAS", value: "0.0x" },
          { label: "Campanhas", value: "0" },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Impressões" value="0" gradient="purple" />
        <MetricCard label="Cliques" value="0" gradient="blue" />
        <MetricCard label="CTR" value="0%" gradient="green" />
        <MetricCard label="CPA" value="R$0" gradient="amber" />
      </div>

      <EmptyState icon="📱" title="Dados do TikTok" subtitle="As métricas aparecerão aqui após a primeira sincronização" />
    </div>
  );
}
