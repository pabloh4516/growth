import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

async function invoke<T = unknown>(fnName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) throw error;
  return data as T;
}

// ─── Google Ads ────────────────────────────────────────
export function getGoogleAdsAuthUrl(orgId: string, redirectUri: string) {
  return invoke("google-ads-oauth", { action: "get-auth-url", organizationId: orgId, redirectUri });
}

export function exchangeGoogleAdsCode(orgId: string, code: string, redirectUri: string) {
  return invoke("google-ads-oauth", { action: "callback", organizationId: orgId, code, redirectUri });
}

export function syncGoogleAds(accountId: string) {
  return invoke("google-ads-sync", { accountId });
}

export function addNegativeKeyword(accountId: string, campaignExternalId: string, keyword: string, matchType = "EXACT") {
  return invoke("google-ads-oauth", { action: "add-negative-keyword", accountId, campaignExternalId, keyword, matchType });
}

// ─── AI ────────────────────────────────────────────────
export function triggerAIAnalysis(orgId: string) {
  return invoke("ai-analysis", { organizationId: orgId });
}

export function sendAIChatMessage(orgId: string, message: string, conversationId?: string) {
  return invoke("ai-chat", { organizationId: orgId, message, conversationId });
}

export function executeAIDecision(decisionId: string) {
  return invoke("ai-execute", { decisionId });
}

export function generateCreatives(params: {
  organization_id: string;
  platform: string;
  type: string;
  basedOnCreativeId?: string;
  prompt?: string;
}) {
  return invoke("ai-creative-gen", {
    organizationId: params.organization_id,
    platform: params.platform,
    niche: params.type,
    objective: params.prompt || "high performance ad copy",
  });
}

export function generateReport(orgId: string, type: string) {
  return invoke("ai-report", { organizationId: orgId, reportType: type });
}

export function predictROI(orgId: string, proposedBudget: number, campaignId?: string) {
  return invoke("ai-roi-prediction", { organizationId: orgId, proposedBudget, campaignId });
}

export function optimizeBudget(orgId: string, totalBudget?: number) {
  return invoke("ai-budget-optimizer", { organizationId: orgId, totalBudget });
}

// ─── Health & Scoring ──────────────────────────────────
export function recalculateHealthScore(orgId: string) {
  return invoke("health-score", { organizationId: orgId });
}

export function runLeadScoring(orgId: string) {
  return invoke("lead-scoring", { organizationId: orgId });
}

// ─── Funnel & Audiences ────────────────────────────────
export function takeFunnelSnapshot(funnelId: string) {
  return invoke("funnel-snapshot", { funnelId });
}

export function generateAudiences(orgId: string, sourceType: string) {
  return invoke("generate-audiences", { organizationId: orgId, sourceType });
}

// ─── Utmify ──────────────────────────────────────────
export function syncUtmify(orgId: string) {
  return invoke("utmify-sync", { organizationId: orgId });
}

// ─── Integrations ──────────────────────────────────────
export function syncGA4(orgId: string) {
  return invoke("ga4-sync", { organizationId: orgId });
}

export function syncSearchConsole(orgId: string) {
  return invoke("search-console-sync", { organizationId: orgId });
}

// ─── Email & Alerts ────────────────────────────────────
export function sendEmail(params: { contactId: string; subject: string; bodyHtml: string; sequenceStepId?: string }) {
  return invoke("email-sender", params);
}

export function runAlertChecker(orgId: string) {
  return invoke("alert-checker", { organizationId: orgId });
}

// ─── WhatsApp ──────────────────────────────────────────
export function sendWhatsApp(templateId: string, contacts: { phone: string; variables: Record<string, string> }[]) {
  return invoke("whatsapp-sender", { templateId, contacts });
}

// ─── Offline Conversions ────────────────────────────────
export function processOfflineConversions(uploadId: string) {
  return invoke("process-offline-conversions", { uploadId });
}

// ─── Competitor Monitor ─────────────────────────────────
export function analyzeCompetitors() {
  return invoke("competitor-monitor", {});
}

// ─── Re-match Sales ─────────────────────────────────────
export function rematchSales(orgId: string) {
  return invoke("rematch-sales", { organizationId: orgId });
}
