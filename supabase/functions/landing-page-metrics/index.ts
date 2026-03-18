import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Landing Page Metrics Aggregator (Cron Job)
 *
 * Aggregates daily metrics for landing pages from tracking_events:
 *   - page_views, unique_visitors (by session_id)
 *   - form_submissions (event_type='form_submit')
 *   - bounces (sessions with only 1 pageview)
 *   - conversion_rate = form_submissions / unique_visitors
 *   - bounce_rate = bounces / unique_visitors
 * Upserts into page_metrics_daily.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  if (!validateCronSecret(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Get all organizations with landing pages
    const { data: landingPages } = await supabase
      .from('landing_pages')
      .select('id, organization_id, url');

    if (!landingPages || landingPages.length === 0) {
      return jsonResponse({ message: 'No landing pages found' }, 200, corsHeaders);
    }

    const today = new Date().toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;
    let pagesProcessed = 0;

    for (const page of landingPages) {
      try {
        // Get all tracking events for this landing page today
        const { data: events } = await supabase
          .from('tracking_events')
          .select('event_type, session_id')
          .eq('organization_id', page.organization_id)
          .eq('page_url', page.url)
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd);

        if (!events || events.length === 0) {
          continue;
        }

        // Count page views
        const pageViews = events.filter(
          (e: any) => e.event_type === 'page_view'
        ).length;

        // Unique visitors by session_id
        const uniqueSessions = new Set(
          events.map((e: any) => e.session_id).filter(Boolean)
        );
        const uniqueVisitors = uniqueSessions.size || 1; // Avoid division by zero

        // Form submissions
        const formSubmissions = events.filter(
          (e: any) => e.event_type === 'form_submit'
        ).length;

        // Bounces: sessions with only 1 pageview event
        const sessionPageViewCounts = new Map<string, number>();
        for (const event of events) {
          if (event.event_type === 'page_view' && event.session_id) {
            const current = sessionPageViewCounts.get(event.session_id) || 0;
            sessionPageViewCounts.set(event.session_id, current + 1);
          }
        }

        let bounces = 0;
        for (const [sessionId, count] of sessionPageViewCounts.entries()) {
          // A bounce is a session where the visitor only had 1 pageview
          // and did not trigger any other event types in that session
          const sessionEvents = events.filter(
            (e: any) => e.session_id === sessionId
          );
          if (count === 1 && sessionEvents.length === 1) {
            bounces++;
          }
        }

        // Calculate rates
        const conversionRate = uniqueVisitors > 0
          ? formSubmissions / uniqueVisitors
          : 0;
        const bounceRate = uniqueVisitors > 0
          ? bounces / uniqueVisitors
          : 0;

        // Upsert into page_metrics_daily
        const { data: existing } = await supabase
          .from('page_metrics_daily')
          .select('id')
          .eq('landing_page_id', page.id)
          .eq('date', today)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('page_metrics_daily')
            .update({
              visitors: uniqueVisitors,
              page_views: pageViews,
              form_submissions: formSubmissions,
              bounces,
              conversion_rate: conversionRate,
              bounce_rate: bounceRate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('page_metrics_daily').insert({
            landing_page_id: page.id,
            organization_id: page.organization_id,
            date: today,
            visitors: uniqueVisitors,
            page_views: pageViews,
            form_submissions: formSubmissions,
            bounces,
            conversion_rate: conversionRate,
            bounce_rate: bounceRate,
          });
        }

        pagesProcessed++;
      } catch (pageError) {
        console.error(
          `[landing-page-metrics] Error processing page ${page.id}:`,
          pageError.message
        );
      }
    }

    return jsonResponse({
      success: true,
      date: today,
      pagesProcessed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[landing-page-metrics] Error:', error.message);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
