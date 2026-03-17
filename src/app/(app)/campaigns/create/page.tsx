"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

const BID_STRATEGY_MAP: Record<string, string> = {
  maximize_conversions: "MAXIMIZE_CONVERSIONS",
  maximize_clicks: "MAXIMIZE_CLICKS",
  target_cpa: "TARGET_CPA",
  target_roas: "TARGET_ROAS",
  manual_cpc: "MANUAL_CPC",
};

export default function CreateCampaignPage() {
  const orgId = useOrgId();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    platform: "google_ads",
    daily_budget: "",
    bid_strategy: "maximize_conversions",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !form.name.trim()) return;
    setSaving(true);

    try {
      // 1. Try to create campaign in Google Ads if platform is google_ads
      let externalId = null;

      if (form.platform === "google_ads") {
        const { data: adAccount } = await supabase
          .from("ad_accounts")
          .select("id")
          .eq("organization_id", orgId)
          .eq("platform", "google_ads")
          .eq("status", "connected")
          .limit(1)
          .single();

        if (adAccount) {
          try {
            const { data: result } = await supabase.functions.invoke("google-ads-oauth", {
              body: {
                action: "create-campaign",
                accountId: adAccount.id,
                campaignName: form.name.trim(),
                dailyBudget: Number(form.daily_budget) || 50,
                biddingStrategy: BID_STRATEGY_MAP[form.bid_strategy] || "MAXIMIZE_CONVERSIONS",
              },
            });
            externalId = result?.campaignId || null;
          } catch (err: any) {
            console.warn("Could not create in Google Ads, saving locally:", err.message);
          }
        }
      }

      // 2. Save to local DB
      const { error } = await supabase.from("campaigns").insert({
        organization_id: orgId,
        name: form.name.trim(),
        platform: form.platform,
        daily_budget: Number(form.daily_budget) || 0,
        bid_strategy: form.bid_strategy,
        status: externalId ? "active" : "draft",
        external_id: externalId,
      });

      if (error) throw error;

      toast.success(
        externalId ? "Campanha criada no Google Ads!" : "Campanha salva como rascunho",
        { description: externalId ? "Campanha ativa no Google Ads" : "Conecte uma conta Google Ads para ativar" }
      );
      router.push("/campaigns");
    } catch (err: any) {
      toast.error("Erro ao criar campanha", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <PageHeader title="Nova Campanha" description="Crie uma nova campanha de marketing" />
      </div>

      <Card className="surface-glow">
        <CardHeader><CardTitle className="text-base font-heading">Informações da Campanha</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: [Search] Brand - Principal" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                  <option value="google_ads">Google Ads</option>
                  <option value="meta_ads">Meta Ads</option>
                  <option value="tiktok_ads">TikTok Ads</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Orçamento Diário (R$)</Label>
                <Input type="number" value={form.daily_budget} onChange={(e) => setForm({ ...form, daily_budget: e.target.value })} placeholder="100.00" step="0.01" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estratégia de Lance</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.bid_strategy} onChange={(e) => setForm({ ...form, bid_strategy: e.target.value })}>
                <option value="maximize_conversions">Maximizar Conversões</option>
                <option value="maximize_clicks">Maximizar Cliques</option>
                <option value="target_cpa">CPA Alvo</option>
                <option value="target_roas">ROAS Alvo</option>
                <option value="manual_cpc">CPC Manual</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Campanha
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
