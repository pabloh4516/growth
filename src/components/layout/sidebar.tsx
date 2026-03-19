"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/* ── Navigation Structure (MarketOS) ── */

interface SubItem {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: { label: string; variant: "red" | "purple" | "amber" | "green" };
  tag?: "IA";
  platform?: "google" | "tiktok";
  children?: SubItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/* SVG Icons inline — matching MarketOS exactly */
const icons = {
  dashboard: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".25" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.5v3l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  criativos: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 10l2.5-3 2 2 1.5-2 2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M3 4h10M3 7h8M3 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 10l1.5 1.5L14 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  audiences: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M14.5 12.5c0-1.8-1-3-2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  funnel: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M2 3h12l-4 5v5l-4-2V8L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  abtest: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  crm: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  automations: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M2 12l3-4 3 2.5 2-5 4 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  competitors: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  seo: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M2 12l3-4 3 2.5 2-5 4 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="3" r="2" fill="currentColor" opacity=".6" />
    </svg>
  ),
  goals: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M8 1l1.9 3.8L14 5.6l-3 2.9.7 4.1L8 10.4l-3.7 2.2.7-4.1L2 5.6l4.1-.8L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  budget: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v1.5M8 9.5V11M6 7.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5S9 9 8 9s-2 .7-2 1.5S7 12 8 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  dre: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 5h8M4 8h6M4 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  costs: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M2 2h12v3l-4 4v5l-4-2V9L2 5V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M8 2a5 5 0 00-5 5v3l-1 1h12l-1-1V7a5 5 0 00-5-5zM6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <rect x="2.5" y="1.5" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 6h6M5 8.5h4M5 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  integrations: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="3" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5l2.5 2M9 6l2.5-2M4.5 11l2.5-2M9 10l2.5 2" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 16 16" fill="none" className="w-[15px] h-[15px]">
      <path d="M8 2v12M5 5l3-3 3 3M4 9h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Principal",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: icons.dashboard },
      { label: "Insights & IA", href: "/insights", icon: icons.insights, badge: { label: "3", variant: "purple" } },
    ],
  },
  {
    title: "Tráfego",
    items: [
      {
        label: "Google Ads", href: "/campaigns", icon: null, platform: "google",
        children: [
          { label: "Visão geral", href: "/campaigns" },
          { label: "Campanhas", href: "/campaigns/list" },
          { label: "Conjuntos", href: "/campaigns/list?tab=conjuntos" },
          { label: "Anúncios", href: "/campaigns/list?tab=anuncios" },
          { label: "Contas", href: "/campaigns/list?tab=contas" },
          { label: "Palavras-chave", href: "/campaigns/keywords" },
          { label: "Regras automáticas", href: "/campaigns/rules" },
        ],
      },
      {
        label: "TikTok Ads", href: "/tiktok", icon: null, platform: "tiktok",
        children: [
          { label: "Visão geral", href: "/tiktok" },
          { label: "Campanhas", href: "/tiktok/campaigns" },
          { label: "Grupos de anúncio", href: "/tiktok/adgroups" },
          { label: "Anúncios", href: "/tiktok/ads" },
          { label: "Regras automáticas", href: "/tiktok/rules" },
        ],
      },
      { label: "Criativos", href: "/creatives", icon: icons.criativos, badge: { label: "2 fatigados", variant: "red" } },
      { label: "Gerador de Copy", href: "/creatives/generate", icon: icons.copy, badge: { label: "IA", variant: "purple" } },
      { label: "Públicos-Alvo", href: "/audiences", icon: icons.audiences },
    ],
  },
  {
    title: "Funis",
    items: [
      { label: "Páginas & Funis", href: "/funnel", icon: icons.funnel },
      { label: "Testes A/B", href: "/ab-tests", icon: icons.abtest, badge: { label: "4 ativos", variant: "amber" } },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Contatos & Pipeline", href: "/crm", icon: icons.crm },
      { label: "Vendas Reais", href: "/sales", icon: icons.sales },
      { label: "Automações", href: "/automations", icon: icons.automations, tag: "IA" },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        label: "Analytics Avançado", href: "/analytics", icon: icons.analytics,
        children: [
          { label: "Visão geral", href: "/analytics" },
          { label: "Search Terms", href: "/analytics/search-terms" },
          { label: "Horários & Dispositivos", href: "/analytics/schedule" },
          { label: "Geográfico", href: "/analytics/geo" },
          { label: "Placements", href: "/analytics/placements" },
          { label: "Quality Score", href: "/analytics/quality-score" },
          { label: "Análise LTV", href: "/analytics/ltv" },
        ],
      },
      { label: "Competidores & SEO", href: "/competitors", icon: icons.competitors },
      { label: "SEO Monitor", href: "/seo", icon: icons.seo },
      { label: "Metas & OKRs", href: "/goals", icon: icons.goals },
    ],
  },
  {
    title: "Operação",
    items: [
      { label: "Budget Optimizer", href: "/budget-optimizer", icon: icons.budget },
      { label: "DRE & Projeção", href: "/financial", icon: icons.dre },
      { label: "Configurar Custos", href: "/costs", icon: icons.costs },
      { label: "Alertas", href: "/alerts", icon: icons.alerts, badge: { label: "5", variant: "red" } },
      { label: "Relatórios", href: "/reports", icon: icons.reports },
    ],
  },
  {
    title: "Config",
    items: [
      { label: "Integrações", href: "/integrations", icon: icons.integrations },
      { label: "Configurações", href: "/settings", icon: icons.settings },
    ],
  },
];

