"use client";

import { useParams, useRouter } from "next/navigation";
import { useCampaignById } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { KPICard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Pause, Play, DollarSign, MousePointerClick, TrendingUp, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const supabase = createClient();

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: campaign, isLoading } = useCampaignById(id);
  const [toggling, setToggling] = useState(false);

  const toggleStatus = async () => {
    if (!campaign) return;
    setToggling(true);
    const newStatus = campaign.status === "active" ? "paused" : "active";
    const googleStatus = newStatus === "active" ? "ENABLED" : "PAUSED";

    try {
      // 1. Get the ad account for this campaign to call Google Ads API
      const { data: adAccount } = await supabase
        .from("ad_accounts")
        .select("id")
        .eq("id", campaign.ad_account_id)
        .single();

      if (adAccount && campaign.external_id) {
        // Call Edge Function to update status in Google Ads
        await supabase.functions.invoke("google-ads-oauth", {
          body: {
            action: "update-campaign-status",
            accountId: adAccount.id,
            campaignExternalId: campaign.external_id,
            status: googleStatus,
          },
        });
      }

      // 2. Update local DB
      const { error } = await supabase.from("campaigns").update({ status: newStatus }).eq("id", campaign.id);
      if (error) throw error;

      toast.success(`Campanha ${newStatus === "active" ? "ativada" : "pausada"} no Google Ads!`);
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
    } catch (err: any) {
      // Fallback: update local DB only
      await supabase.from("campaigns").update({ status: newStatus }).eq("id", campaign.id);
      toast.warning("Status atualizado localmente", {
        description: "Não foi possível sincronizar com Google Ads. " + (err?.message || ""),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
    } finally {
      setToggling(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!campaign) return <div className="text-center py-16 text-t3">Campanha não encontrada</div>;

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <PlatformIcon platform={campaign.platform?.replace("_ads", "") || "google"} />
            <h1 className="text-xl font-heading font-bold text-t1">{campaign.name}</h1>
            <StatusBadge status={campaign.status || "draft"} />
          </div>
          <p className="text-sm text-t3 mt-1">ID: {campaign.external_id || campaign.id}</p>
        </div>
        <Button variant={campaign.status === "active" ? "destructive" : "default"} onClick={toggleStatus} disabled={toggling}>
          {toggling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : campaign.status === "active" ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {toggling ? "Atualizando..." : campaign.status === "active" ? "Pausar" : "Ativar"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Orçamento/dia" value={formatBRL(campaign.daily_budget || 0)} delay={0} icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Cliques" value={formatCompact(campaign.clicks || 0)} delay={1} icon={<MousePointerClick className="h-4 w-4" />} />
        <KPICard title="ROAS Real" value={`${(campaign.real_roas || 0).toFixed(2)}x`} delay={2} icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="Vendas Reais" value={String(campaign.real_sales_count || 0)} delay={3} icon={<Target className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-heading">Métricas Google</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              ["Impressões", formatCompact(campaign.impressions || 0)],
              ["Cliques", formatNumber(campaign.clicks || 0)],
              ["CTR", `${(campaign.ctr || 0).toFixed(2)}%`],
              ["CPC", formatBRL(campaign.cpc || 0)],
              ["Custo Total", formatBRL(campaign.cost || 0)],
              ["Conversões (Google)", String(campaign.conversions || 0)],
              ["CPA (Google)", formatBRL(campaign.cpa || 0)],
              ["ROAS (Google)", `${(campaign.roas || 0).toFixed(2)}x`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between"><span className="text-sm text-t3">{label}</span><span className="text-sm font-mono">{value}</span></div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader><CardTitle className="text-base font-heading text-primary">Métricas Reais (Utmify)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              ["Vendas Reais", String(campaign.real_sales_count || 0)],
              ["Receita Real", formatBRL(campaign.real_revenue || 0)],
              ["ROAS Real", `${(campaign.real_roas || 0).toFixed(2)}x`],
              ["CPA Real", formatBRL(campaign.real_cpa || 0)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between"><span className="text-sm text-t3">{label}</span><span className="text-sm font-mono font-semibold">{value}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>

      {campaign.ad_groups && campaign.ad_groups.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-heading">Ad Groups ({campaign.ad_groups.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {campaign.ad_groups.map((ag: any) => (
                <div key={ag.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-s2 transition-colors">
                  <span className="text-sm font-medium">{ag.name}</span>
                  <StatusBadge status={ag.status || "active"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
