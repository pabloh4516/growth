import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getUserOrganization } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI ROI Prediction
 *
 * Given a proposed budget (and optionally a specific campaign),
 * fetches 30-90 days of historical metrics and uses Claude to
 * estimate conversions, CPA, revenue, and ROI with confidence intervals.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    // Authenticate user
    const { user } = await validateAuth(req);
    const body = await req.json();
    const { organizationId, campaignId, proposedBudget } = body;

    if (!organizationId) {
      return jsonResponse({ error: 'Missing organizationId' }, 400, corsHeaders);
    }

    if (!proposedBudget || proposedBudget <= 0) {
      return jsonResponse({ error: 'proposedBudget must be a positive number' }, 400, corsHeaders);
    }

    // Validate org membership
    await getUserOrganization(user.id, organizationId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch historical metrics (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let metricsQuery = supabase
      .from('metrics_daily')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', ninetyDaysAgo)
      .order('date', { ascending: true });

    if (campaignId) {
      metricsQuery = metricsQuery.eq('campaign_id', campaignId);
    }

    const { data: metrics } = await metricsQuery;

    // Fetch campaign info if specific campaign
    let campaignInfo: any = null;
    if (campaignId) {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();
      campaignInfo = data;
    }

    // Fetch Utmify sales for historical context
    const { data: sales } = await supabase
      .from('utmify_sales')
      .select('sale_date, revenue, status, matched_campaign_id')
      .eq('organization_id', organizationId)
      .gte('sale_date', ninetyDaysAgo)
      .eq('status', 'paid');

    // Aggregate historical data
    const totalDays = (metrics || []).length > 0
      ? Math.max(1, new Set((metrics || []).map((m: any) => m.date)).size)
      : 0;

    const totalSpend = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.spend || 0), 0);
    const totalClicks = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.clicks || 0), 0);
    const totalImpressions = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.impressions || 0), 0);
    const totalConversions = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.conversions || 0), 0);

    const relevantSales = campaignId
      ? (sales || []).filter((s: any) => s.matched_campaign_id === campaignId)
      : (sales || []);
    const totalRealRevenue = relevantSales.reduce((sum: number, s: any) => sum + Number(s.revenue || 0), 0);
    const totalRealSales = relevantSales.length;

    const avgDailySpend = totalDays > 0 ? totalSpend / totalDays : 0;
    const avgCPA = totalRealSales > 0 ? totalSpend / totalRealSales : 0;
    const avgROAS = totalSpend > 0 ? totalRealRevenue / totalSpend : 0;
    const avgConvRate = totalClicks > 0 ? (totalRealSales / totalClicks) * 100 : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgTicket = totalRealSales > 0 ? totalRealRevenue / totalRealSales : 0;

    // Weekly trends (last 4 weeks)
    const weeklyData: any[] = [];
    for (let w = 0; w < 4; w++) {
      const weekEnd = new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekMetrics = (metrics || []).filter((m: any) => {
        const d = new Date(m.date);
        return d >= weekStart && d < weekEnd;
      });
      const wSpend = weekMetrics.reduce((s: number, m: any) => s + Number(m.spend || 0), 0);
      const wClicks = weekMetrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
      const wSales = relevantSales.filter((s: any) => {
        const d = new Date(s.sale_date);
        return d >= weekStart && d < weekEnd;
      });
      weeklyData.push({
        week: `Semana -${w + 1}`,
        spend: wSpend,
        clicks: wClicks,
        sales: wSales.length,
        revenue: wSales.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0),
      });
    }

    // Call Claude for prediction
    const claudeResponse = await callClaude({
      system: `Você é um especialista em previsão de ROI para campanhas de Google Ads no mercado brasileiro.
Sua tarefa é prever resultados de investimento com base em dados históricos.

## REGRAS
- Use SOMENTE dados de vendas reais (Utmify), nunca conversões do Google
- Forneça intervalos de confiança (pessimista, provável, otimista)
- Considere tendências recentes (últimas semanas pesam mais)
- Considere efeitos de escala (ao aumentar budget, CPA tende a subir)
- Seja conservador nas estimativas

## FORMATO DE RESPOSTA
Retorne SEMPRE um JSON válido:
{
  "prediction": {
    "estimatedConversions": { "low": N, "mid": N, "high": N },
    "estimatedCPA": { "low": N, "mid": N, "high": N },
    "estimatedRevenue": { "low": N, "mid": N, "high": N },
    "estimatedROAS": { "low": N, "mid": N, "high": N },
    "estimatedROI": { "low": N, "mid": N, "high": N },
    "confidenceLevel": 0.0 to 1.0,
    "timeframeMonths": 1
  },
  "assumptions": ["lista de premissas usadas"],
  "risks": ["lista de riscos identificados"],
  "recommendation": "Recomendação geral em português"
}`,
      messages: [{
        role: 'user',
        content: `Preveja o ROI para um investimento proposto de R$${proposedBudget.toFixed(2)}/mês.

## CONTEXTO
${campaignInfo ? `Campanha: ${campaignInfo.name} (${campaignInfo.status})` : 'Análise geral da organização'}
Período histórico analisado: ${totalDays} dias

## MÉTRICAS HISTÓRICAS (últimos 90 dias)
- Gasto total: R$${totalSpend.toFixed(2)}
- Gasto médio diário: R$${avgDailySpend.toFixed(2)}
- Vendas reais (Utmify): ${totalRealSales}
- Receita real: R$${totalRealRevenue.toFixed(2)}
- CPA real médio: ${avgCPA > 0 ? 'R$' + avgCPA.toFixed(2) : 'N/A'}
- ROAS real: ${avgROAS.toFixed(2)}x
- CTR médio: ${avgCTR.toFixed(2)}%
- Taxa de conversão (clique→venda): ${avgConvRate.toFixed(2)}%
- Ticket médio: ${avgTicket > 0 ? 'R$' + avgTicket.toFixed(2) : 'N/A'}
- Impressões totais: ${totalImpressions}
- Cliques totais: ${totalClicks}

## TENDÊNCIA SEMANAL (mais recente primeiro)
${JSON.stringify(weeklyData, null, 2)}

## BUDGET PROPOSTO
R$${proposedBudget.toFixed(2)}/mês (R$${(proposedBudget / 30).toFixed(2)}/dia)
${avgDailySpend > 0 ? `Variação vs atual: ${(((proposedBudget / 30) / avgDailySpend - 1) * 100).toFixed(0)}%` : ''}

Gere a previsão em JSON.`,
      }],
      maxTokens: 2048,
      temperature: 0.3,
    });

    // Parse Claude response
    let prediction: any;
    try {
      const jsonMatch = claudeResponse.content.match(/\{[\s\S]*\}/);
      prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      prediction = null;
    }

    if (!prediction) {
      return jsonResponse({
        error: 'Failed to generate prediction',
        rawResponse: claudeResponse.content,
      }, 500, corsHeaders);
    }

    return jsonResponse({
      success: true,
      proposedBudget,
      campaignId: campaignId || null,
      campaignName: campaignInfo?.name || null,
      historicalData: {
        days: totalDays,
        totalSpend,
        totalRevenue: totalRealRevenue,
        totalSales: totalRealSales,
        avgCPA,
        avgROAS,
        avgConvRate,
        avgTicket,
      },
      prediction: prediction.prediction,
      assumptions: prediction.assumptions,
      risks: prediction.risks,
      recommendation: prediction.recommendation,
      tokensUsed: claudeResponse.tokensUsed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('AI ROI Prediction error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
