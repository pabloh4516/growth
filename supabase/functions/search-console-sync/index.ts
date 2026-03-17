import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Google Search Console Sync
 * Syncs keyword rankings, organic clicks, impressions for SEO Monitor
 */

const SEARCH_CONSOLE_API = 'https://www.googleapis.com/webmasters/v3';

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

    if (!isCron) {
      await validateAuth(req);
      const body = await req.json().catch(() => ({}));
      orgFilter = body.organizationId || null;
    }

    let query = supabase
      .from('integrations')
      .select('*')
      .eq('type', 'search_console')
      .eq('status', 'connected');

    if (orgFilter) query = query.eq('organization_id', orgFilter);

    const { data: integrations } = await query;

    if (!integrations || integrations.length === 0) {
      return jsonResponse({ message: 'No Search Console integrations' }, 200, corsHeaders);
    }

    const results = [];

    for (const integration of integrations) {
      try {
        const config = integration.config || {};
        const siteUrl = config.site_url;
        const accessToken = config.access_token;

        if (!siteUrl || !accessToken) {
          results.push({ id: integration.id, error: 'Missing config' });
          continue;
        }

        // Fetch search analytics for last 28 days
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const response = await fetch(
          `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              startDate,
              endDate,
              dimensions: ['query', 'page'],
              rowLimit: 500,
            }),
          }
        );

        if (!response.ok) {
          results.push({ id: integration.id, error: `GSC API: ${response.status}` });
          continue;
        }

        const data = await response.json();
        const rows = data.rows || [];

        let synced = 0;
        for (const row of rows) {
          const keyword = row.keys[0];
          const url = row.keys[1];

          // Get previous position for tracking changes
          const { data: existing } = await supabase
            .from('seo_keywords')
            .select('current_position')
            .eq('organization_id', integration.organization_id)
            .eq('keyword', keyword)
            .single();

          await supabase.from('seo_keywords').upsert({
            organization_id: integration.organization_id,
            keyword,
            current_position: Math.round(row.position),
            previous_position: existing?.current_position || null,
            search_volume: 0, // Not available from GSC
            url,
            tracked_since: existing ? undefined : new Date().toISOString().split('T')[0],
          }, {
            onConflict: 'organization_id,keyword',
            ignoreDuplicates: false,
          });

          synced++;
        }

        // Save daily SEO metrics aggregated
        const totalClicks = rows.reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);
        const today = new Date().toISOString().split('T')[0];

        await supabase.from('seo_metrics_daily').upsert({
          organization_id: integration.organization_id,
          date: today,
          organic_sessions: totalClicks,
          organic_conversions: 0, // Need GA4 data for this
          organic_revenue: 0,
        }, { onConflict: 'organization_id,date' });

        // Build SEO vs Paid comparison
        const { data: paidKeywords } = await supabase
          .from('keywords')
          .select('text, ad_groups(campaign_id, campaigns(organization_id, cost))')
          .limit(100);

        // Cross-reference organic vs paid keywords
        for (const row of rows) {
          const keyword = row.keys[0];
          // Check if this keyword is also being paid for
          const paidMatch = (paidKeywords || []).find((pk: any) =>
            pk.text.toLowerCase() === keyword.toLowerCase()
          );

          if (paidMatch) {
            await supabase.from('seo_vs_paid').upsert({
              organization_id: integration.organization_id,
              keyword,
              organic_position: Math.round(row.position),
              organic_clicks: row.clicks || 0,
              paid_clicks: 0, // Would need to aggregate from metrics
              paid_cost: 0,
              paid_cpa: 0,
              overlap_savings_potential: 0, // Calculate later
              period: `${startDate}_${endDate}`,
            }, { onConflict: 'organization_id,keyword' });
          }
        }

        results.push({ id: integration.id, synced });
      } catch (e) {
        results.push({ id: integration.id, error: e.message });
      }
    }

    return jsonResponse({ success: true, results }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
