import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret, validateAuth } from '../_shared/auth.ts';

/**
 * GrowthOS — Funnel Snapshot (Cron Job)
 *
 * Runs daily. For each organization, calculates funnel metrics from
 * tracking_events, saves a daily snapshot to funnel_snapshots, and
 * detects bottleneck stages where conversion rate falls below benchmark.
 */

// Funnel stages in order, with benchmark conversion rates
const FUNNEL_STAGES = [
  { key: 'impression', label: 'Impressão', benchmark: 1.0 },
  { key: 'click', label: 'Clique', benchmark: 0.03 },         // 3% CTR benchmark
  { key: 'page_view', label: 'Visualização', benchmark: 0.80 }, // 80% land on page
  { key: 'lead', label: 'Lead', benchmark: 0.10 },              // 10% become leads
  { key: 'form_submit', label: 'Formulário', benchmark: 0.30 }, // 30% of leads submit form
  { key: 'checkout_init', label: 'Início Checkout', benchmark: 0.50 }, // 50% initiate checkout
  { key: 'purchase', label: 'Compra', benchmark: 0.30 },        // 30% complete purchase
];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const isCron = validateCronSecret(req);
  if (!isCron) {
    try {
      await validateAuth(req);
    } catch {
      // Allow if body has organizationId (manual trigger)
      try {
        const body = await req.clone().json();
        if (!body.organizationId && !body.funnelId) {
          return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
        }
      } catch {
        return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
      }
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Get all active organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name');

    if (!orgs || orgs.length === 0) {
      return jsonResponse({ message: 'No organizations found' }, 200, corsHeaders);
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const results: any[] = [];

    for (const org of orgs) {
      try {
        // Count events by type for yesterday
        const stageCounts: Record<string, number> = {};

        for (const stage of FUNNEL_STAGES) {
          if (stage.key === 'impression') {
            // Impressions come from campaigns, not tracking_events
            const { data: campaigns } = await supabase
              .from('metrics_daily')
              .select('impressions')
              .eq('organization_id', org.id)
              .eq('date', yesterday);

            stageCounts[stage.key] = (campaigns || []).reduce(
              (sum: number, c: any) => sum + Number(c.impressions || 0), 0
            );
          } else if (stage.key === 'click') {
            // Clicks from metrics_daily
            const { data: campaigns } = await supabase
              .from('metrics_daily')
              .select('clicks')
              .eq('organization_id', org.id)
              .eq('date', yesterday);

            stageCounts[stage.key] = (campaigns || []).reduce(
              (sum: number, c: any) => sum + Number(c.clicks || 0), 0
            );
          } else if (stage.key === 'purchase') {
            // Purchases from utmify_sales
            const { data: sales } = await supabase
              .from('utmify_sales')
              .select('id')
              .eq('organization_id', org.id)
              .gte('sale_date', yesterday)
              .lt('sale_date', today)
              .eq('status', 'paid');

            stageCounts[stage.key] = (sales || []).length;
          } else {
            // Other stages from tracking_events
            const { count } = await supabase
              .from('tracking_events')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', org.id)
              .eq('event_type', stage.key)
              .gte('created_at', `${yesterday}T00:00:00`)
              .lt('created_at', `${today}T00:00:00`);

            stageCounts[stage.key] = count || 0;
          }
        }

        // Calculate conversion rates between consecutive stages
        const stageMetrics: any[] = [];
        const bottlenecks: any[] = [];

        for (let i = 0; i < FUNNEL_STAGES.length; i++) {
          const stage = FUNNEL_STAGES[i];
          const count = stageCounts[stage.key] || 0;
          const prevCount = i > 0 ? (stageCounts[FUNNEL_STAGES[i - 1].key] || 0) : count;
          const conversionRate = prevCount > 0 ? count / prevCount : 0;

          stageMetrics.push({
            stage: stage.key,
            label: stage.label,
            count,
            conversion_rate: conversionRate,
            benchmark: stage.benchmark,
          });

          // Detect bottleneck: conversion rate below benchmark (skip first stage)
          if (i > 0 && prevCount > 10 && conversionRate < stage.benchmark * 0.7) {
            bottlenecks.push({
              stage: stage.key,
              label: stage.label,
              conversion_rate: conversionRate,
              benchmark: stage.benchmark,
              gap_pct: ((stage.benchmark - conversionRate) / stage.benchmark * 100).toFixed(1),
              previous_stage: FUNNEL_STAGES[i - 1].key,
              previous_count: prevCount,
              current_count: count,
            });
          }
        }

        // Overall funnel conversion (impression to purchase)
        const topOfFunnel = stageCounts['impression'] || 0;
        const bottomOfFunnel = stageCounts['purchase'] || 0;
        const overallConversion = topOfFunnel > 0 ? bottomOfFunnel / topOfFunnel : 0;

        // Save snapshot
        const { error: insertError } = await supabase
          .from('funnel_snapshots')
          .insert({
            organization_id: org.id,
            snapshot_date: yesterday,
            stages: stageMetrics,
            bottlenecks,
            overall_conversion: overallConversion,
            total_impressions: stageCounts['impression'] || 0,
            total_clicks: stageCounts['click'] || 0,
            total_leads: stageCounts['lead'] || 0,
            total_purchases: stageCounts['purchase'] || 0,
          });

        if (insertError) {
          console.error(`Error saving snapshot for org ${org.id}:`, insertError);
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          date: yesterday,
          stagesProcessed: stageMetrics.length,
          bottlenecksDetected: bottlenecks.length,
          overallConversion: (overallConversion * 100).toFixed(4) + '%',
        });

      } catch (orgError) {
        console.error(`Error processing org ${org.id}:`, orgError);
        results.push({
          organizationId: org.id,
          error: orgError.message,
        });
      }
    }

    return jsonResponse({
      success: true,
      date: yesterday,
      organizationsProcessed: results.length,
      results,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Funnel snapshot error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
