import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';
import { callClaude, buildTrafficManagerPrompt } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Analysis Engine (The Brain)
 *
 * Runs periodically (cron) or on-demand.
 * Analyzes Google Ads metrics + Utmify real sales data.
 * Makes autonomous decisions and executes them.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Auth: either user token or cron secret
    let organizationId: string;
    const isCron = validateCronSecret(req);

    if (isCron) {
      // Cron mode: analyze all orgs with AI enabled
      const { data: orgs } = await supabase
        .from('ai_settings')
        .select('organization_id')
        .eq('enabled', true);

      if (!orgs || orgs.length === 0) {
        return jsonResponse({ message: 'No organizations with AI enabled' }, 200, corsHeaders);
      }

      const results = [];
      for (const org of orgs) {
        const result = await analyzeOrganization(supabase, org.organization_id);
        results.push(result);
      }

      return jsonResponse({ results }, 200, corsHeaders);
    } else {
      // Manual trigger: try auth, fallback to body-only
      let body: any = {};
      try {
        body = await req.json();
      } catch { /* empty body */ }

      try {
        await validateAuth(req);
      } catch {
        // Auth failed but if organizationId provided, allow it
        if (!body.organizationId) {
          return jsonResponse({ error: 'Unauthorized - missing organizationId' }, 401, corsHeaders);
        }
      }

      organizationId = body.organizationId;

      if (!organizationId) {
        return jsonResponse({ error: 'Missing organizationId' }, 400, corsHeaders);
      }

      const result = await analyzeOrganization(supabase, organizationId);
      return jsonResponse(result, 200, corsHeaders);
    }
  } catch (error) {
    console.error('AI Analysis error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});

async function analyzeOrganization(supabase: any, organizationId: string) {
  const startTime = Date.now();

  // Create analysis record
  const { data: analysis } = await supabase
    .from('ai_analyses')
    .insert({
      organization_id: organizationId,
      status: 'running',
      trigger_type: 'scheduled',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    // 1. Get AI settings
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!settings) {
      throw new Error('AI settings not found');
    }

    // 2. Get active campaigns with metrics
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'paused'])
      .order('cost', { ascending: false });

    // 3. Get Utmify sales (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: utmifySales } = await supabase
      .from('utmify_sales')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('sale_date', thirtyDaysAgo);

    // 4. Get recent AI decisions (to avoid repeating)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDecisions } = await supabase
      .from('ai_decisions')
      .select('decision_type, campaign_id, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', sevenDaysAgo);

    // 5. Build data context for Claude
    const campaignsSummary = (campaigns || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      dailyBudget: c.daily_budget,
      cost: c.cost,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      googleConversions: c.google_conversions,
      googleROAS: c.cost > 0 ? (c.google_conversion_value / c.cost).toFixed(2) : '0',
      realSales: c.real_sales_count,
      realRevenue: c.real_revenue,
      realROAS: c.real_roas,
      realCPA: c.real_cpa,
      gapGoogleVsReal: c.google_conversions > 0 && c.real_sales_count === 0
        ? 'ALERTA: Google diz conversões mas Utmify mostra 0 vendas pagas!'
        : null,
    }));

    const salesSummary = {
      totalPaidSales: (utmifySales || []).filter((s: any) => s.status === 'paid').length,
      totalRevenue: (utmifySales || []).filter((s: any) => s.status === 'paid')
        .reduce((sum: number, s: any) => sum + Number(s.revenue), 0),
      matchedSales: (utmifySales || []).filter((s: any) => s.matched_campaign_id).length,
      unmatchedSales: (utmifySales || []).filter((s: any) => !s.matched_campaign_id && s.status === 'paid').length,
      refunds: (utmifySales || []).filter((s: any) => s.status === 'refunded').length,
      chargebacks: (utmifySales || []).filter((s: any) => s.status === 'chargedback').length,
    };

    const totalSpend = (campaigns || []).reduce((sum: number, c: any) => sum + Number(c.cost || 0), 0);

    // 6. Call Claude
    const systemPrompt = buildTrafficManagerPrompt({
      targetRoas: settings.target_roas,
      maxCpa: settings.max_cpa,
      maxBudgetChangePct: settings.max_budget_change_pct,
      minDataDays: settings.min_data_days,
      dailyBudgetLimit: settings.daily_budget_limit,
    });

    const userMessage = `Analise os seguintes dados da operação e tome decisões:

## CAMPANHAS (${campaignsSummary.length} ativas/pausadas)
${JSON.stringify(campaignsSummary, null, 2)}

## VENDAS REAIS (Utmify - últimos 30 dias)
${JSON.stringify(salesSummary, null, 2)}

## TOTAIS
- Gasto total: R$${totalSpend.toFixed(2)}
- Receita real (Utmify): R$${salesSummary.totalRevenue.toFixed(2)}
- ROAS real geral: ${totalSpend > 0 ? (salesSummary.totalRevenue / totalSpend).toFixed(2) : '0'}x
- Match rate: ${salesSummary.totalPaidSales > 0 ? ((salesSummary.matchedSales / salesSummary.totalPaidSales) * 100).toFixed(0) : '0'}%

## DECISÕES RECENTES (para não repetir)
${JSON.stringify(recentDecisions || [], null, 2)}

Analise e retorne suas decisões em JSON.`;

    const claudeResponse = await callClaude({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      temperature: 0.3,
    });

    // 7. Parse response
    let aiOutput: any;
    try {
      // Try to extract JSON from response
      const jsonMatch = claudeResponse.content.match(/\{[\s\S]*\}/);
      aiOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: claudeResponse.content, decisions: [], insights: [] };
    } catch {
      aiOutput = { summary: claudeResponse.content, decisions: [], insights: [] };
    }

    // 8. Save decisions
    const decisions = aiOutput.decisions || [];
    const savedDecisions: any[] = [];
    for (const decision of decisions) {
      const { data: saved } = await supabase.from('ai_decisions').insert({
        organization_id: organizationId,
        analysis_id: analysis?.id,
        decision_type: decision.type,
        status: settings.auto_execute ? 'approved' : 'pending',
        campaign_id: decision.campaignId || null,
        reasoning: decision.reasoning,
        action_details: decision.action || {},
        data_snapshot: { campaigns: campaignsSummary, sales: salesSummary },
        confidence: decision.confidence || 0.5,
        priority: decision.priority || 5,
      }).select().single();
      if (saved) savedDecisions.push(saved);
    }

    // 9. Save insights
    const insights = aiOutput.insights || [];
    for (const insight of insights) {
      await supabase.from('insights').insert({
        organization_id: organizationId,
        type: insight.type,
        severity: insight.severity || 'info',
        title: insight.title,
        description: insight.description,
        suggested_action: insight.suggestedAction,
        data: {},
        status: 'new',
      });
    }

    // 10. Auto-execute decisions if enabled
    if (settings.auto_execute) {
      for (const decision of savedDecisions || []) {
        if (decision.status === 'approved' && decision.campaign_id) {
          try {
            const executeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-execute`;
            await fetch(executeUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ decisionId: decision.id }),
            });
          } catch (execErr) {
            console.error(`Auto-execute failed for decision ${decision.id}:`, execErr);
          }
        }
      }
    }

    // 11. Update analysis record
    const durationMs = Date.now() - startTime;
    await supabase
      .from('ai_analyses')
      .update({
        status: 'completed',
        campaigns_analyzed: (campaigns || []).length,
        utmify_sales_analyzed: (utmifySales || []).length,
        total_spend_analyzed: totalSpend,
        decisions_count: decisions.length,
        summary: aiOutput.summary || '',
        full_analysis: aiOutput,
        raw_claude_response: claudeResponse.content,
        tokens_used: claudeResponse.tokensUsed,
        model_used: claudeResponse.model,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysis?.id);

    return {
      success: true,
      analysisId: analysis?.id,
      summary: aiOutput.summary,
      decisionsCount: decisions.length,
      insightsCount: insights.length,
      durationMs,
      tokensUsed: claudeResponse.tokensUsed,
    };

  } catch (error) {
    // Mark analysis as failed
    if (analysis?.id) {
      await supabase
        .from('ai_analyses')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', analysis.id);
    }

    throw error;
  }
}
