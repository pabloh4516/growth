/**
 * GrowthOS — Campaign Matcher (Shared)
 *
 * Robust multi-strategy matching of sales to Google Ads campaigns.
 * Used by: utmify-webhook, sellx-webhook, utmify-sync, sellx-sync, rematch-sales
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

interface TrackingParams {
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  src?: string | null;
  sck?: string | null;
}

interface MatchResult {
  campaignId: string | null;
  confidence: number;
  strategy: string;
}

/**
 * Match a sale to a campaign using multiple strategies.
 * Returns the best match with confidence score and strategy used.
 */
export async function matchSaleToCampaign(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  tracking: TrackingParams,
): Promise<MatchResult> {
  // Load all campaigns for this org (cached per function invocation)
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, external_id, name')
    .eq('organization_id', orgId);

  if (!campaigns || campaigns.length === 0) {
    return { campaignId: null, confidence: 0, strategy: 'none' };
  }

  // ─── Strategy 1: sck/src contains campaign external_id (0.95) ───
  if (tracking.sck || tracking.src) {
    const searchValue = (tracking.sck || tracking.src || '').toLowerCase();
    for (const campaign of campaigns) {
      if (campaign.external_id && searchValue.includes(campaign.external_id)) {
        return { campaignId: campaign.id, confidence: 0.95, strategy: 'sck_external_id' };
      }
    }
  }

  // ─── Strategy 2: utm_campaign IS the external_id (0.95) ───
  // Common: Google Ads auto-tags utm_campaign with the campaign ID number
  if (tracking.utm_campaign) {
    const utmCampaign = tracking.utm_campaign.trim();
    const exactIdMatch = campaigns.find(c =>
      c.external_id && c.external_id === utmCampaign
    );
    if (exactIdMatch) {
      return { campaignId: exactIdMatch.id, confidence: 0.95, strategy: 'utm_campaign_is_external_id' };
    }
  }

  // ─── Strategy 3: utm_campaign exact name match (0.85) ───
  if (tracking.utm_campaign) {
    const utmCampaign = tracking.utm_campaign.trim().toLowerCase();
    const exactNameMatch = campaigns.find(c =>
      c.name && c.name.toLowerCase() === utmCampaign
    );
    if (exactNameMatch) {
      return { campaignId: exactNameMatch.id, confidence: 0.85, strategy: 'utm_campaign_exact_name' };
    }
  }

  // ─── Strategy 4: utm_campaign partial name match (0.7 single, 0.5 multiple) ───
  if (tracking.utm_campaign) {
    const utmCampaign = tracking.utm_campaign.trim().toLowerCase();
    const partialMatches = campaigns.filter(c =>
      c.name && (
        c.name.toLowerCase().includes(utmCampaign) ||
        utmCampaign.includes(c.name.toLowerCase())
      )
    );

    if (partialMatches.length === 1) {
      return { campaignId: partialMatches[0].id, confidence: 0.7, strategy: 'utm_campaign_partial_name' };
    }
    if (partialMatches.length > 1) {
      // Pick the one with the closest name length
      const sorted = partialMatches.sort((a, b) =>
        Math.abs(a.name.length - utmCampaign.length) - Math.abs(b.name.length - utmCampaign.length)
      );
      return { campaignId: sorted[0].id, confidence: 0.5, strategy: 'utm_campaign_partial_name_multi' };
    }
  }

  // ─── Strategy 5: utm_content contains external_id or campaign name (0.6) ───
  if (tracking.utm_content) {
    const utmContent = tracking.utm_content.trim().toLowerCase();

    // Check if utm_content is an external_id
    const contentIdMatch = campaigns.find(c =>
      c.external_id && (utmContent === c.external_id || utmContent.includes(c.external_id))
    );
    if (contentIdMatch) {
      return { campaignId: contentIdMatch.id, confidence: 0.6, strategy: 'utm_content_external_id' };
    }

    // Check if utm_content matches a campaign name
    const contentNameMatch = campaigns.find(c =>
      c.name && c.name.toLowerCase().includes(utmContent)
    );
    if (contentNameMatch) {
      return { campaignId: contentNameMatch.id, confidence: 0.5, strategy: 'utm_content_name' };
    }
  }

  // ─── Strategy 6: utm_source=google + single active campaign fallback (0.3) ───
  if (tracking.utm_source === 'google' || tracking.utm_source === 'google_ads') {
    // If there's only one active campaign, it's probably the one
    const { data: activeCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .gt('cost', 0);

    if (activeCampaigns && activeCampaigns.length === 1) {
      return { campaignId: activeCampaigns[0].id, confidence: 0.3, strategy: 'single_active_campaign' };
    }
  }

  return { campaignId: null, confidence: 0, strategy: 'no_match' };
}

/**
 * After matching a sale to a campaign, recalculate the campaign's real metrics.
 */
export async function recalculateCampaignMetrics(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
) {
  const { data: salesForCampaign } = await supabase
    .from('utmify_sales')
    .select('revenue')
    .eq('matched_campaign_id', campaignId)
    .eq('status', 'paid');

  if (!salesForCampaign) return;

  const realSalesCount = salesForCampaign.length;
  const realRevenue = salesForCampaign.reduce((sum, s) => sum + Number(s.revenue), 0);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('cost')
    .eq('id', campaignId)
    .single();

  const cost = Number(campaign?.cost || 0);
  const realRoas = cost > 0 ? realRevenue / cost : 0;
  const realCpa = realSalesCount > 0 ? cost / realSalesCount : 0;

  await supabase
    .from('campaigns')
    .update({
      real_sales_count: realSalesCount,
      real_revenue: realRevenue,
      real_roas: Math.round(realRoas * 100) / 100,
      real_cpa: Math.round(realCpa * 100) / 100,
    })
    .eq('id', campaignId);
}