const badgeColors = {
  red: "bg-red-dim text-destructive",
  purple: "bg-purple-dim text-primary",
  amber: "bg-amber-dim text-warning",
  green: "bg-green-dim text-success",
};

/* ── Component ── */

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    // Auto-expand section that matches current path
    NAV_SECTIONS.forEach((s) =>
      s.items.forEach((item) => {
        if (item.children?.some((c) => {
          const [cPath] = c.href.split("?");
          return pathname.startsWith(cPath);
        })) {
          init[item.href] = true;
        }
      })
    );
    return init;
  });

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    // For hrefs with query params, match on the path portion
    const [hrefPath] = href.split("?");
    return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
  };

  const toggleExpand = (href: string) => {
    setExpanded((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onMobileClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-[100dvh] w-[85vw] max-w-[260px] lg:w-[232px] lg:min-w-[232px] bg-s1 border-r border-border flex flex-col overflow-hidden transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:sticky"
        )}
      >
        {/* Logo */}
        <div className="shrink-0">
          <div className="px-[18px] py-[22px] pb-4 border-b border-border">
            <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onMobileClose}>
              <div className="w-[30px] h-[30px] bg-primary rounded-[9px] flex items-center justify-center text-sm font-heading font-extrabold text-white shadow-[0_0_18px_hsl(var(--purple-glow))]">
                G
              </div>
              <div>
                <span className="font-heading text-[17px] font-extrabold tracking-tight text-t1">GrowthOS</span>
                <div className="text-[10px] text-t4 font-light tracking-wide">Plataforma de operação inteligente</div>
              </div>
            </Link>

            {/* Mobile close */}
            <button onClick={onMobileClose} className="absolute top-4 right-3 lg:hidden text-t3 hover:text-t1">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Agent chip */}
          <Link
            href="/insights"
            onClick={onMobileClose}
            className="mx-3.5 mt-3 mb-1 flex items-center gap-2.5 bg-green-dim border border-success/18 rounded-[10px] px-3 py-2.5 hover:bg-success/16 transition-colors"
          >
            <span className="w-[7px] h-[7px] rounded-full bg-success shadow-[0_0_7px_hsl(var(--success))] animate-pulse-dot shrink-0" />
            <div>
              <div className="text-sm text-success font-medium">Agente ativo</div>
              <div className="text-[10px] text-success/50">3 ações pendentes</div>
            </div>
          </Link>
        </div>

        {/* Navigation scroll */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1.5 pb-4 scrollbar-none">
          {NAV_SECTIONS.map((section, si) => (
            <div key={section.title} className="mb-1">
              {si > 0 && <div className="h-px bg-border my-1.5" />}
              <div className="text-2xs font-semibold tracking-[.1em] uppercase text-t4 px-2 pt-3 pb-1.5">
                {section.title}
              </div>

              {section.items.map((item) => {
                const active = isActive(item.href);
                const isExp = expanded[item.href];

                /* Platform header (Google/TikTok) */
                if (item.platform) {
                  return (
                    <div key={item.href}>
                      <button
                        onClick={() => toggleExpand(item.href)}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-sm text-base transition-colors",
                          isExp ? "bg-s2 text-t1" : "text-t2 hover:bg-s2 hover:text-t1"
                        )}
                      >
                        <div
                          className={cn(
                            "w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-2xs font-bold shrink-0",
                            item.platform === "google" ? "bg-google-dim text-google" : "bg-tiktok-dim text-tiktok"
                          )}
                        >
                          {item.platform === "google" ? "G" : "T"}
                        </div>
                        {item.label}
                        <span className={cn("ml-auto text-[10px] text-t4 transition-transform", isExp && "rotate-90")}>›</span>
                      </button>
                      {/* Subnav */}
                      <div className={cn("overflow-hidden transition-all duration-250", isExp ? "max-h-[300px]" : "max-h-0")}>
                        {item.children?.map((child) => {
                          const childActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onMobileClose}
                              className={cn(
                                "flex items-center gap-2 pl-[30px] pr-2.5 py-1.5 rounded-[7px] text-base transition-colors",
                                childActive ? "text-primary bg-purple-dim" : "text-t3 hover:bg-s2 hover:text-t2"
                              )}
                            >
                              <span className="w-[5px] h-[5px] rounded-full bg-current opacity-60 shrink-0" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                /* Expandable (Analytics) */
                if (item.children) {
                  return (
                    <div key={item.href}>
                      <button
                        onClick={() => toggleExpand(item.href)}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-sm text-base transition-colors",
                          isExp ? "bg-s2 text-t1" : "text-t2 hover:bg-s2 hover:text-t1"
                        )}
                      >
                        <span className="opacity-65">{item.icon}</span>
                        {item.label}
                        <span className={cn("ml-auto text-[10px] text-t4 transition-transform", isExp && "rotate-90")}>›</span>
                      </button>
                      <div className={cn("overflow-hidden transition-all duration-250", isExp ? "max-h-[300px]" : "max-h-0")}>
                        {item.children.map((child) => {
                          const childActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onMobileClose}
                              className={cn(
                                "flex items-center gap-2 pl-[30px] pr-2.5 py-1.5 rounded-[7px] text-base transition-colors",
                                childActive ? "text-primary bg-purple-dim" : "text-t3 hover:bg-s2 hover:text-t2"
                              )}
                            >
                              <span className="w-[5px] h-[5px] rounded-full bg-current opacity-60 shrink-0" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                /* Normal item */
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-[7px] rounded-sm text-base transition-colors relative select-none",
                      active
                        ? "bg-purple-dim text-primary font-medium"
                        : "text-t2 hover:bg-s2 hover:text-t1"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3.5 bg-primary rounded-r-[3px]" />
                    )}
                    <span className={cn("opacity-65", active && "opacity-100")}>{item.icon}</span>
                    {item.label}
                    {item.badge && (
                      <span className={cn("ml-auto text-2xs px-1.5 py-0.5 rounded-[10px] font-semibold", badgeColors[item.badge.variant])}>
                        {item.badge.label}
                      </span>
                    )}
                    {item.tag === "IA" && (
                      <span className="ml-1 text-2xs px-1.5 py-0.5 rounded-[5px] font-semibold bg-purple-dim text-primary">IA</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
