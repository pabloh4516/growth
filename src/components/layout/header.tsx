"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { useOrgId } from "@/lib/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSyncState } from "@/components/providers/sync-provider";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, LogOut, User, Settings, RefreshCw, Loader2, Wifi } from "lucide-react";

const supabase = createClient();

const PERIODS = [
  { label: "Hoje", value: "hoje" },
  { label: "7d", value: "7d" },
  { label: "15d", value: "15d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
] as const;

/* Page title + breadcrumb mapping */
const PAGE_META: Record<string, { title: string; sub?: string; breadcrumb?: string[] }> = {
  "/dashboard": { title: "Dashboard", sub: "Visão geral da operação" },
  "/insights": { title: "Insights & IA", sub: "Agente autônomo de otimização" },
  "/insights/chat": { title: "Chat com IA", breadcrumb: ["Insights & IA", "Chat"] },
  "/campaigns": { title: "Google Ads", sub: "Visão geral", breadcrumb: ["Google Ads", "Visão geral"] },
  "/campaigns/list": { title: "Campanhas", breadcrumb: ["Google Ads", "Campanhas"] },
  "/campaigns/adgroups": { title: "Grupos de Anúncio", breadcrumb: ["Google Ads", "Grupos de anúncio"] },
  "/campaigns/ads": { title: "Anúncios", breadcrumb: ["Google Ads", "Anúncios"] },
  "/campaigns/keywords": { title: "Palavras-chave", breadcrumb: ["Google Ads", "Palavras-chave"] },
  "/campaigns/rules": { title: "Regras Automáticas", breadcrumb: ["Google Ads", "Regras automáticas"] },
  "/tiktok": { title: "TikTok Ads", sub: "Visão geral", breadcrumb: ["TikTok Ads", "Visão geral"] },
  "/creatives": { title: "Criativos", sub: "Biblioteca, análise de fadiga e geração com IA" },
  "/creatives/generate": { title: "Gerador de Copy", breadcrumb: ["Criativos", "Gerador de Copy"] },
  "/audiences": { title: "Públicos-Alvo", sub: "Segmentações e audiências" },
  "/funnel": { title: "Páginas & Funis", sub: "Builder e performance" },
  "/ab-tests": { title: "Testes A/B", sub: "Experimentos ativos" },
  "/crm": { title: "Contatos & Pipeline", sub: "CRM de vendas" },
  "/sales": { title: "Vendas Reais", sub: "Checkout e gateways" },
  "/automations": { title: "Automações", sub: "Fluxos inteligentes" },
  "/analytics": { title: "Analytics Avançado", sub: "Dados detalhados" },
  "/analytics/search-terms": { title: "Search Terms", breadcrumb: ["Analytics", "Search Terms"] },
  "/analytics/schedule": { title: "Horários & Dispositivos", breadcrumb: ["Analytics", "Horários"] },
  "/analytics/geo": { title: "Geográfico", breadcrumb: ["Analytics", "Geográfico"] },
  "/analytics/placements": { title: "Placements", breadcrumb: ["Analytics", "Placements"] },
  "/analytics/quality-score": { title: "Quality Score", breadcrumb: ["Analytics", "Quality Score"] },
  "/analytics/ltv": { title: "Análise LTV", breadcrumb: ["Analytics", "LTV"] },
  "/competitors": { title: "Competidores & SEO", sub: "Monitoramento de concorrentes" },
  "/seo": { title: "SEO Monitor", sub: "SERP tracking" },
  "/goals": { title: "Metas & OKRs", sub: "Acompanhamento de objetivos" },
  "/budget-optimizer": { title: "Budget Optimizer", sub: "Otimização de investimento" },
  "/financial": { title: "DRE & Projeção", sub: "Demonstrativo de resultado" },
  "/costs": { title: "Configurar Custos", sub: "Custos operacionais" },
  "/alerts": { title: "Alertas", sub: "Monitoramento de anomalias" },
  "/reports": { title: "Relatórios", sub: "Gerados por IA" },
  "/integrations": { title: "Integrações", sub: "Conexões com plataformas" },
  "/settings": { title: "Configurações", sub: "Preferências da conta" },
};

function useLastSyncTime() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["last-sync", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("last_sync_at")
        .eq("organization_id", orgId!)
        .eq("status", "connected")
        .order("last_sync_at", { ascending: false })
        .limit(1);
      if (!data || data.length === 0 || !data[0].last_sync_at) return null;
      return data[0].last_sync_at;
    },
    enabled: !!orgId,
    refetchInterval: 30 * 1000,
  });
}

function formatTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { period, setPeriod } = usePeriodStore();
  const { data: lastSync } = useLastSyncTime();
  const { isSyncing, syncNow } = useSyncState();

  const meta = PAGE_META[pathname] || { title: "GrowthOS" };

  const initials = profile?.name
    ? profile.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-30 bg-s1 border-b border-border shrink-0">
      {/* Top row: menu + title + actions */}
      <div className="px-4 md:px-6 py-2.5 md:py-3 flex items-center gap-2 md:gap-3.5">
        {/* Mobile menu */}
        <button onClick={onMenuToggle} className="lg:hidden text-t3 hover:text-t1 p-1 -ml-1">
          <Menu className="h-5 w-5" />
        </button>

        {/* Title + breadcrumb */}
        <div className="flex-1 min-w-0">
          {meta.breadcrumb ? (
            <div className="flex items-center gap-1.5 text-2xs md:text-sm text-t3 mb-0.5 truncate">
              {meta.breadcrumb.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5 shrink-0">
                  {i > 0 && <span className="opacity-40">›</span>}
                  <span className={i === meta.breadcrumb!.length - 1 ? "text-t2" : ""}>{part}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="font-heading text-base md:text-lg font-bold tracking-tight truncate">{meta.title}</div>
          {meta.sub && !meta.breadcrumb && <div className="text-[10px] text-t3 font-light mt-0.5 hidden sm:block">{meta.sub}</div>}
        </div>

        {/* Sync — compact on mobile */}
        <button
          onClick={syncNow}
          disabled={isSyncing}
          className="flex items-center gap-1 text-xs text-t3 hover:text-t1 transition-colors p-1.5 rounded-sm hover:bg-s2"
        >
          {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{isSyncing ? "Sync..." : lastSync ? formatTimeSince(lastSync) : "Sync"}</span>
        </button>

        {/* Realtime indicator */}
        <Wifi className="hidden sm:block h-3 w-3 text-success shrink-0" />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-purple-dim text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-s2 border-border shadow-[0_8px_32px_rgba(0,0,0,.5)]">
          <DropdownMenuLabel>
            <p className="text-base font-medium text-t1">{profile?.name || "Usuário"}</p>
            <p className="text-xs text-t3">{profile?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onClick={() => router.push("/settings")} className="text-t2 hover:text-t1 focus:bg-s3">
            <User className="mr-2 h-4 w-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")} className="text-t2 hover:text-t1 focus:bg-s3">
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={async () => { await signOut(); router.push("/login"); }}
            className="text-destructive focus:text-destructive focus:bg-red-dim"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      {/* Period selector — always visible, scrollable on mobile */}
      <div className="px-4 md:px-6 pb-2.5 flex items-center gap-1 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 bg-s2 rounded-md p-0.5 md:p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-2.5 md:px-3 py-1 md:py-[5px] text-2xs md:text-xs rounded-[7px] transition-all duration-150 cursor-pointer whitespace-nowrap",
                period === p.value
                  ? "bg-card text-t1 font-medium shadow-[0_1px_4px_rgba(0,0,0,.3)]"
                  : "text-t3 hover:text-t2"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
