"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatCompact, formatNumber } from "@/lib/utils";
import { StatusPill } from "@/components/shared/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const supabase = createClient();

function useAdGroups() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ad-groups", orgId],
    queryFn: async () => {
      // ad_groups doesn't have organization_id, so we join through campaigns
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId!);
      if (!campaigns || campaigns.length === 0) return [];
      const campaignIds = campaigns.map((c) => c.id);
      const { data } = await supabase
        .from("ad_groups")
        .select("*, campaigns(name, objective)")
        .in("campaign_id", campaignIds)
        .order("cost", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!orgId,
  });
}

export default function AdGroupsPage() {
  const { data: adGroups, isLoading } = useAdGroups();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Grupo de Anúncio</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Campanha</th>
                  <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Impressões</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Cliques</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">CTR</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Custo</th>
                  <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">CPA</th>
                </tr>
              </thead>
              <tbody>
                {(adGroups || []).map((ag: any) => {
                  const ctr = ag.impressions > 0 ? (ag.clicks / ag.impressions) * 100 : 0;
                  const cpa = ag.conversions > 0 ? ag.cost / ag.conversions : 0;
                  return (
                    <tr key={ag.id} className="group">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1 max-w-[200px] truncate">{ag.name}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 max-w-[160px] truncate">{ag.campaigns?.name || "—"}</td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill variant={ag.status === "active" ? "active" : "paused"} />
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{formatCompact(ag.impressions || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatNumber(ag.clicks || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">{ctr.toFixed(2)}%</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1">{formatBRL(ag.cost || 0)}</td>
                      <td className="py-2.5 border-b border-border text-base text-t2 text-right group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">{formatBRL(cpa)}</td>
                    </tr>
                  );
                })}
                {(!adGroups || adGroups.length === 0) && (
                  <tr><td colSpan={8} className="py-8 text-center text-t3 text-sm">Nenhum grupo de anúncio encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
