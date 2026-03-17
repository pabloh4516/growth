import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getUserOrganization } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Report Writer
 *
 * Generates natural language reports (daily/weekly/monthly) in Portuguese.
 * Fetches campaigns, sales, and metrics for the period, then calls Claude
 * to produce an executive summary. Saves to ai_reports table.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    // Authenticate user
    const { user } = await validateAuth(req);
    const body = await req.json();
    const { organizationId, reportType } = body;

    if (!organizationId) {
      return jsonResponse({ error: 'Missing organizationId' }, 400, corsHeaders);
    }

    if (!reportType || !['daily', 'weekly', 'monthly'].includes(reportType)) {
      return jsonResponse({ error: 'reportType must be daily, weekly, or monthly' }, 400, corsHeaders);
    }

    // Validate org membership
    const { organization } = await getUserOrganization(user.id, organizationId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Determine date range
    const now = new Date();
    const periodDays = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = now.toISOString();

    // Fetch campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'paused']);

    // Fetch metrics_daily for the period
    const { data: metrics } = await supabase
      .from('metrics_daily')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', periodStart.split('T')[0])
      .lte('date', periodEnd.split('T')[0])
      .order('date', { ascending: true });

    // Fetch Utmify sales for the period
    const { data: sales } = await supabase
      .from('utmify_sales')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('sale_date', periodStart)
      .lte('sale_date', periodEnd);

    // Aggregate data
    const totalSpend = (campaigns || []).reduce((sum: number, c: any) => sum + Number(c.cost || 0), 0);
    const paidSales = (sales || []).filter((s: any) => s.status === 'paid');
    const totalRevenue = paidSales.reduce((sum: number, s: any) => sum + Number(s.revenue || 0), 0);
    const refunds = (sales || []).filter((s: any) => s.status === 'refunded').length;
    const chargebacks = (sales || []).filter((s: any) => s.status === 'chargedback').length;
    const totalClicks = (campaigns || []).reduce((sum: number, c: any) => sum + Number(c.clicks || 0), 0);
    const totalImpressions = (campaigns || []).reduce((sum: number, c: any) => sum + Number(c.impressions || 0), 0);

    const campaignSummaries = (campaigns || []).map((c: any) => ({
      name: c.name,
      status: c.status,
      cost: c.cost,
      clicks: c.clicks,
      impressions: c.impressions,
      ctr: c.ctr,
      realSales: c.real_sales_count,
      realRevenue: c.real_revenue,
      realRoas: c.real_roas,
      realCpa: c.real_cpa,
    }));

    const metricsTrend = (metrics || []).map((m: any) => ({
      date: m.date,
      spend: m.spend,
      clicks: m.clicks,
      impressions: m.impressions,
      revenue: m.revenue,
      sales: m.sales_count,
    }));

    const periodLabel = reportType === 'daily' ? 'diário' : reportType === 'weekly' ? 'semanal' : 'mensal';

    // Call Claude to generate report
    const claudeResponse = await callClaude({
      system: `Você é um analista de marketing digital expert, especializado em Google Ads para o mercado brasileiro.
Sua tarefa é gerar relatórios executivos claros, objetivos e acionáveis em português brasileiro.

## REGRAS
- Use linguagem profissional mas acessível
- Inclua números e percentuais sempre que possível
- Destaque pontos positivos e negativos
- Termine com recomendações práticas
- Use formatação Markdown para estruturar o relatório
- ROAS real = receita Utmify / custo Google Ads (nunca use conversões do Google como vendas reais)

## FORMATO
Gere o relatório com as seguintes seções:
1. **Resumo Executivo** (2-3 parágrafos)
2. **Métricas Principais** (tabela ou lista)
3. **Desempenho por Campanha** (análise das top campanhas)
4. **Tendências** (baseado nos dados diários)
5. **Pontos de Atenção** (problemas e riscos)
6. **Recomendações** (3-5 ações sugeridas)`,
      messages: [{
        role: 'user',
        content: `Gere um relatório ${periodLabel} para a organização.

## PERÍODO
De ${periodStart.split('T')[0]} a ${periodEnd.split('T')[0]} (${periodDays} dias)

## RESUMO GERAL
- Investimento total: R$${totalSpend.toFixed(2)}
- Receita real (Utmify): R$${totalRevenue.toFixed(2)}
- ROAS real: ${totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0'}x
- Vendas pagas: ${paidSales.length}
- CPA real médio: ${paidSales.length > 0 ? 'R$' + (totalSpend / paidSales.length).toFixed(2) : 'N/A'}
- Impressões: ${totalImpressions.toLocaleString()}
- Cliques: ${totalClicks.toLocaleString()}
- CTR médio: ${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0'}%
- Reembolsos: ${refunds}
- Chargebacks: ${chargebacks}

## CAMPANHAS
${JSON.stringify(campaignSummaries, null, 2)}

## MÉTRICAS DIÁRIAS (tendência)
${JSON.stringify(metricsTrend, null, 2)}

Gere o relatório completo em Markdown.`,
      }],
      maxTokens: 4096,
      temperature: 0.4,
    });

    const reportContent = claudeResponse.content;

    // Save to ai_reports table
    const { data: report, error: insertError } = await supabase
      .from('ai_reports')
      .insert({
        organization_id: organizationId,
        report_type: reportType,
        period_start: periodStart.split('T')[0],
        period_end: periodEnd.split('T')[0],
        content: reportContent,
        data_snapshot: {
          totalSpend,
          totalRevenue,
          paidSalesCount: paidSales.length,
          refunds,
          chargebacks,
          totalClicks,
          totalImpressions,
          campaignsCount: (campaigns || []).length,
        },
        tokens_used: claudeResponse.tokensUsed,
        model_used: claudeResponse.model,
        generated_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving report:', insertError);
    }

    return jsonResponse({
      success: true,
      reportId: report?.id,
      reportType,
      periodStart: periodStart.split('T')[0],
      periodEnd: periodEnd.split('T')[0],
      content: reportContent,
      tokensUsed: claudeResponse.tokensUsed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('AI Report error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
