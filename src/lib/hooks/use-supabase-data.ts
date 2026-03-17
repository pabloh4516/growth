"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "./use-org";
import * as queries from "@/lib/services/supabase-queries";
import type { UtmifySalesFilters } from "@/lib/services/supabase-queries";

// ─── Dashboard ─────────────────────────────────────────
export function useDashboardMetrics(days = 30) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["dashboard-metrics", orgId, days],
    queryFn: () => queries.fetchDashboardMetrics(orgId!, days),
    enabled: !!orgId,
  });
}

export function useTopCampaigns(limit = 5) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["top-campaigns", orgId, limit],
    queryFn: () => queries.fetchTopCampaigns(orgId!, limit),
    enabled: !!orgId,
  });
}

// ─── Campaigns ─────────────────────────────────────────
export function useCampaigns() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["campaigns", orgId],
    queryFn: () => queries.fetchCampaigns(orgId!),
    enabled: !!orgId,
  });
}

export function useCampaignById(id: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["campaign", orgId, id],
    queryFn: () => queries.fetchCampaignById(orgId!, id),
    enabled: !!orgId && !!id,
  });
}

// ─── Utmify Sales ──────────────────────────────────────
export function useUtmifySales(filters?: UtmifySalesFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["utmify-sales", orgId, filters],
    queryFn: () => queries.fetchUtmifySales(orgId!, filters),
    enabled: !!orgId,
  });
}

// ─── CRM ───────────────────────────────────────────────
export function useContacts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["contacts", orgId],
    queryFn: () => queries.fetchContacts(orgId!),
    enabled: !!orgId,
  });
}

export function useDeals() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["deals", orgId],
    queryFn: () => queries.fetchDeals(orgId!),
    enabled: !!orgId,
  });
}

export function usePipelines() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["pipelines", orgId],
    queryFn: () => queries.fetchPipelines(orgId!),
    enabled: !!orgId,
  });
}

// ─── Insights & AI ─────────────────────────────────────
export function useInsights() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["insights", orgId],
    queryFn: () => queries.fetchInsights(orgId!),
    enabled: !!orgId,
  });
}

export function useAIDecisions() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-decisions", orgId],
    queryFn: () => queries.fetchAIDecisions(orgId!),
    enabled: !!orgId,
  });
}

export function useAIAnalyses() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-analyses", orgId],
    queryFn: () => queries.fetchAIAnalyses(orgId!),
    enabled: !!orgId,
  });
}

// ─── Alerts ────────────────────────────────────────────
export function useAlerts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["alerts", orgId],
    queryFn: () => queries.fetchAlerts(orgId!),
    enabled: !!orgId,
  });
}

// ─── Creatives ─────────────────────────────────────────
export function useCreatives() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["creatives", orgId],
    queryFn: () => queries.fetchCreatives(orgId!),
    enabled: !!orgId,
  });
}

// ─── Analytics ─────────────────────────────────────────
export function useSearchTerms() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["search-terms", orgId],
    queryFn: () => queries.fetchSearchTerms(orgId!),
    enabled: !!orgId,
  });
}

export function useMetricsByHour() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["metrics-by-hour", orgId],
    queryFn: () => queries.fetchMetricsByHour(orgId!),
    enabled: !!orgId,
  });
}

export function useMetricsByGeo() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["metrics-by-geo", orgId],
    queryFn: () => queries.fetchMetricsByGeo(orgId!),
    enabled: !!orgId,
  });
}

export function useMetricsByPlacement() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["metrics-by-placement", orgId],
    queryFn: () => queries.fetchMetricsByPlacement(orgId!),
    enabled: !!orgId,
  });
}

// ─── Others ────────────────────────────────────────────
export function useAudiences() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["audiences", orgId],
    queryFn: () => queries.fetchAudiences(orgId!),
    enabled: !!orgId,
  });
}

export function useGoals() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["goals", orgId],
    queryFn: () => queries.fetchGoals(orgId!),
    enabled: !!orgId,
  });
}

export function useFinancialRecords() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["financial-records", orgId],
    queryFn: () => queries.fetchFinancialRecords(orgId!),
    enabled: !!orgId,
  });
}

export function useTasks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["tasks", orgId],
    queryFn: () => queries.fetchTasks(orgId!),
    enabled: !!orgId,
  });
}

export function useCalendarEvents() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["calendar-events", orgId],
    queryFn: () => queries.fetchCalendarEvents(orgId!),
    enabled: !!orgId,
  });
}

export function useSEOKeywords() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["seo-keywords", orgId],
    queryFn: () => queries.fetchSEOKeywords(orgId!),
    enabled: !!orgId,
  });
}

export function useCompetitors() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["competitors", orgId],
    queryFn: () => queries.fetchCompetitors(orgId!),
    enabled: !!orgId,
  });
}

export function useIntegrations() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["integrations", orgId],
    queryFn: () => queries.fetchIntegrations(orgId!),
    enabled: !!orgId,
  });
}

// ─── Reports ──────────────────────────────────────────
export function useReports() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["reports", orgId],
    queryFn: () => queries.fetchReports(orgId!),
    enabled: !!orgId,
  });
}

// ─── Alert Rules ──────────────────────────────────────
export function useAlertRules() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["alert-rules", orgId],
    queryFn: () => queries.fetchAlertRules(orgId!),
    enabled: !!orgId,
  });
}

// ─── Automations ──────────────────────────────────────
export function useEmailSequences() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-sequences", orgId],
    queryFn: () => queries.fetchEmailSequences(orgId!),
    enabled: !!orgId,
  });
}

export function useWhatsappTemplates() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["whatsapp-templates", orgId],
    queryFn: () => queries.fetchWhatsappTemplates(orgId!),
    enabled: !!orgId,
  });
}

export function useAutomationRules() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["automation-rules", orgId],
    queryFn: () => queries.fetchAutomationRules(orgId!),
    enabled: !!orgId,
  });
}

// ─── Keywords ─────────────────────────────────────────
export function useKeywords() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["keywords", orgId],
    queryFn: () => queries.fetchKeywords(orgId!),
    enabled: !!orgId,
  });
}

// ─── Device Metrics ───────────────────────────────────
export function useMetricsByDevice() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["metrics-by-device", orgId],
    queryFn: () => queries.fetchMetricsByDevice(orgId!),
    enabled: !!orgId,
  });
}
