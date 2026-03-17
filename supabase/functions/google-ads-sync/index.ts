import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret, validateAuth } from '../_shared/auth.ts';
import { getValidAccessToken, googleAdsSearch, GAQL } from '../_shared/google-ads-api.ts';

/**
 * GrowthOS — Google Ads Sync (Cron Job)
 * Syncs campaigns, ad groups, keywords, search terms, geo, placements, device, hourly metrics
 */

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

    const results = [];
    const today = new Date().toISOString().split('T')[0];

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
        // 1. SYNC CAMPAIGNS + AD GROUPS
        // =============================================
        const campaignResults = await googleAdsSearch(accessToken, customerId, GAQL.campaigns, developerToken);
        const campaignMap: Record<string, string> = {}; // external_id -> internal id

        for (const row of campaignResults) {
          const c = row.campaign;
          const m = row.metrics;
          const b = row.campaignBudget;

          const statusMap: Record<string, string> = {
            'ENABLED': 'active', 'PAUSED': 'paused', 'REMOVED': 'deleted',
          };

          const { data: campaign } = await supabase.from('campaigns').upsert({
            ad_account_id: account.id,
            organization_id: account.organization_id,
            platform: 'google_ads',
            external_id: String(c.id),
            name: c.name,
            status: statusMap[c.status] || 'active',
            objective: c.advertisingChannelType,
            daily_budget: b?.amountMicros ? Number(b.amountMicros) / 1_000_000 : null,
            budget_micros: b?.amountMicros ? Number(b.amountMicros) : null,
            campaign_budget_resource: c.campaignBudget || null,
            impressions: Number(m.impressions || 0),
            clicks: Number(m.clicks || 0),
            cost: Number(m.costMicros || 0) / 1_000_000,
            google_conversions: Number(m.conversions || 0),
            google_conversion_value: Number(m.conversionsValue || 0),
            ctr: Number(m.ctr || 0),
            avg_cpc: Number(m.averageCpc || 0) / 1_000_000,
            last_sync_at: new Date().toISOString(),
          }, { onConflict: 'ad_account_id,external_id' })
            .select('id, external_id')
            .single();

          if (campaign) {
            syncStats.campaigns++;
            campaignMap[campaign.external_id] = campaign.id;

            // Sync ad groups
            try {
              const adGroupResults = await googleAdsSearch(
                accessToken, customerId, GAQL.adGroups(campaign.external_id), developerToken
              );
              for (const agRow of adGroupResults) {
                const ag = agRow.adGroup;
                const agm = agRow.metrics;
                await supabase.from('ad_groups').upsert({
                  campaign_id: campaign.id,
                  external_id: String(ag.id),
                  name: ag.name,
                  status: ag.status === 'ENABLED' ? 'active' : ag.status === 'PAUSED' ? 'paused' : 'deleted',
                  impressions: Number(agm.impressions || 0),
                  clicks: Number(agm.clicks || 0),
                  cost: Number(agm.costMicros || 0) / 1_000_000,
                  conversions: Number(agm.conversions || 0),
                  last_sync_at: new Date().toISOString(),
                }, { onConflict: 'campaign_id,external_id' });
                syncStats.adGroups++;
              }
            } catch (e) {
              console.error(`Error syncing ad groups for campaign ${campaign.external_id}:`, e);
            }

            // Save daily metrics
            await supabase.from('metrics_daily').upsert({
              organization_id: account.organization_id,
              date: today,
              entity_type: 'campaign',
              entity_id: campaign.id,
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost: Number(m.costMicros || 0) / 1_000_000,
              conversions: Number(m.conversions || 0),
              revenue: Number(m.conversionsValue || 0),
              ctr: Number(m.ctr || 0),
              cpc: Number(m.averageCpc || 0) / 1_000_000,
              roas: Number(m.costMicros) > 0
                ? Number(m.conversionsValue || 0) / (Number(m.costMicros) / 1_000_000)
                : 0,
              cpa: Number(m.conversions) > 0
                ? (Number(m.costMicros) / 1_000_000) / Number(m.conversions)
                : 0,
            }, { onConflict: 'date,entity_type,entity_id' });
          }
        }

        // Skip advanced sync if scope is campaigns_only
        if (syncScope === 'campaigns_only') {
          await supabase.from('ad_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', account.id);
          results.push({ accountId: account.id, accountName: account.account_name, ...syncStats });
          continue;
        }

        // =============================================
        // 2. SYNC KEYWORDS + QUALITY SCORE
        // =============================================
        try {
          const keywordResults = await googleAdsSearch(accessToken, customerId, GAQL.keywords(), developerToken);
          for (const row of keywordResults) {
            const kw = row.adGroupCriterion;
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;

            if (!campaignId) continue;

            await supabase.from('keywords').upsert({
              ad_account_id: account.id,
              campaign_id: campaignId,
              ad_group_name: row.adGroup?.name || null,
              external_id: String(kw.criterionId),
              text: kw.keyword?.text || '',
              match_type: kw.keyword?.matchType || 'BROAD',
              status: kw.status === 'ENABLED' ? 'active' : 'paused',
              quality_score: kw.qualityInfo?.qualityScore || null,
              bid_micros: Number(kw.effectiveCpcBidMicros || 0),
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost: Number(m.costMicros || 0) / 1_000_000,
              conversions: Number(m.conversions || 0),
              last_sync_at: new Date().toISOString(),
            }, { onConflict: 'ad_account_id,external_id' });
            syncStats.keywords++;
          }
        } catch (e) {
          console.error('Error syncing keywords:', e);
        }

        // =============================================
        // 3. SYNC SEARCH TERMS
        // =============================================
        try {
          const searchTermResults = await googleAdsSearch(accessToken, customerId, GAQL.searchTerms(), developerToken);
          for (const row of searchTermResults) {
            const term = row.searchTermView?.searchTerm || '';
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;
            const clicks = Number(m.clicks || 0);
            const impressions = Number(m.impressions || 0);
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

            // Auto-suggest action based on performance
            let suggestedAction = null;
            if (cost > 50 && conversions === 0) suggestedAction = 'negate';
            else if (conversions > 0 && cost / conversions < 30) suggestedAction = 'promote';

            await supabase.from('search_terms').upsert({
              ad_account_id: account.id,
              organization_id: account.organization_id,
              campaign_id: campaignId,
              ad_group_id: null,
              term,
              impressions,
              clicks,
              cost,
              conversions,
              ctr,
              suggested_action: suggestedAction,
              date: today,
            }, { onConflict: 'ad_account_id,term,date' });
            syncStats.searchTerms++;
          }
        } catch (e) {
          console.error('Error syncing search terms:', e);
        }

        // =============================================
        // 4. SYNC GEO REPORT
        // =============================================
        try {
          const geoResults = await googleAdsSearch(accessToken, customerId, GAQL.geoReport(), developerToken);
          for (const row of geoResults) {
            const geo = row.geographicView;
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);

            await supabase.from('metrics_by_geo').upsert({
              organization_id: account.organization_id,
              campaign_id: campaignId,
              country_criterion_id: String(geo?.countryCriterionId || ''),
              location_type: geo?.locationType || 'UNKNOWN',
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost,
              conversions,
              revenue: Number(m.conversionsValue || 0),
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              period: today,
            }, { onConflict: 'organization_id,campaign_id,country_criterion_id,period' });
            syncStats.geo++;
          }
        } catch (e) {
          console.error('Error syncing geo report:', e);
        }

        // =============================================
        // 5. SYNC PLACEMENTS
        // =============================================
        try {
          const placementResults = await googleAdsSearch(accessToken, customerId, GAQL.placements(), developerToken);
          for (const row of placementResults) {
            const p = row.groupPlacementView;
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);

            await supabase.from('metrics_by_placement').upsert({
              organization_id: account.organization_id,
              campaign_id: campaignId,
              platform: 'google_ads',
              placement: p?.placement || p?.targetUrl || 'unknown',
              placement_type: p?.placementType || 'WEBSITE',
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              cost,
              conversions,
              revenue: Number(m.conversionsValue || 0),
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              period: today,
            }, { onConflict: 'organization_id,campaign_id,placement,period' });
            syncStats.placements++;
          }
        } catch (e) {
          console.error('Error syncing placements:', e);
        }

        // =============================================
        // 6. SYNC DEVICE REPORT
        // =============================================
        try {
          const deviceResults = await googleAdsSearch(accessToken, customerId, GAQL.deviceReport(), developerToken);
          for (const row of deviceResults) {
            const device = row.segments?.device || 'UNKNOWN';
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);
            const clicks = Number(m.clicks || 0);

            const deviceMap: Record<string, string> = {
              'MOBILE': 'mobile', 'DESKTOP': 'desktop', 'TABLET': 'tablet',
              'CONNECTED_TV': 'connected_tv', 'OTHER': 'other',
            };

            await supabase.from('metrics_by_device').upsert({
              organization_id: account.organization_id,
              campaign_id: campaignId,
              device: deviceMap[device] || 'other',
              impressions: Number(m.impressions || 0),
              clicks,
              conversions,
              cost,
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
              period: today,
            }, { onConflict: 'organization_id,campaign_id,device,period' });
            syncStats.device++;
          }
        } catch (e) {
          console.error('Error syncing device report:', e);
        }

        // =============================================
        // 7. SYNC HOURLY REPORT
        // =============================================
        try {
          const hourlyResults = await googleAdsSearch(accessToken, customerId, GAQL.hourlyReport(), developerToken);
          for (const row of hourlyResults) {
            const hour = row.segments?.hour;
            const dayOfWeek = row.segments?.dayOfWeek;
            const m = row.metrics;
            const campaignId = campaignMap[String(row.campaign?.id)] || null;
            const cost = Number(m.costMicros || 0) / 1_000_000;
            const conversions = Number(m.conversions || 0);

            if (hour === undefined || !dayOfWeek) continue;

            await supabase.from('metrics_by_hour').upsert({
              organization_id: account.organization_id,
              campaign_id: campaignId,
              day_of_week: dayOfWeek,
              hour: Number(hour),
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              conversions,
              cost,
              cpa: conversions > 0 ? cost / conversions : 0,
              roas: cost > 0 ? Number(m.conversionsValue || 0) / cost : 0,
              period: today,
            }, { onConflict: 'organization_id,campaign_id,day_of_week,hour,period' });
            syncStats.hourly++;
          }
        } catch (e) {
          console.error('Error syncing hourly report:', e);
        }

        // Update account last sync
        await supabase
          .from('ad_accounts')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', account.id);

        results.push({
          accountId: account.id,
          accountName: account.account_name,
          ...syncStats,
        });

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
