import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Campaign Health Score (Cron Job)
 *
 * Calculates a 0-100 health score for each campaign based on:
 *   CTR vs benchmark       (25% weight)
 *   CPA vs target          (30% weight)
 *   ROAS real vs target    (25% weight)
 *   Conversion rate vs benchmark (10% weight)
 *   7-day trend            (10% weight)
 * Updates campaigns.health_score.
 */

// Industry benchmarks (Brazilian Google Ads averages)
const BENCHMARKS = {
  ctr: 3.0,             // 3% CTR
  conversionRate: 2.5,  // 2.5% conversion rate
  defaultTargetRoas: 2.0,
  defaultMaxCpa: 50.0,
};

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
    // Get all active/paused campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*, organizations(id)')
      .in('status', ['active', 'paused']);

    if (!campaigns || campaigns.length === 0) {
      return jsonResponse({ message: 'No campaigns found' }, 200, corsHeaders);
    }

    // Preload AI settings for target ROAS / CPA per org
    const orgIds = [...new Set(campaigns.map((c: any) => c.organization_id))];
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('organization_id, target_roas, max_cpa')
      .in('organization_id', orgIds);

    const settingsByOrg: Record<string, any> = {};
    for (const s of (aiSettings || [])) {
      settingsByOrg[s.organization_id] = s;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let campaignsUpdated = 0;
    const results: any[] = [];

    for (const campaign of campaigns) {
      try {
        const orgSettings = settingsByOrg[campaign.organization_id] || {};
        const targetRoas = orgSettings.target_roas || BENCHMARKS.defaultTargetRoas;
        const maxCpa = orgSettings.max_cpa || BENCHMARKS.defaultMaxCpa;

        // --- 1. CTR score (25% weight) ---
        const ctr = Number(campaign.ctr || 0);
        // Score: 100 if CTR >= benchmark, scales linearly down to 0
        const ctrScore = Math.min(100, (ctr / BENCHMARKS.ctr) * 100);

        // --- 2. CPA score (30% weight) ---
        const realCpa = Number(campaign.real_cpa || 0);
        let cpaScore: number;
        if (realCpa === 0 && Number(campaign.real_sales_count || 0) === 0) {
          // No sales: if there's spend, that's bad; if no spend, neutral
          cpaScore = Number(campaign.cost || 0) > 0 ? 10 : 50;
        } else if (realCpa <= maxCpa * 0.5) {
          cpaScore = 100; // Excellent: CPA is half of target or less
        } else if (realCpa <= maxCpa) {
          cpaScore = 60 + 40 * (1 - realCpa / maxCpa); // Good: within target
        } else {
          cpaScore = Math.max(0, 60 * (1 - (realCpa - maxCpa) / maxCpa)); // Over target
        }

        // --- 3. ROAS score (25% weight) ---
        const realRoas = Number(campaign.real_roas || 0);
        let roasScore: number;
        if (realRoas >= targetRoas) {
          roasScore = Math.min(100, 80 + 20 * (realRoas / targetRoas - 1));
        } else if (realRoas > 0) {
          roasScore = (realRoas / targetRoas) * 80;
        } else {
          roasScore = Number(campaign.cost || 0) > 0 ? 0 : 50;
        }

        // --- 4. Conversion rate score (10% weight) ---
        const clicks = Number(campaign.clicks || 0);
        const realSales = Number(campaign.real_sales_count || 0);
        const convRate = clicks > 0 ? (realSales / clicks) * 100 : 0;
        const convScore = Math.min(100, (convRate / BENCHMARKS.conversionRate) * 100);

        // --- 5. 7-day trend score (10% weight) ---
        // Compare last 7 days ROAS vs previous 7 days
        const { data: recentMetrics } = await supabase
          .from('metrics_daily')
          .select('spend, revenue')
          .eq('campaign_id', campaign.id)
          .gte('date', sevenDaysAgo);

        const { data: priorMetrics } = await supabase
          .from('metrics_daily')
          .select('spend, revenue')
          .eq('campaign_id', campaign.id)
          .gte('date', fourteenDaysAgo)
          .lt('date', sevenDaysAgo);

        const recentSpend = (recentMetrics || []).reduce((s: number, m: any) => s + Number(m.spend || 0), 0);
        const recentRevenue = (recentMetrics || []).reduce((s: number, m: any) => s + Number(m.revenue || 0), 0);
        const priorSpend = (priorMetrics || []).reduce((s: number, m: any) => s + Number(m.spend || 0), 0);
        const priorRevenue = (priorMetrics || []).reduce((s: number, m: any) => s + Number(m.revenue || 0), 0);

        const recentRoas = recentSpend > 0 ? recentRevenue / recentSpend : 0;
        const priorRoas = priorSpend > 0 ? priorRevenue / priorSpend : 0;

        let trendScore: number;
        if (priorRoas === 0 && recentRoas === 0) {
          trendScore = 50; // No data, neutral
        } else if (priorRoas === 0) {
          trendScore = 70; // New data appearing is slightly positive
        } else {
          const change = (recentRoas - priorRoas) / priorRoas;
          // +20% improvement = 100, -20% decline = 0, flat = 50
          trendScore = Math.max(0, Math.min(100, 50 + change * 250));
        }

        // --- Weighted total ---
        const healthScore = Math.round(
          ctrScore * 0.25 +
          cpaScore * 0.30 +
          roasScore * 0.25 +
          convScore * 0.10 +
          trendScore * 0.10
        );

        const clampedScore = Math.max(0, Math.min(100, healthScore));

        // Update campaign
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            health_score: clampedScore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaign.id);

        if (!updateError) {
          campaignsUpdated++;
        }

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          healthScore: clampedScore,
          breakdown: {
            ctr: { value: ctr, score: Math.round(ctrScore), weight: '25%' },
            cpa: { value: realCpa, score: Math.round(cpaScore), weight: '30%' },
            roas: { value: realRoas, score: Math.round(roasScore), weight: '25%' },
            conversionRate: { value: convRate, score: Math.round(convScore), weight: '10%' },
            trend: { recentRoas, priorRoas, score: Math.round(trendScore), weight: '10%' },
          },
        });

      } catch (campError) {
        console.error(`Error scoring campaign ${campaign.id}:`, campError);
        results.push({
          campaignId: campaign.id,
          error: campError.message,
        });
      }
    }

    return jsonResponse({
      success: true,
      campaignsProcessed: campaigns.length,
      campaignsUpdated,
      results,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Health score error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
