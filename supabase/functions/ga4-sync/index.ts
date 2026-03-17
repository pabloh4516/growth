import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Google Analytics 4 Sync
 * Syncs sessions, pageviews, conversions from GA4 Data API
 */

const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

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

    // Get GA4 integrations
    let query = supabase
      .from('integrations')
      .select('*')
      .eq('type', 'ga4')
      .eq('status', 'connected');

    if (orgFilter) query = query.eq('organization_id', orgFilter);

    const { data: integrations } = await query;

    if (!integrations || integrations.length === 0) {
      return jsonResponse({ message: 'No GA4 integrations' }, 200, corsHeaders);
    }

    const results = [];

    for (const integration of integrations) {
      try {
        const config = integration.config || {};
        const propertyId = config.property_id;
        const accessToken = config.access_token;

        if (!propertyId || !accessToken) {
          results.push({ id: integration.id, error: 'Missing property_id or access_token' });
          continue;
        }

        // Fetch sessions, pageviews, conversions for last 30 days
        const response = await fetch(
          `${GA4_DATA_API}/properties/${propertyId}:runReport`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
              dimensions: [{ name: 'date' }, { name: 'pagePath' }],
              metrics: [
                { name: 'sessions' },
                { name: 'screenPageViews' },
                { name: 'bounceRate' },
                { name: 'averageSessionDuration' },
                { name: 'conversions' },
              ],
              limit: 1000,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          results.push({ id: integration.id, error: `GA4 API: ${response.status}` });
          continue;
        }

        const data = await response.json();
        const rows = data.rows || [];

        // Save to page_metrics_daily for matching landing pages
        let synced = 0;
        for (const row of rows) {
          const date = row.dimensionValues[0].value; // YYYYMMDD
          const pagePath = row.dimensionValues[1].value;
          const sessions = Number(row.metricValues[0].value || 0);
          const pageViews = Number(row.metricValues[1].value || 0);
          const bounceRate = Number(row.metricValues[2].value || 0);

          // Try to match to a landing page
          const { data: landingPage } = await supabase
            .from('landing_pages')
            .select('id')
            .eq('organization_id', integration.organization_id)
            .ilike('url', `%${pagePath}%`)
            .limit(1)
            .single();

          if (landingPage) {
            const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
            await supabase.from('page_metrics_daily').upsert({
              landing_page_id: landingPage.id,
              date: formattedDate,
              visitors: sessions,
              unique_visitors: sessions,
              bounce_rate: bounceRate,
              avg_time_on_page: Number(row.metricValues[3].value || 0),
            }, { onConflict: 'landing_page_id,date' });
            synced++;
          }
        }

        // Update integration last sync
        await supabase
          .from('integrations')
          .update({ connected_at: new Date().toISOString() })
          .eq('id', integration.id);

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
