"use client";

import { useState } from "react";
import { useIntegrations, useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { getGoogleAdsAuthUrl, syncGA4, syncSearchConsole } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Copy, Check, Link2, Trash2, RefreshCw, ExternalLink,
  Plus, Unplug, Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

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

const PLATFORM_COLORS: Record<string, string> = {
  google_ads: "bg-blue-500/10 text-blue-400",
  meta_ads: "bg-indigo-500/10 text-indigo-400",
  tiktok_ads: "bg-pink-500/10 text-pink-400",
};

function formatDate(date: string | null) {
  if (!date) return "Nunca";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function IntegrationsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: integrations, isLoading: loadingIntegrations } = useIntegrations();
  const { data: adAccounts, isLoading: loadingAccounts, refetch: refetchAccounts } = useAdAccounts();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [multiloginLink, setMultiloginLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const connectedAccounts = adAccounts?.filter((a: any) => a.status === "connected") || [];
  const allAccounts = adAccounts || [];

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
          toast.success("GA4 sincronizado!");
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          break;
        }
        case "search_console": {
          await syncSearchConsole(orgId);
          toast.success("Search Console sincronizado!");
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          break;
        }
        case "utmify": {
          const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/utmify-webhook?org=${orgId}`;
          navigator.clipboard.writeText(webhookUrl);
          toast.success("URL do webhook copiada!", {
            description: "Cole no painel da Utmify em Configurações → Webhooks",
            duration: 10000,
          });
          break;
        }
        default:
          toast.info("Em breve", { description: `${INTEGRATION_META[type]?.name} será disponibilizada em breve.` });
      }
    } catch (err: any) {
      toast.error("Erro na integração", { description: err?.message });
    } finally {
      setConnecting(null);
    }
  };

  const handleGenerateMultiloginLink = async () => {
    if (!orgId) return;
    try {
      const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectUri = `${canonicalOrigin}/connections/callback`;
      const result = await getGoogleAdsAuthUrl(orgId, redirectUri) as any;
      if (result?.authUrl) {
        setMultiloginLink(result.authUrl);
        toast.success("Link gerado! Copie e envie para quem deve vincular a conta.");
      }
    } catch (err: any) {
      toast.error("Erro ao gerar link", { description: err?.message });
    }
  };

  const handleCopyLink = () => {
    if (!multiloginLink) return;
    navigator.clipboard.writeText(multiloginLink);
    setCopiedLink(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDisconnect = async (accountId: string, accountName: string) => {
    setDisconnecting(accountId);
    try {
      const { error } = await supabase.functions.invoke("google-ads-oauth", {
        body: { action: "disconnect", accountId },
      });
      if (error) throw error;
      toast.success(`${accountName} desconectada`);
      refetchAccounts();
    } catch (err: any) {
      toast.error("Erro ao desconectar", { description: err?.message });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSyncAccount = async (accountId: string) => {
    setSyncing(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { organizationId: orgId, scope: "full" },
      });
      if (error) throw error;
      toast.success("Sincronização concluída!", {
        description: `${data?.results?.[0]?.campaigns || 0} campanhas sincronizadas`,
      });
      refetchAccounts();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setSyncing(null);
    }
  };

  const isLoading = loadingIntegrations || loadingAccounts;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const otherIntegrations = Object.entries(INTEGRATION_META)
    .filter(([type]) => type !== "google_ads")
    .map(([type, meta]) => {
      const integration = integrations?.find((i: any) => i.type === type);
      return { type, ...meta, status: integration?.status || "disconnected", id: integration?.id };
    });

  return (
    <div className="space-y-8">
      <PageHeader title="Integrações" description="Conecte suas plataformas de marketing" />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* GOOGLE ADS — CONTAS DE ANÚNCIO */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-sm">G</div>
              Google Ads
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {connectedAccounts.length} conta{connectedAccounts.length !== 1 ? "s" : ""} conectada{connectedAccounts.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleGenerateMultiloginLink}>
              <Link2 className="h-4 w-4 mr-2" />
              Gerar Link Multilogin
            </Button>
            <Button size="sm" onClick={() => handleConnect("google_ads")} disabled={connecting === "google_ads"}>
              {connecting === "google_ads" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Conectar Conta
            </Button>
          </div>
        </div>

        {/* Link Multilogin */}
        {multiloginLink && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
            <Card className="surface-glow border-primary/30">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2">Link para vincular conta (Multilogin)</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Envie este link para quem deve autorizar o acesso à conta do Google Ads. Ao clicar, será pedida a autorização do Google e a conta será vinculada automaticamente.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={multiloginLink}
                    readOnly
                    className="text-xs font-mono bg-secondary/50"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="sm" variant="outline" onClick={handleCopyLink} className="shrink-0">
                    {copiedLink ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Lista de Contas */}
        {allAccounts.length > 0 ? (
          <div className="space-y-2">
            {allAccounts.map((account: any, idx: number) => (
              <motion.div
                key={account.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className={`surface-glow transition-all ${account.status === "connected" ? "border-success/20" : account.status === "expired" ? "border-warning/20" : "border-destructive/20"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${PLATFORM_COLORS.google_ads}`}>
                          G
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate">{account.account_name}</h3>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              ID: {account.account_id}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {account.currency_code && <span>{account.currency_code}</span>}
                            {account.timezone && <span>{account.timezone}</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Sync: {formatDate(account.last_sync_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={
                          account.status === "connected" ? "active" :
                          account.status === "expired" ? "pending" : "error"
                        } />

                        {account.status === "connected" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncAccount(account.id)}
                            disabled={syncing === account.id}
                          >
                            {syncing === account.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />
                            }
                          </Button>
                        )}

                        {account.status === "expired" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConnect("google_ads")}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Reconectar
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDisconnect(account.id, account.account_name)}
                          disabled={disconnecting === account.id}
                        >
                          {disconnecting === account.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Unplug className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="surface-glow">
            <CardContent className="py-12 text-center">
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold mx-auto mb-4">G</div>
              <p className="text-sm text-muted-foreground mb-4">Nenhuma conta do Google Ads conectada</p>
              <Button size="sm" onClick={() => handleConnect("google_ads")} disabled={connecting === "google_ads"}>
                {connecting === "google_ads" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Conectar Primeira Conta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* OUTRAS INTEGRAÇÕES */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h2 className="text-lg font-heading font-bold">Outras Integrações</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherIntegrations.map((int, idx) => (
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
    </div>
  );
}
