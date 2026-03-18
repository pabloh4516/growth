import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';
import { matchSaleToCampaign, recalculateCampaignMetrics } from '../_shared/campaign-matcher.ts';

/**
 * GrowthOS — Re-match Sales to Campaigns
 *
 * Re-processes unmatched (or low-confidence) sales and tries to match them
 * to campaigns using the improved multi-strategy matcher.
 *
 * Can be triggered:
 * - Manually from the Sales page (authenticated)
 * - Via cron job (cron secret)
 * - After a Google Ads sync completes (to catch newly synced campaigns)
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    let orgFilter: string | null = null;
    const isCron = validateCronSecret(req);

    if (!isCron) {
      const { user } = await validateAuth(req);
      const body = await req.json().catch(() => ({}));
      orgFilter = body.organizationId || null;
    }

    // Get unmatched or low-confidence sales
    let query = supabase
      .from('utmify_sales')
      .select('id, organization_id, utm_source, utm_campaign, utm_medium, utm_content, utm_term, src, sck, status, matched_campaign_id, match_confidence')
      .eq('status', 'paid')
      .or('matched_campaign_id.is.null,match_confidence.lt.0.5');

    if (orgFilter) {
      query = query.eq('organization_id', orgFilter);
    }

    // Process in batches
    const { data: sales, error } = await query.order('created_at', { ascending: false }).limit(500);

    if (error) throw error;
    if (!sales || sales.length === 0) {
      return jsonResponse({ success: true, message: 'No unmatched sales', matched: 0 }, 200, corsHeaders);
    }

    let newlyMatched = 0;
    let improved = 0;
    const affectedCampaigns = new Set<string>();

    for (const sale of sales) {
      const result = await matchSaleToCampaign(supabase, sale.organization_id, {
        utm_source: sale.utm_source,
        utm_campaign: sale.utm_campaign,
        utm_medium: sale.utm_medium,
        utm_content: sale.utm_content,
        utm_term: sale.utm_term,
        src: sale.src,
        sck: sale.sck,
      });

      if (result.campaignId && result.confidence > (sale.match_confidence || 0)) {
        // Remove old campaign from affected set if changing match
        if (sale.matched_campaign_id && sale.matched_campaign_id !== result.campaignId) {
          affectedCampaigns.add(sale.matched_campaign_id);
        }

        await supabase
          .from('utmify_sales')
          .update({
            matched_campaign_id: result.campaignId,
            match_confidence: result.confidence,
          })
          .eq('id', sale.id);

        affectedCampaigns.add(result.campaignId);

        if (!sale.matched_campaign_id) {
          newlyMatched++;
        } else {
          improved++;
        }
      }
    }

    // Recalculate metrics for all affected campaigns
    for (const campaignId of affectedCampaigns) {
      await recalculateCampaignMetrics(supabase, campaignId);
    }

    return jsonResponse({
      success: true,
      salesProcessed: sales.length,
      newlyMatched,
      improved,
      campaignsUpdated: affectedCampaigns.size,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Rematch sales error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
