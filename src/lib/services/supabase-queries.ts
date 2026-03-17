import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Dashboard ─────────────────────────────────────────
export async function fetchDashboardMetrics(orgId: string, days = 30) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const { data, error } = await supabase
    .from("metrics_daily")
    .select("*")
    .eq("organization_id", orgId)
    .gte("date", dateFrom.toISOString().split("T")[0])
    .order("date", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const totals = data.reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions || 0),
      clicks: acc.clicks + (row.clicks || 0),
      cost: acc.cost + (row.cost || 0),
      conversions: acc.conversions + (row.conversions || 0),
      revenue: acc.revenue + (row.revenue || 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 }
  );

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
  const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
  const roas = totals.cost > 0 ? totals.revenue / totals.cost : 0;

  return { ...totals, ctr, cpc, cpa, roas, daily: data };
}

// ─── Campaigns ─────────────────────────────────────────
export async function fetchCampaigns(orgId: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, ad_groups(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchCampaignById(orgId: string, id: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, ad_groups(*)")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchTopCampaigns(orgId: string, limit = 5) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", orgId)
    .not("real_roas", "is", null)
    .order("real_roas", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

// ─── Utmify Sales ──────────────────────────────────────
export interface UtmifySalesFilters {
  status?: string;
  utm_source?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function fetchUtmifySales(orgId: string, filters?: UtmifySalesFilters) {
  let query = supabase
    .from("utmify_sales")
    .select("*, campaigns:matched_campaign_id(id, name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.utm_source) query = query.eq("utm_source", filters.utm_source);
  if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── CRM ───────────────────────────────────────────────
export async function fetchContacts(orgId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchDeals(orgId: string) {
  const { data, error } = await supabase
    .from("deals")
    .select("*, contacts:contact_id(id, name, email)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchPipelines(orgId: string) {
  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .eq("organization_id", orgId);

  if (error) throw error;
  return data;
}

// ─── Insights ──────────────────────────────────────────
export async function fetchInsights(orgId: string) {
  const { data, error } = await supabase
    .from("insights")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
}

// ─── Alerts ────────────────────────────────────────────
export async function fetchAlerts(orgId: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", orgId)
    .order("triggered_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── AI ────────────────────────────────────────────────
export async function fetchAIDecisions(orgId: string) {
  const { data, error } = await supabase
    .from("ai_decisions")
    .select("*, campaigns:campaign_id(id, name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchAIAnalyses(orgId: string) {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
}

export async function fetchChatMessages(orgId: string, conversationId: string) {
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("*")
    .eq("organization_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// ─── Creatives ─────────────────────────────────────────
export async function fetchCreatives(orgId: string) {
  const { data, error } = await supabase
    .from("creative_library")
    .select("*, creative_performance(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Analytics ─────────────────────────────────────────
export async function fetchSearchTerms(orgId: string) {
  const { data, error } = await supabase
    .from("search_terms")
    .select("*")
    .eq("organization_id", orgId)
    .order("impressions", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchMetricsByHour(orgId: string) {
  const { data, error } = await supabase
    .from("metrics_by_hour")
    .select("*")
    .eq("organization_id", orgId);

  if (error) throw error;
  return data;
}

export async function fetchMetricsByGeo(orgId: string) {
  const { data, error } = await supabase
    .from("metrics_by_geo")
    .select("*")
    .eq("organization_id", orgId)
    .order("cost", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchMetricsByPlacement(orgId: string) {
  const { data, error } = await supabase
    .from("metrics_by_placement")
    .select("*")
    .eq("organization_id", orgId)
    .order("cost", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Others ────────────────────────────────────────────
export async function fetchAudiences(orgId: string) {
  const { data, error } = await supabase
    .from("audiences")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchGoals(orgId: string) {
  const { data, error } = await supabase
    .from("goals")
    .select("*, goal_milestones(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchFinancialRecords(orgId: string) {
  const { data, error } = await supabase
    .from("financial_records")
    .select("*")
    .eq("organization_id", orgId)
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchTasks(orgId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchCalendarEvents(orgId: string) {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("organization_id", orgId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  return data;
}

export async function fetchSEOKeywords(orgId: string) {
  const { data, error } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("organization_id", orgId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data;
}

export async function fetchCompetitors(orgId: string) {
  const { data, error } = await supabase
    .from("competitors")
    .select("*, competitor_ads(*)")
    .eq("organization_id", orgId);

  if (error) throw error;
  return data;
}

export async function fetchIntegrations(orgId: string) {
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("organization_id", orgId);

  if (error) throw error;
  return data;
}

export async function fetchAdAccounts(orgId: string) {
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("*")
    .eq("organization_id", orgId)
    .order("connected_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Reports ──────────────────────────────────────────
export async function fetchReports(orgId: string) {
  const { data, error } = await supabase
    .from("ai_reports")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Alert Rules ──────────────────────────────────────
export async function fetchAlertRules(orgId: string) {
  const { data, error } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Automations ──────────────────────────────────────
export async function fetchEmailSequences(orgId: string) {
  const { data, error } = await supabase
    .from("email_sequences")
    .select("*, email_sequence_steps(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchWhatsappTemplates(orgId: string) {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchAutomationRules(orgId: string) {
  const { data, error } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Keywords ─────────────────────────────────────────
export async function fetchKeywords(orgId: string) {
  const { data, error } = await supabase
    .from("keywords")
    .select("*")
    .order("cost", { ascending: false })
    .limit(500);

  if (error) throw error;
  return data;
}

// ─── Device Metrics ───────────────────────────────────
export async function fetchMetricsByDevice(orgId: string) {
  const { data, error } = await supabase
    .from("metrics_by_device")
    .select("*")
    .eq("organization_id", orgId)
    .order("cost", { ascending: false });

  if (error) throw error;
  return data;
}
