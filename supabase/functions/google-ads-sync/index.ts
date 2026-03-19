import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret, validateAuth } from '../_shared/auth.ts';
import { getValidAccessToken, googleAdsSearch, GAQL } from '../_shared/google-ads-api.ts';

/**
 * GrowthOS — Google Ads Sync
 * Syncs campaigns (30 days), ad groups, keywords, search terms, geo, placements, device, hourly
 * Based on TrackVio patterns: parallel fetches, daily_metrics in metadata, local dates
 */

// Helper: format date as local YYYY-MM-DD (not UTC) to match Google Ads timezone
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const isCron = validateCronSecret(req);
    let orgFilter: string | null = null;
    let syncScope = 'full'; // full | campaigns_only

    if (!isCron) {
      const { user } = await validateAuth(req);
      const body = await req.json().catch(() => ({}));
      orgFilter = body.organizationId || null;
      syncScope = body.scope || 'full';
    }

    let query = supabase
      .from('ad_accounts')
      .select('*')
      .eq('platform', 'google_ads')
      .eq('status', 'connected');

    if (orgFilter) {
      query = query.eq('organization_id', orgFilter);
    }

    const { data: accounts } = await query;

    if (!accounts || accounts.length === 0) {
      return jsonResponse({ message: 'No connected Google Ads accounts' }, 200, corsHeaders);
    }

    // Date range: last 30 days (local date to match Google Ads account timezone)
    const dateTo = formatLocalDate(new Date());
    const dateFromD = new Date();
    dateFromD.setDate(dateFromD.getDate() - 30);
    const dateFrom = formatLocalDate(dateFromD);
    const today = dateTo;

    const results = [];

    for (const account of accounts) {
      try {
        const tokenData = await getValidAccessToken(supabase, account.id);
        if (!tokenData) {
          results.push({ accountId: account.id, error: 'Token expired' });
          continue;
        }

        const { accessToken, developerToken } = tokenData;
        const customerId = account.account_id;
        const syncStats = { campaigns: 0, adGroups: 0, keywords: 0, searchTerms: 0, geo: 0, placements: 0, device: 0, hourly: 0 };

        // =============================================
        // 1. FETCH CAMPAIGNS + AD GROUPS IN PARALLEL
        // =============================================
        // Use date range query (30 days) instead of DURING TODAY
        const campaignQuery = GAQL.campaignsByDateRange(dateFrom, dateTo);

        if (syncScope === 'campaigns_only') {
          // Light sync: only campaigns
          const campaignResults = await googleAdsSearch(accessToken, customerId, campaignQuery, developerToken);

          // Aggregate daily metrics per campaign
          const campaignAggregated: Record<string, {
            campaign: any;
            campaignBudget?: any;
            spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
            daily_metrics: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>;
          }> = {};

          for (const row of campaignResults) {
            const c = row.campaign;
            const m = row.metrics;
            const b = row.campaignBudget;
            const date = row.segments?.date || 'unknown';
            const campId = String(c.id);

            if (!campaignAggregated[campId]) {
              campaignAggregated[campId] = {
                campaign: c,
                campaignBudget: b,
                spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
                daily_metrics: {},
              };
            }
            if (!campaignAggregated[campId].campaignBudget && b) {
              campaignAggregated[campId].campaignBudget = b;
            }

            const daySpend = Number(m.costMicros || 0) / 1_000_000;
            const dayImpressions = Number(m.impressions || 0);
            const dayClicks = Number(m.clicks || 0);
            const dayConversions = Number(m.conversions || 0);
            const dayRevenue = Number(m.conversionsValue || 0);

            campaignAggregated[campId].spend += daySpend;
            campaignAggregated[campId].impressions += dayImpressions;
            campaignAggregated[campId].clicks += dayClicks;
            campaignAggregated[campId].conversions += dayConversions;
            campaignAggregated[campId].revenue += dayRevenue;

            if (!campaignAggregated[campId].daily_metrics[date]) {
              campaignAggregated[campId].daily_metrics[date] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
            }
            const dm = campaignAggregated[campId].daily_metrics[date];
            dm.spend += daySpend; dm.impressions += dayImpressions; dm.clicks += dayClicks;
            dm.conversions += dayConversions; dm.revenue += dayRevenue;
          }

          // Batch upsert campaigns
          const statusMap: Record<string, string> = { 'ENABLED': 'active', 'PAUSED': 'paused', 'REMOVED': 'deleted' };
          const campaignRows = Object.values(campaignAggregated).map(agg => ({
            ad_account_id: account.id,
            organization_id: account.organization_id,
            platform: 'google_ads',
            external_id: String(agg.campaign.id),
            name: agg.campaign.name,
            status: statusMap[agg.campaign.status] || 'active',
            objective: agg.campaign.advertisingChannelType,
            daily_budget: agg.campaignBudget?.amountMicros ? Number(agg.campaignBudget.amountMicros) / 1_000_000 : null,
            budget_micros: agg.campaignBudget?.amountMicros ? Number(agg.campaignBudget.amountMicros) : null,
            campaign_budget_resource: agg.campaign.campaignBudget || null,
            impressions: Math.round(agg.impressions),
            clicks: Math.round(agg.clicks),
            cost: agg.spend,
            google_conversions: Math.round(agg.conversions),
            google_conversion_value: agg.revenue,
            ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
            avg_cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
            metadata: { daily_metrics: agg.daily_metrics, campaign_budget: agg.campaign.campaignBudget },
            last_sync_at: new Date().toISOString(),
          }));

          if (campaignRows.length > 0) {
            await supabase.from('campaigns').upsert(campaignRows, { onConflict: 'ad_account_id,external_id' });
            syncStats.campaigns = campaignRows.length;
          }

          // Also update metrics_daily for today
          for (const agg of Object.values(campaignAggregated)) {
            const todayMetrics = agg.daily_metrics[today];
            if (!todayMetrics) continue;

            // We need the internal campaign ID
            const { data: camp } = await supabase.from('campaigns')
              .select('id').eq('ad_account_id', account.id).eq('external_id', String(agg.campaign.id)).single();
            if (!camp) continue;

            await supabase.from('metrics_daily').upsert({
              organization_id: account.organization_id,
              date: today,
              entity_type: 'campaign',
              entity_id: camp.id,
              impressions: Math.round(todayMetrics.impressions),
              clicks: Math.round(todayMetrics.clicks),
              cost: todayMetrics.spend,
              conversions: Math.round(todayMetrics.conversions),
              revenue: todayMetrics.revenue,
              ctr: todayMetrics.impressions > 0 ? (todayMetrics.clicks / todayMetrics.impressions) * 100 : 0,
              cpc: todayMetrics.clicks > 0 ? todayMetrics.spend / todayMetrics.clicks : 0,
              roas: todayMetrics.spend > 0 ? todayMetrics.revenue / todayMetrics.spend : 0,
              cpa: todayMetrics.conversions > 0 ? todayMetrics.spend / todayMetrics.conversions : 0,
            }, { onConflict: 'date,entity_type,entity_id' });
          }

          await supabase.from('ad_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', account.id);
          results.push({ accountId: account.id, accountName: account.account_name, ...syncStats });
          continue;
        }

        // =============================================
        // FULL SYNC — All queries in parallel
        // =============================================
        const [
          campaignResults,
          keywordResults,
          searchTermResults,
          geoResults,
          placementResults,
          deviceResults,
          hourlyResults,
        ] = await Promise.all([
          googleAdsSearch(accessToken, customerId, campaignQuery, developerToken),
          googleAdsSearch(accessToken, customerId, GAQL.keywords(), developerToken).catch(() => []),
          googleAdsSearch(accessToken, customerId, GAQL.searchTerms(), developerToken).catch(() => []),
          googleAdsSearch(accessToken, customerId, GAQL.geoReport(), developerToken).catch(() => []),
          googleAdsSearch(accessToken, customerId, GAQL.placements(), developerToken).catch(() => []),
          googleAdsSearch(accessToken, customerId, GAQL.deviceReport(), developerToken).catch(() => []),
          googleAdsSearch(accessToken, customerId, GAQL.hourlyReport(), developerToken).catch(() => []),
        ]);

        console.log(`[sync] Account ${account.account_name}: ${campaignResults.length} campaign rows, ${keywordResults.length} kw, ${searchTermResults.length} st, ${geoResults.length} geo, ${placementResults.length} placements`);

        // ---- AGGREGATE CAMPAIGNS (30 days daily breakdown) ----
        const campaignAggregated: Record<string, {
          campaign: any;
          campaignBudget?: any;
          spend: number; impressions: number; clicks: number; conversions: number; revenue: number;
          daily_metrics: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>;
        }> = {};

        for (const row of campaignResults) {
          const c = row.campaign;
          const m = row.metrics;
          const b = row.campaignBudget;
          const date = row.segments?.date || 'unknown';
          const campId = String(c.id);

          if (!campaignAggregated[campId]) {
            campaignAggregated[campId] = {
              campaign: c, campaignBudget: b,
              spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
              daily_metrics: {},
            };
          }
          if (!campaignAggregated[campId].campaignBudget && b) {
            campaignAggregated[campId].campaignBudget = b;
          }

          const daySpend = Number(m.costMicros || 0) / 1_000_000;
          const dayImpressions = Number(m.impressions || 0);
          const dayClicks = Number(m.clicks || 0);
          const dayConversions = Number(m.conversions || 0);
          const dayRevenue = Number(m.conversionsValue || 0);

          campaignAggregated[campId].spend += daySpend;
          campaignAggregated[campId].impressions += dayImpressions;
          campaignAggregated[campId].clicks += dayClicks;
          campaignAggregated[campId].conversions += dayConversions;
          campaignAggregated[campId].revenue += dayRevenue;

          if (!campaignAggregated[campId].daily_metrics[date]) {
            campaignAggregated[campId].daily_metrics[date] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
          }
          const dm = campaignAggregated[campId].daily_metrics[date];
          dm.spend += daySpend; dm.impressions += dayImpressions; dm.clicks += dayClicks;
          dm.conversions += dayConversions; dm.revenue += dayRevenue;
        }

        // Batch upsert campaigns
        const statusMap: Record<string, string> = { 'ENABLED': 'active', 'PAUSED': 'paused', 'REMOVED': 'deleted' };
        const campaignRows = Object.values(campaignAggregated).map(agg => ({
          ad_account_id: account.id,
          organization_id: account.organization_id,
          platform: 'google_ads',
          external_id: String(agg.campaign.id),
          name: agg.campaign.name,
          status: statusMap[agg.campaign.status] || 'active',
          objective: agg.campaign.advertisingChannelType,
          daily_budget: agg.campaignBudget?.amountMicros ? Number(agg.campaignBudget.amountMicros) / 1_000_000 : null,
          budget_micros: agg.campaignBudget?.amountMicros ? Number(agg.campaignBudget.amountMicros) : null,
          campaign_budget_resource: agg.campaign.campaignBudget || null,
          impressions: Math.round(agg.impressions),
          clicks: Math.round(agg.clicks),
          cost: agg.spend,
          google_conversions: Math.round(agg.conversions),
          google_conversion_value: agg.revenue,
          ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
          avg_cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
          metadata: { daily_metrics: agg.daily_metrics, campaign_budget: agg.campaign.campaignBudget },
          last_sync_at: new Date().toISOString(),
        }));

        const campaignMap: Record<string, string> = {};

        if (campaignRows.length > 0) {
          const { data: upsertedCampaigns } = await supabase
            .from('campaigns')
            .upsert(campaignRows, { onConflict: 'ad_account_id,external_id' })
            .select('id, external_id');

          for (const c of (upsertedCampaigns || [])) {
            campaignMap[c.external_id] = c.id;
          }
          syncStats.campaigns = upsertedCampaigns?.length || 0;
        }

        // ---- METRICS DAILY (all 30 days) ----
        const metricsRows: any[] = [];
        for (const agg of Object.values(campaignAggregated)) {
          const internalId = campaignMap[String(agg.campaign.id)];
          if (!internalId) continue;

          for (const [date, dm] of Object.entries(agg.daily_metrics)) {
            if (date === 'unknown') continue;
            metricsRows.push({
              organization_id: account.organization_id,
              date,
              entity_type: 'campaign',
              entity_id: internalId,
              impressions: Math.round(dm.impressions),
              clicks: Math.round(dm.clicks),
              cost: dm.spend,
              conversions: Math.round(dm.conversions),
              revenue: dm.revenue,
              ctr: dm.impressions > 0 ? (dm.clicks / dm.impressions) * 100 : 0,
              cpc: dm.clicks > 0 ? dm.spend / dm.clicks : 0,
              roas: dm.spend > 0 ? dm.revenue / dm.spend : 0,
              cpa: dm.conversions > 0 ? dm.spend / dm.conversions : 0,
            });
          }
        }

        // Batch upsert metrics_daily (chunks of 100)
        for (let i = 0; i < metricsRows.length; i += 100) {
          const chunk = metricsRows.slice(i, i + 100);
          await supabase.from('metrics_daily').upsert(chunk, { onConflict: 'date,entity_type,entity_id' });
        }

        // ---- AD GROUPS (fetch per campaign, parallel) ----
        const adGroupPromises = Object.entries(campaignMap).map(async ([externalId, internalId]) => {
          try {
            const agResults = await googleAdsSearch(
              accessToken, customerId, GAQL.adGroups(externalId), developerToken
            );
            const agRows = agResults.map(agRow => ({
              campaign_id: internalId,
              external_id: String(agRow.adGroup.id),
              name: agRow.adGroup.name,
              status: agRow.adGroup.status === 'ENABLED' ? 'active' : agRow.adGroup.status === 'PAUSED' ? 'paused' : 'deleted',
              impressions: Number(agRow.metrics.impressions || 0),
              clicks: Number(agRow.metrics.clicks || 0),
              cost: Number(agRow.metrics.costMicros || 0) / 1_000_000,
              conversions: Number(agRow.metrics.conversions || 0),
              last_sync_at: new Date().toISOString(),
            }));
            if (agRows.length > 0) {
              await supabase.from('ad_groups').upsert(agRows, { onConflict: 'campaign_id,external_id' });
            }
            return agRows.length;
          } catch { return 0; }
        });
        const agCounts = await Promise.all(adGroupPromises);
        syncStats.adGroups = agCounts.reduce((s, c) => s + c, 0);

        // ---- KEYWORDS (batch) ----
        if (keywordResults.length > 0) {
          const kwRows = keywordResults
            .filter(row => campaignMap[String(row.campaign?.id)])
            .map(row => ({
              ad_account_id: account.id,
              campaign_id: campaignMap[String(row.campaign.id)],
              ad_group_name: row.adGroup?.name || null,
              external_id: String(row.adGroupCriterion.criterionId),
              text: row.adGroupCriterion.keyword?.text || '',
              match_type: row.adGroupCriterion.keyword?.matchType || 'BROAD',
              status: row.adGroupCriterion.status === 'ENABLED' ? 'active' : 'paused',
              quality_score: row.adGroupCriterion.qualityInfo?.qualityScore || null,
              bid_micros: Number(row.adGroupCriterion.effectiveCpcBidMicros || 0),
              impressions: Number(row.metrics.impressions || 0),
              clicks: Number(row.metrics.clicks || 0),
              cost: Number(row.metrics.costMicros || 0) / 1_000_000,
              conversions: Number(row.metrics.conversions || 0),
              last_sync_at: new Date().toISOString(),
            }));

          for (let i = 0; i < kwRows.length; i += 50) {
            await supabase.from('keywords').upsert(kwRows.slice(i, i + 50), { onConflict: 'ad_account_id,external_id' });
          }
          syncStats.keywords = kwRows.length;
        }

        // ---- SEARCH TERMS (batch) ----
        if (searchTermResults.length > 0) {
          const stRows = searchTermResults.map(row => {
            const m = row.metrics;
            const clicks = Number(m.clicks || 0);
            const impressions = Number(m.impressions || 0);
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            let suggestedAction = null;
            if (cost > 50 && conversions === 0) suggestedAction = 'negate';
            else if (conversions > 0 && cost / conversions < 30) suggestedAction = 'promote';

            return {
              ad_account_id: account.id,
              organization_id: account.organization_id,
              campaign_id: campaignMap[String(row.campaign?.id)] || null,
              ad_group_id: null,
              term: row.searchTermView?.searchTerm || '',
              impressions, clicks, cost, conversions,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
              suggested_action: suggestedAction,
              date: today,
            };
          });

          for (let i = 0; i < stRows.length; i += 50) {
            await supabase.from('search_terms').upsert(stRows.slice(i, i + 50), { onConflict: 'ad_account_id,term,date' });
          }
          syncStats.searchTerms = stRows.length;
        }

        // ---- GEO (batch) ----
        if (geoResults.length > 0) {
          const geoRows = geoResults.map(row => {
            const m = row.metrics;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            return {
              organization_id: account.organization_id,
              campaign_id: campaignMap[String(row.campaign?.id)] || null,
              country_criterion_id: String(row.geographicView?.countryCriterionId || ''),
              location_type: row.geographicView?.locationType || 'UNKNOWN',
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost, conversions,
              revenue: Number(m.conversionsValue || 0),
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              period: today,
            };
          });

          for (let i = 0; i < geoRows.length; i += 50) {
            await supabase.from('metrics_by_geo').upsert(geoRows.slice(i, i + 50), { onConflict: 'organization_id,campaign_id,country_criterion_id,period' });
          }
          syncStats.geo = geoRows.length;
        }

        // ---- PLACEMENTS (batch) ----
        if (placementResults.length > 0) {
          const plRows = placementResults.map(row => {
            const m = row.metrics;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            return {
              organization_id: account.organization_id,
              campaign_id: campaignMap[String(row.campaign?.id)] || null,
              platform: 'google_ads',
              placement: row.groupPlacementView?.placement || row.groupPlacementView?.targetUrl || 'unknown',
              placement_type: row.groupPlacementView?.placementType || 'WEBSITE',
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost, conversions,
              revenue: Number(m.conversionsValue || 0),
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              period: today,
            };
          });

          for (let i = 0; i < plRows.length; i += 50) {
            await supabase.from('metrics_by_placement').upsert(plRows.slice(i, i + 50), { onConflict: 'organization_id,campaign_id,placement,period' });
          }
          syncStats.placements = plRows.length;
        }

        // ---- DEVICE (batch) ----
        if (deviceResults.length > 0) {
          const devMap: Record<string, string> = { 'MOBILE': 'mobile', 'DESKTOP': 'desktop', 'TABLET': 'tablet', 'CONNECTED_TV': 'connected_tv', 'OTHER': 'other' };
          const devRows = deviceResults.map(row => {
            const m = row.metrics;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            const clicks = Number(m.clicks || 0);
            return {
              organization_id: account.organization_id,
              campaign_id: campaignMap[String(row.campaign?.id)] || null,
              device: devMap[row.segments?.device || 'OTHER'] || 'other',
              impressions: Number(m.impressions || 0),
              clicks, conversions, cost,
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
              period: today,
            };
          });

          for (let i = 0; i < devRows.length; i += 50) {
            await supabase.from('metrics_by_device').upsert(devRows.slice(i, i + 50), { onConflict: 'organization_id,campaign_id,device,period' });
          }
          syncStats.device = devRows.length;
        }

        // ---- HOURLY (batch) ----
        if (hourlyResults.length > 0) {
          const hrRows = hourlyResults
            .filter(row => row.segments?.hour !== undefined && row.segments?.dayOfWeek)
            .map(row => {
              const m = row.metrics;
              const cost = Number(m.costMicros || 0) / 1_000_000;
              const conversions = Number(m.conversions || 0);
              return {
                organization_id: account.organization_id,
                campaign_id: campaignMap[String(row.campaign?.id)] || null,
                day_of_week: row.segments.dayOfWeek,
                hour: Number(row.segments.hour),
                impressions: Number(m.impressions || 0),
                clicks: Number(m.clicks || 0),
                conversions, cost,
                cpa: conversions > 0 ? cost / conversions : 0,
                roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
                period: today,
              };
            });

          for (let i = 0; i < hrRows.length; i += 50) {
            await supabase.from('metrics_by_hour').upsert(hrRows.slice(i, i + 50), { onConflict: 'organization_id,campaign_id,day_of_week,hour,period' });
          }
          syncStats.hourly = hrRows.length;
        }

        // Update account last sync
        await supabase.from('ad_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', account.id);

        results.push({ accountId: account.id, accountName: account.account_name, ...syncStats });
        console.log(`[sync] Done: ${account.account_name} — ${syncStats.campaigns} camps, ${syncStats.adGroups} ag, ${syncStats.keywords} kw`);

      } catch (e) {
        console.error(`Error syncing account ${account.id}:`, e);
        results.push({ accountId: account.id, error: e.message });
      }
    }

    return jsonResponse({ success: true, results }, 200, corsHeaders);

  } catch (error) {
    console.error('Google Ads Sync error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
