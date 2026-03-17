"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Filter,
  Megaphone,
  Palette,
  Globe,
  FlaskConical,
  Users,
  DollarSign,
  Phone,
  Brain,
  BarChart3,
  Search,
  Clock,
  MapPin,
  Monitor,
  Award,
  TrendingUp,
  Shield,
  Zap,
  Wallet,
  PiggyBank,
  Upload,
  Calendar,
  Target,
  Bell,
  FileText,
  ListChecks,
  UserCheck,
  UsersRound,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "info";
  children?: { label: string; href: string; icon: React.ElementType }[];
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Principal",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Funil & Jornada", href: "/funnel", icon: Filter },
      { label: "Campanhas", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    title: "Conteúdo",
    items: [
      { label: "Criativos", href: "/creatives", icon: Palette },
      { label: "Landing Pages", href: "/landing-pages", icon: Globe },
      { label: "Testes A/B", href: "/ab-tests", icon: FlaskConical },
    ],
  },
  {
    title: "CRM & Vendas",
    items: [
      { label: "Contatos & Pipeline", href: "/crm", icon: Users },
      { label: "Vendas Reais", href: "/sales", icon: DollarSign, badge: "Utmify", badgeVariant: "success" },
      { label: "Call Tracking", href: "/call-tracking", icon: Phone },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Insights & IA", href: "/insights", icon: Brain },
      {
        label: "Analytics Avançado",
        href: "/analytics",
        icon: BarChart3,
        children: [
          { label: "Search Terms", href: "/analytics/search-terms", icon: Search },
          { label: "Horários & Dispositivos", href: "/analytics/schedule", icon: Clock },
          { label: "Geográfico", href: "/analytics/geo", icon: MapPin },
          { label: "Placements", href: "/analytics/placements", icon: Monitor },
          { label: "Quality Score", href: "/analytics/quality-score", icon: Award },
          { label: "Análise LTV", href: "/analytics/ltv", icon: TrendingUp },
        ],
      },
      { label: "SEO Monitor", href: "/seo", icon: Search },
      { label: "Competidores", href: "/competitors", icon: Shield },
    ],
  },
  {
    title: "Operação",
    items: [
      { label: "Automações", href: "/automations", icon: Zap },
      { label: "Financeiro", href: "/financial", icon: Wallet },
      { label: "Budget Optimizer", href: "/budget-optimizer", icon: PiggyBank },
      { label: "Conv. Offline", href: "/offline-conversions", icon: Upload },
      { label: "Calendário", href: "/calendar", icon: Calendar },
      { label: "Metas & OKRs", href: "/goals", icon: Target },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Alertas", href: "/alerts", icon: Bell, badge: "5", badgeVariant: "warning" },
      { label: "Relatórios", href: "/reports", icon: FileText },
      { label: "Equipe & Tarefas", href: "/tasks", icon: ListChecks },
      { label: "Portal do Cliente", href: "/client-portal", icon: UserCheck },
      { label: "Públicos-Alvo", href: "/audiences", icon: UsersRound },
      { label: "Integrações", href: "/integrations", icon: Plug },
      { label: "Configurações", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(
    pathname.startsWith("/analytics/") ? "/analytics" : null
  );

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const toggleSubmenu = (href: string) => {
    setExpandedSubmenu((prev) => (prev === href ? null : href));
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSubmenu === item.href;
    const Icon = item.icon;

    const linkContent = (
      <>
        <div className="relative flex items-center gap-3 flex-1 min-w-0">
          {active && (
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-primary" />
          )}
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          {!collapsed && (
            <span className={cn("truncate text-sm", active ? "text-foreground font-medium" : "text-muted-foreground")}>
              {item.label}
            </span>
          )}
        </div>
        {!collapsed && item.badge && (
          <Badge variant={item.badgeVariant || "default"} className="text-[10px] px-1.5 h-5">
            {item.badge}
          </Badge>
        )}
        {!collapsed && hasChildren && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
          />
        )}
      </>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>
            <Link
              href={hasChildren ? "#" : item.href}
              onClick={(e) => {
                if (hasChildren) {
                  e.preventDefault();
                  toggleSubmenu(item.href);
                }
              }}
              className={cn(
                "flex items-center justify-center h-9 w-9 mx-auto rounded-md transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={item.href}>
        {hasChildren ? (
          <button
            onClick={() => toggleSubmenu(item.href)}
            className={cn(
              "flex items-center w-full px-3 py-2 rounded-md text-sm transition-colors",
              active ? "bg-primary/10" : "hover:bg-accent"
            )}
          >
            {linkContent}
          </button>
        ) : (
          <Link
            href={item.href}
            onClick={onMobileClose}
            className={cn(
              "flex items-center px-3 py-2 rounded-md text-sm transition-colors",
              active ? "bg-primary/10" : "hover:bg-accent"
            )}
          >
            {linkContent}
          </Link>
        )}
        {hasChildren && isExpanded && !collapsed && (
          <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
            {item.children!.map((child) => {
              const childActive = isActive(child.href);
              const ChildIcon = child.icon;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors",
                    childActive ? "text-primary font-medium bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <ChildIcon className="h-3.5 w-3.5" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:sticky"
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center h-14 px-4 border-b border-sidebar-border shrink-0", collapsed && "justify-center")}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D2FF] flex items-center justify-center">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span className="font-heading font-bold text-lg text-gradient-primary">GrowthOS</span>
            </Link>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D2FF] flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
          )}
          <button
            onClick={onMobileClose}
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {section.title}
                  </p>
                )}
                {collapsed && <div className="my-2 mx-2 h-px bg-sidebar-border" />}
                <div className="space-y-0.5">{section.items.map(renderNavItem)}</div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex items-center justify-center h-12 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
