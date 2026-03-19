"use client";

import { useState, useEffect, useCallback } from "react";
import { useIntegrations, useAdAccounts } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { getGoogleAdsAuthUrl, syncGA4, syncSearchConsole, syncUtmify } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Copy, Check, Link2, Trash2, RefreshCw, ExternalLink,
  Plus, Unplug, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const INTEGRATION_META: Record<string, { name: string; description: string; icon: string; color: string; connectable: boolean }> = {
  google_ads: { name: "Google Ads", description: "Campanhas, metricas e acoes automatizadas", icon: "G", color: "bg-blue-500/10 text-blue-400", connectable: true },
  meta_ads: { name: "Meta Ads", description: "Facebook & Instagram Ads", icon: "M", color: "bg-indigo-500/10 text-indigo-400", connectable: false },
  tiktok_ads: { name: "TikTok Ads", description: "Campanhas no TikTok", icon: "T", color: "bg-pink-500/10 text-pink-400", connectable: false },
  ga4: { name: "Google Analytics 4", description: "Sessoes, pageviews e bounce rate", icon: "A", color: "bg-orange-500/10 text-orange-400", connectable: true },
  search_console: { name: "Search Console", description: "Rankings SEO e keywords", icon: "S", color: "bg-teal-500/10 text-teal-400", connectable: true },
  utmify: { name: "Utmify", description: "Vendas reais via API", icon: "U", color: "bg-emerald-500/10 text-emerald-400", connectable: true },
  sellx_checkout: { name: "SellxCheckout", description: "Vendas do checkout proprio", icon: "S", color: "bg-violet-500/10 text-violet-400", connectable: true },
  sellx_pay: { name: "SellxPay", description: "Transacoes do gateway proprio", icon: "$", color: "bg-amber-500/10 text-amber-400", connectable: true },
  stripe: { name: "Stripe", description: "Pagamentos via webhook", icon: "$", color: "bg-purple-500/10 text-purple-400", connectable: false },
  resend: { name: "Resend", description: "Email transacional", icon: "R", color: "bg-cyan-500/10 text-cyan-400", connectable: false },
  twilio: { name: "Twilio", description: "Call tracking e numeros", icon: "T", color: "bg-red-500/10 text-red-400", connectable: false },
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
  const [sellxPayApiToken, setSellxPayApiToken] = useState("");
  const [savingSellx, setSavingSellx] = useState(false);
  const [sellxConfig, setSellxConfig] = useState<any>(null);
  const [syncingSellx, setSyncingSellx] = useState(false);

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
        setSellxPayApiToken(config.pay_api_token || "");
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
          pay_api_token: sellxPayApiToken.trim() || null,
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
      toast.error("Organizacao nao encontrada");
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
          toast.error("Erro ao obter URL de autenticacao do Google Ads");
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
            description: "Cole no painel da Utmify em Configuracoes > Webhooks",
            duration: 10000,
          });
          break;
        }
        default:
          toast.info("Em breve", { description: `${INTEGRATION_META[type]?.name} sera disponibilizada em breve.` });
      }
    } catch (err: any) {
      toast.error("Erro na integracao", { description: err?.message });
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
      toast.success("Sincronizacao concluida!", {
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
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Integracoes</h1>
        <p className="text-sm text-t3 mt-0.5">Conecte suas plataformas de marketing e vendas</p>
      </div>

      {/* ─── GOOGLE ADS ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-sm">G</div>
              <div>
                <CardTitle>Google Ads</CardTitle>
                <p className="text-xs text-t3 mt-0.5">
                  {connectedAccounts.length} conta{connectedAccounts.length !== 1 ? "s" : ""} conectada{connectedAccounts.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerateMultiloginLink}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Multilogin
              </Button>
              <Button size="sm" onClick={() => handleConnect("google_ads")} disabled={connecting === "google_ads"}>
                {connecting === "google_ads" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Conectar Conta
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Multilogin Link */}
          {multiloginLink && (
            <div className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-xs text-t3 mb-2">Envie este link para quem deve autorizar o acesso:</p>
              <div className="flex gap-2">
                <Input
                  value={multiloginLink}
                  readOnly
                  className="text-xs font-mono bg-s2 border-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button size="sm" variant="outline" onClick={handleCopyLink} className="shrink-0">
                  {copiedLink ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Accounts Table */}
          {allAccounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Conta</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">ID</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Status</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden lg:table-cell">Ultimo Sync</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {allAccounts.map((account: any) => (
                    <tr key={account.id} className="group">
                      <td className="py-2.5 border-b border-border text-base font-medium text-t1 group-hover:bg-s2 transition-colors px-1">
                        {account.account_name}
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                        <span className="font-mono text-xs text-t3">{account.account_id}</span>
                      </td>
                      <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                        <StatusPill
                          variant={account.status === "connected" ? "active" : account.status === "expired" ? "learning" : "paused"}
                          label={account.status === "connected" ? "Conectado" : account.status === "expired" ? "Expirado" : "Desconectado"}
                        />
                      </td>
                      <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden lg:table-cell">
                        <span className="text-xs text-t3">{formatDate(account.last_sync_at)}</span>
                      </td>
                      <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                        <div className="flex items-center justify-end gap-1">
                          {account.status === "connected" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
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
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleConnect("google_ads")}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Reconectar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDisconnect(account.id, account.account_name)}
                            disabled={disconnecting === account.id}
                          >
                            {disconnecting === account.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Unplug className="h-3.5 w-3.5" />
                            }
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="📡"
              title="Nenhuma conta conectada"
              subtitle="Conecte sua primeira conta do Google Ads para sincronizar campanhas."
              action={
                <Button size="sm" onClick={() => handleConnect("google_ads")} disabled={connecting === "google_ads"}>
                  {connecting === "google_ads" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Conectar Primeira Conta
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* ─── UTMIFY ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-sm">U</div>
              <div>
                <CardTitle>Utmify</CardTitle>
                <p className="text-xs text-t3 mt-0.5">Vendas reais via webhook — calcula ROAS real das campanhas</p>
              </div>
            </div>
            {utmifyConfig?.is_active && (
              <StatusPill variant="active" label="Conectado" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token da API */}
          <div className="space-y-1.5">
            <label className="text-xs text-t3 uppercase tracking-wide font-medium">Token da API (Utmify)</label>
            <p className="text-xs text-t3">{"Acesse o painel da Utmify > Configuracoes > API > copie o token."}</p>
            <Input
              type="password"
              value={utmifyToken}
              onChange={(e) => setUtmifyToken(e.target.value)}
              placeholder="Cole seu token da API da Utmify aqui..."
              className="font-mono text-sm bg-s2 border-input"
            />
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1.5">
            <label className="text-xs text-t3 uppercase tracking-wide font-medium">Webhook Secret (opcional)</label>
            <Input
              type="password"
              value={utmifySecret}
              onChange={(e) => setUtmifySecret(e.target.value)}
              placeholder="Secret para validacao HMAC (opcional)"
              className="font-mono text-sm bg-s2 border-input"
            />
          </div>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="text-xs text-t3 uppercase tracking-wide font-medium">URL do Webhook</label>
            <p className="text-xs text-t3">{"Cole no painel da Utmify > Configuracoes > Webhooks."}</p>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="text-xs font-mono bg-s2 border-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button size="sm" variant="outline" onClick={handleCopyWebhook} className="shrink-0">
                {copiedWebhook ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSaveUtmify} disabled={savingUtmify}>
              {savingUtmify && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {utmifyConfig ? "Atualizar" : "Ativar Utmify"}
            </Button>
            {utmifyConfig?.is_active && utmifyConfig?.api_token && (
              <Button variant="outline" onClick={handleSyncUtmify} disabled={syncingUtmify}>
                {syncingUtmify ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sincronizar
              </Button>
            )}
            {utmifyConfig?.is_active && (
              <Button variant="ghost" className="text-destructive" onClick={handleDeactivateUtmify}>
                <Unplug className="h-4 w-4 mr-2" />
                Desativar
              </Button>
            )}
          </div>

          {/* Status Info */}
          {utmifyConfig && (
            <div className="rounded-lg bg-s2 border border-border p-3">
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="text-t3 py-1">Status</td>
                    <td className="text-right py-1">
                      <StatusPill
                        variant={utmifyConfig.is_active ? "active" : "paused"}
                        label={utmifyConfig.is_active ? "Ativa" : "Inativa"}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="text-t3 py-1">Token configurado</td>
                    <td className="text-right py-1 text-t2">{utmifyConfig.api_token ? "Sim" : "Nao"}</td>
                  </tr>
                  <tr>
                    <td className="text-t3 py-1">HMAC Secret</td>
                    <td className="text-right py-1 text-t2">{utmifyConfig.webhook_secret ? "Configurado" : "Nao configurado"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── SELLX ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold text-sm">$</div>
            <div>
              <CardTitle>SellX — Checkout & Gateway</CardTitle>
              <p className="text-xs text-t3 mt-0.5">Receba vendas do seu checkout e gateway em tempo real</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* SellxCheckout */}
            <div className="rounded-lg border border-border bg-s2/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 font-bold text-sm">S</div>
                <div>
                  <h3 className="text-base font-medium text-t1">SellxCheckout</h3>
                  <p className="text-xs text-t3">order.paid, order.refunded</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Webhook URL</label>
                <div className="flex gap-2">
                  <Input value={sellxCheckoutWebhookUrl} readOnly className="text-[11px] font-mono bg-s2 border-input" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                    navigator.clipboard.writeText(sellxCheckoutWebhookUrl);
                    setCopiedSellxCheckout(true);
                    toast.success("URL copiada!");
                    setTimeout(() => setCopiedSellxCheckout(false), 2000);
                  }}>
                    {copiedSellxCheckout ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Webhook Secret (HMAC-SHA256)</label>
                <Input
                  type="password"
                  value={sellxCheckoutSecret}
                  onChange={(e) => setSellxCheckoutSecret(e.target.value)}
                  placeholder="Cole o Webhook Secret..."
                  className="text-xs font-mono bg-s2 border-input"
                />
              </div>
            </div>

            {/* SellxPay */}
            <div className="rounded-lg border border-border bg-s2/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold text-sm">$</div>
                <div>
                  <h3 className="text-base font-medium text-t1">SellxPay</h3>
                  <p className="text-xs text-t3">PIX, cartao, boleto</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Webhook URL</label>
                <div className="flex gap-2">
                  <Input value={sellxPayWebhookUrl} readOnly className="text-[11px] font-mono bg-s2 border-input" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => {
                    navigator.clipboard.writeText(sellxPayWebhookUrl);
                    setCopiedSellxPay(true);
                    toast.success("URL copiada!");
                    setTimeout(() => setCopiedSellxPay(false), 2000);
                  }}>
                    {copiedSellxPay ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">API Token (Bearer)</label>
                <Input
                  type="password"
                  value={sellxPayApiToken}
                  onChange={(e) => setSellxPayApiToken(e.target.value)}
                  placeholder="Cole o Access Token..."
                  className="text-xs font-mono bg-s2 border-input"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-t3 uppercase tracking-wide font-medium">Webhook Secret (opcional)</label>
                <Input
                  type="password"
                  value={sellxPaySecret}
                  onChange={(e) => setSellxPaySecret(e.target.value)}
                  placeholder="Secret do SellxPay..."
                  className="text-xs font-mono bg-s2 border-input"
                />
              </div>
            </div>
          </div>

          {/* Save + Sync */}
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={handleSaveSellx} disabled={savingSellx}>
              {savingSellx && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Configuracao
            </Button>
            {sellxConfig?.config_json?.pay_api_token && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!orgId) return;
                  setSyncingSellx(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("sellx-sync", {
                      body: { organizationId: orgId, daysBack: 7 },
                    });
                    if (error) throw error;
                    toast.success("Vendas importadas!", {
                      description: `${data?.totalSaved || 0} vendas salvas, ${data?.totalMatched || 0} vinculadas (${data?.period})`,
                      duration: 8000,
                    });
                  } catch (err: any) {
                    toast.error("Erro ao importar vendas", { description: err?.message });
                  } finally {
                    setSyncingSellx(false);
                  }
                }}
                disabled={syncingSellx}
              >
                {syncingSellx ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Importar Vendas (7 dias)
              </Button>
            )}
            {sellxConfig && (
              <span className="text-xs text-t3">
                {sellxConfig.config_json?.pay_api_token ? "API Token configurado" : ""}
                {sellxConfig.config_json?.checkout_secret ? " · Checkout secret OK" : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── OUTRAS INTEGRACOES ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Outras Integracoes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {otherIntegrations.map((int) => (
              <div
                key={int.type}
                className="rounded-lg border border-border bg-card p-4 hover:border-[hsl(var(--border2))] transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm ${int.color}`}>
                    {int.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-t1">{int.name}</h3>
                    <p className="text-xs text-t3 truncate">{int.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusPill
                    variant={int.status === "connected" ? "active" : "paused"}
                    label={int.status === "connected" ? "Conectado" : "Desconectado"}
                  />
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
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
