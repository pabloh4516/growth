"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { formatCompact } from "@/lib/utils";
import { AdCard } from "@/components/shared/ad-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Loader2 } from "lucide-react";

const supabase = createClient();

function useAds() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ads", orgId],
    queryFn: async () => {
      // Join through campaigns since ad_groups doesn't have organization_id
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId!);
      if (!campaigns || campaigns.length === 0) return [];
      const campaignIds = campaigns.map((c) => c.id);
      const { data } = await supabase
        .from("ad_groups")
        .select("id, name, status, impressions, clicks, cost, ctr, campaigns(name)")
        .in("campaign_id", campaignIds)
        .order("impressions", { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!orgId,
  });
}

export default function AdsPage() {
  const { data: ads, isLoading } = useAds();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!ads || ads.length === 0) {
    return <EmptyState icon="📢" title="Nenhum anúncio" subtitle="Conecte sua conta Google Ads para ver seus anúncios aqui" />;
  }

  return (
    <div className="animate-fade-up">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ads.map((ad: any, i: number) => (
          <AdCard
            key={ad.id}
            name={ad.name}
            platform="Google Ads"
            ctr={ad.ctr ? `${Number(ad.ctr).toFixed(2)}%` : undefined}
            thumbnailGradient={((i % 3) + 1) as 1 | 2 | 3}
            thumbnailIcon={ad.campaigns?.name?.slice(0, 3)?.toUpperCase() || "AD"}
            tag={ad.ctr > 5 ? { label: "TOP", variant: "top" } : undefined}
            statusLabel={`${formatCompact(ad.impressions || 0)} impressões • ${formatCompact(ad.clicks || 0)} cliques`}
          />
        ))}
      </div>
    </div>
  );
}
