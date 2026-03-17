"use client";

import { useState } from "react";
import { useIntegrations } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { getGoogleAdsAuthUrl, syncGA4, syncSearchConsole } from "@/lib/services/edge-functions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const INTEGRATION_META: Record<string, { name: string; description: string; icon: string; connectable: boolean }> = {
  google_ads: { name: "Google Ads", description: "Campanhas, métricas e ações automatizadas", icon: "G", connectable: true },
  meta_ads: { name: "Meta Ads", description: "Facebook & Instagram Ads", icon: "M", connectable: false },
  tiktok_ads: { name: "TikTok Ads", description: "Campanhas no TikTok", icon: "T", connectable: false },
  ga4: { name: "Google Analytics 4", description: "Sessões, pageviews e bounce rate", icon: "A", connectable: true },
  search_console: { name: "Search Console", description: "Rankings SEO e keywords", icon: "S", connectable: true },
  utmify: { name: "Utmify", description: "Vendas reais via webhook", icon: "U", connectable: true },
  stripe: { name: "Stripe", description: "Pagamentos via webhook", icon: "$", connectable: false },
  resend: { name: "Resend", description: "Email transacional", icon: "R", connectable: false },
  twilio: { name: "Twilio", description: "Call tracking e números", icon: "T", connectable: false },
};

export default function IntegrationsPage() {
  const orgId = useOrgId();
  const { data: integrations, isLoading, refetch } = useIntegrations();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (type: string) => {
    if (!orgId) {
      toast.error("Organização não encontrada");
      return;
    }

    setConnecting(type);

    try {
      switch (type) {
        case "google_ads": {
          const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          const redirectUri = `${canonicalOrigin}/connections/callback`;
          const result = await getGoogleAdsAuthUrl(orgId, redirectUri) as any;
          if (result?.authUrl) {
            window.location.href = result.authUrl;
            return;
          }
          toast.error("Erro ao obter URL de autenticação do Google Ads");
          break;
        }

        case "ga4": {
          await syncGA4(orgId);
          toast.success("GA4 sincronizado com sucesso!");
          refetch();
          break;
        }

        case "search_console": {
          await syncSearchConsole(orgId);
          toast.success("Search Console sincronizado com sucesso!");
          refetch();
          break;
        }

        case "utmify": {
          const webhookUrl = `${window.location.origin}/api/webhooks/utmify`;
          toast.info("Webhook Utmify", {
            description: `Configure no painel da Utmify: ${webhookUrl}`,
            duration: 10000,
          });
          break;
        }

        default:
          toast.info("Integração em breve", { description: `${INTEGRATION_META[type]?.name} será disponibilizada em breve.` });
      }
    } catch (err: any) {
      toast.error("Erro na integração", { description: err?.message || "Tente novamente." });
    } finally {
      setConnecting(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const allIntegrations = Object.entries(INTEGRATION_META).map(([type, meta]) => {
    const integration = integrations?.find((i: any) => i.type === type);
    return { type, ...meta, status: integration?.status || "disconnected", id: integration?.id };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Integrações" description="Conecte suas plataformas de marketing" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allIntegrations.map((int, idx) => (
          <motion.div key={int.type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <Card className="surface-glow hover:surface-glow-hover transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">{int.icon}</div>
                    <div>
                      <h3 className="text-sm font-semibold">{int.name}</h3>
                      <p className="text-xs text-muted-foreground">{int.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={int.status === "connected" ? "connected" : "disconnected"} />
                  <Button
                    variant={int.status === "connected" ? "outline" : "default"}
                    size="sm"
                    disabled={connecting === int.type || (!int.connectable && int.status !== "connected")}
                    onClick={() => handleConnect(int.type)}
                  >
                    {connecting === int.type && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {int.status === "connected" ? "Reconectar" : int.connectable ? "Conectar" : "Em breve"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
