"use client";

import { useState, useEffect, useCallback } from "react";
import { useIntegrations, useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { getGoogleAdsAuthUrl, syncGA4, syncSearchConsole, syncUtmify } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  utmify: { name: "Utmify", description: "Vendas reais via API", icon: "U", connectable: true },
  sellx_checkout: { name: "SellxCheckout", description: "Vendas do checkout próprio", icon: "S", connectable: true },
  sellx_pay: { name: "SellxPay", description: "Transações do gateway próprio", icon: "$", connectable: true },
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
  // Utmify state
  const [utmifyToken, setUtmifyToken] = useState("");
  const [utmifySecret, setUtmifySecret] = useState("");
  const [savingUtmify, setSavingUtmify] = useState(false);
  const [utmifyConfig, setUtmifyConfig] = useState<any>(null);
  const [loadingUtmify, setLoadingUtmify] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [syncingUtmify, setSyncingUtmify] = useState(false);
  // SellX state
  const [copiedSellxCheckout, setCopiedSellxCheckout] = useState(false);
  const [copiedSellxPay, setCopiedSellxPay] = useState(false);
  const [sellxCheckoutSecret, setSellxCheckoutSecret] = useState("");
  const [sellxPaySecret, setSellxPaySecret] = useState("");
  const [savingSellx, setSavingSellx] = useState(false);
  const [sellxConfig, setSellxConfig] = useState<any>(null);

  const connectedAccounts = adAccounts?.filter((a: any) => a.status === "connected") || [];
  const allAccounts = adAccounts || [];

  // Load Utmify config
  const loadUtmifyConfig = useCallback(async () => {
    if (!orgId) return;
    setLoadingUtmify(true);
    try {
      const { data } = await supabase
        .from("utmify_config")
        .select("*")
        .eq("organization_id", orgId)
        .single();
      if (data) {
        setUtmifyConfig(data);
        setUtmifyToken(data.api_token || "");
        setUtmifySecret(data.webhook_secret || "");
      }
    } catch {
      // No config yet
    } finally {
      setLoadingUtmify(false);
    }
  }, [orgId]);

  useEffect(() => { loadUtmifyConfig(); }, [loadUtmifyConfig]);

  // Load SellX config
  const loadSellxConfig = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("organization_id", orgId)
        .eq("type", "sellx")
        .single();
      if (data) {
        setSellxConfig(data);
        const config = data.config_json || {};
        setSellxCheckoutSecret(config.checkout_secret || "");
        setSellxPaySecret(config.pay_secret || "");
      }
    } catch { /* no config yet */ }
  }, [orgId]);

  useEffect(() => { loadSellxConfig(); }, [loadSellxConfig]);

  const handleSaveSellx = async () => {
    if (!orgId) return;
    setSavingSellx(true);
    try {
      const payload = {
        organization_id: orgId,
        type: "sellx",
        status: "connected",
        config_json: {
          checkout_secret: sellxCheckoutSecret.trim() || null,
          pay_secret: sellxPaySecret.trim() || null,
        },
      };

      if (sellxConfig?.id) {
        await supabase.from("integrations").update(payload).eq("id", sellxConfig.id);
      } else {
        await supabase.from("integrations").insert(payload);
      }

      toast.success("SellX configurado!");
      loadSellxConfig();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    } finally {
      setSavingSellx(false);
    }
  };

  const webhookUrl = orgId
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/utmify-webhook?org=${orgId}`
    : "";

  const handleSaveUtmify = async () => {
    if (!orgId) return;
    setSavingUtmify(true);
    try {
      const payload = {
        organization_id: orgId,
        api_token: utmifyToken.trim() || null,
        webhook_secret: utmifySecret.trim() || null,
        is_active: true,
      };

      if (utmifyConfig?.id) {
        const { error } = await supabase
          .from("utmify_config")
          .update(payload)
          .eq("id", utmifyConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("utmify_config")
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Utmify configurada!");
      loadUtmifyConfig();
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    } finally {
      setSavingUtmify(false);
    }
  };

  const handleDeactivateUtmify = async () => {
    if (!utmifyConfig?.id) return;
    try {
      await supabase.from("utmify_config").update({ is_active: false }).eq("id", utmifyConfig.id);
      toast.success("Utmify desativada");
      loadUtmifyConfig();
    } catch (err: any) {
      toast.error("Erro", { description: err?.message });
    }
  };

  const handleSyncUtmify = async () => {
    if (!orgId) return;
    setSyncingUtmify(true);
    try {
      const result = await syncUtmify(orgId) as any;
      const r = result?.results?.[0];
      if (r?.error) {
        toast.error("Erro ao sincronizar", { description: r.error });
      } else {
        toast.success("Utmify sincronizada!", {
          description: `${r?.ordersFound || 0} vendas encontradas, ${r?.matched || 0} vinculadas a campanhas`,
          duration: 8000,
        });
      }
    } catch (err: any) {
      toast.error("Erro ao sincronizar Utmify", { description: err?.message });
    } finally {
      setSyncingUtmify(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success("URL do webhook copiada!");
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

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

  const sellxCheckoutWebhookUrl = orgId
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sellx-webhook?org=${orgId}&source=checkout`
    : "";
  const sellxPayWebhookUrl = orgId
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sellx-webhook?org=${orgId}&source=gateway`
    : "";

  const otherIntegrations = Object.entries(INTEGRATION_META)
    .filter(([type]) => !["google_ads", "utmify", "sellx_checkout", "sellx_pay"].includes(type))
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
      {/* UTMIFY — VENDAS REAIS */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-sm">U</div>
              Utmify
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Vendas reais via webhook — calcula ROAS real das campanhas
            </p>
          </div>
          {utmifyConfig?.is_active && (
            <StatusBadge status="active" />
          )}
        </div>

        <Card className="surface-glow">
          <CardContent className="p-6 space-y-5">
            {/* Token da API */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Token da API (Utmify)</Label>
              <p className="text-xs text-muted-foreground">
                Acesse o painel da Utmify → Configurações → API → copie o token e cole aqui.
              </p>
              <Input
                type="password"
                value={utmifyToken}
                onChange={(e) => setUtmifyToken(e.target.value)}
                placeholder="Cole seu token da API da Utmify aqui..."
                className="font-mono text-sm"
              />
            </div>

            {/* Webhook Secret (opcional) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Webhook Secret (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Se a Utmify fornecer um secret para validação HMAC, cole aqui. Deixe vazio se não tiver.
              </p>
              <Input
                type="password"
                value={utmifySecret}
                onChange={(e) => setUtmifySecret(e.target.value)}
                placeholder="Secret para validação HMAC (opcional)"
                className="font-mono text-sm"
              />
            </div>

            {/* Webhook URL para copiar */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">URL do Webhook (configure na Utmify)</Label>
              <p className="text-xs text-muted-foreground">
                Copie esta URL e cole no painel da Utmify → Configurações → Webhooks → URL de notificação.
              </p>
              <div className="flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="text-xs font-mono bg-secondary/50"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button size="sm" variant="outline" onClick={handleCopyWebhook} className="shrink-0">
                  {copiedWebhook ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Botões */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSaveUtmify} disabled={savingUtmify}>
                {savingUtmify && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {utmifyConfig ? "Atualizar Configuração" : "Ativar Utmify"}
              </Button>
              {utmifyConfig?.is_active && utmifyConfig?.api_token && (
                <Button variant="outline" onClick={handleSyncUtmify} disabled={syncingUtmify}>
                  {syncingUtmify ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Testar Conexão / Sincronizar
                </Button>
              )}
              {utmifyConfig?.is_active && (
                <Button variant="ghost" className="text-destructive" onClick={handleDeactivateUtmify}>
                  <Unplug className="h-4 w-4 mr-2" />
                  Desativar
                </Button>
              )}
            </div>

            {/* Status */}
            {utmifyConfig && (
              <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={utmifyConfig.is_active ? "text-success" : "text-destructive"}>
                    {utmifyConfig.is_active ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token configurado</span>
                  <span>{utmifyConfig.api_token ? "Sim" : "Não"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HMAC Secret</span>
                  <span>{utmifyConfig.webhook_secret ? "Configurado" : "Não configurado"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SELLX — CHECKOUT + GATEWAY */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-heading font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold text-sm">$</div>
            SellX — Checkout & Gateway
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Receba vendas do seu checkout e gateway em tempo real
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SellxCheckout */}
          <Card className="surface-glow">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold">S</div>
                <div>
                  <h3 className="text-sm font-semibold">SellxCheckout</h3>
                  <p className="text-xs text-muted-foreground">Vendas do checkout — order.paid, order.refunded</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Webhook URL</Label>
                <p className="text-[11px] text-muted-foreground">
                  Cole no SellxCheckout → Configurações → Webhooks
                </p>
                <div className="flex gap-2">
                  <Input value={sellxCheckoutWebhookUrl} readOnly className="text-[11px] font-mono bg-secondary/50" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                    navigator.clipboard.writeText(sellxCheckoutWebhookUrl);
                    setCopiedSellxCheckout(true);
                    toast.success("URL copiada!");
                    setTimeout(() => setCopiedSellxCheckout(false), 2000);
                  }}>
                    {copiedSellxCheckout ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Webhook Secret (HMAC-SHA256)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Cole o secret do SellxCheckout para validar assinaturas
                </p>
                <Input
                  type="password"
                  value={sellxCheckoutSecret}
                  onChange={(e) => setSellxCheckoutSecret(e.target.value)}
                  placeholder="Cole o Webhook Secret do SellxCheckout..."
                  className="text-xs font-mono"
                />
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Eventos recebidos:</p>
                <p>order.paid → venda confirmada</p>
                <p>order.refunded → reembolso</p>
                <p>order.failed → pagamento falhou</p>
              </div>
            </CardContent>
          </Card>

          {/* SellxPay */}
          <Card className="surface-glow">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold">$</div>
                <div>
                  <h3 className="text-sm font-semibold">SellxPay</h3>
                  <p className="text-xs text-muted-foreground">Transações do gateway — PIX, cartão, boleto</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Webhook URL (ou Postback URL)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Configure via API: POST /api/v1/webhooks ou use como postback_url
                </p>
                <div className="flex gap-2">
                  <Input value={sellxPayWebhookUrl} readOnly className="text-[11px] font-mono bg-secondary/50" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                    navigator.clipboard.writeText(sellxPayWebhookUrl);
                    setCopiedSellxPay(true);
                    toast.success("URL copiada!");
                    setTimeout(() => setCopiedSellxPay(false), 2000);
                  }}>
                    {copiedSellxPay ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Webhook Secret (opcional)</Label>
                <Input
                  type="password"
                  value={sellxPaySecret}
                  onChange={(e) => setSellxPaySecret(e.target.value)}
                  placeholder="Secret do SellxPay (se houver)..."
                  className="text-xs font-mono"
                />
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Eventos recebidos:</p>
                <p>transaction.paid → pagamento confirmado</p>
                <p>transaction.reversed → estorno/reembolso</p>
                <p>transaction.chargedback → chargeback</p>
              </div>
            </CardContent>
          </Card>

          {/* Save button for secrets */}
          <div className="lg:col-span-2">
            <Button onClick={handleSaveSellx} disabled={savingSellx}>
              {savingSellx && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Secrets do SellX
            </Button>
            {sellxConfig && (
              <span className="text-xs text-muted-foreground ml-3">
                {sellxConfig.config_json?.checkout_secret ? "Checkout secret configurado" : ""}
                {sellxConfig.config_json?.checkout_secret && sellxConfig.config_json?.pay_secret ? " • " : ""}
                {sellxConfig.config_json?.pay_secret ? "Pay secret configurado" : ""}
              </span>
            )}
          </div>
        </div>
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
