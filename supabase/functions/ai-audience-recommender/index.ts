import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Audience Recommender
 * Analyzes buyer data, LTV segments, and campaign performance
 * to recommend new audiences to create
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    const { user } = await validateAuth(req);
    const body = await req.json();
    const { organizationId } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Gather data for analysis
    const { data: contacts } = await supabase
      .from('contacts')
      .select('lifecycle_stage, source, lead_score, predicted_ltv')
      .eq('organization_id', organizationId);

    const { data: ltv } = await supabase
      .from('customer_ltv')
      .select('ltv_segment, acquisition_source, acquisition_campaign, total_revenue')
      .eq('organization_id', organizationId);

    const { data: audiences } = await supabase
      .from('audiences')
      .select('name, type, status, size_estimate')
      .eq('organization_id', organizationId);

    const { data: audiencePerf } = await supabase
      .from('audience_performance')
      .select('audience_id, cpa, roas, conversions')
      .order('roas', { ascending: false })
      .limit(20);

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('name, real_roas, real_cpa, real_sales_count, cost')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    const contactStats = {
      total: (contacts || []).length,
      customers: (contacts || []).filter((c: any) => c.lifecycle_stage === 'customer').length,
      leads: (contacts || []).filter((c: any) => c.lifecycle_stage === 'lead').length,
      avgScore: (contacts || []).reduce((sum: number, c: any) => sum + (c.lead_score || 0), 0) / ((contacts || []).length || 1),
      sources: [...new Set((contacts || []).map((c: any) => c.source).filter(Boolean))],
    };

    const ltvStats = {
      total: (ltv || []).length,
      highLTV: (ltv || []).filter((l: any) => l.ltv_segment === 'high').length,
      topSources: [...new Set((ltv || []).filter((l: any) => l.ltv_segment === 'high').map((l: any) => l.acquisition_source).filter(Boolean))],
      avgRevenue: (ltv || []).reduce((sum: number, l: any) => sum + Number(l.total_revenue || 0), 0) / ((ltv || []).length || 1),
    };

    const response = await callClaude({
      system: `Você é um especialista em audiências de mídia paga para o mercado brasileiro.
Analise os dados do CRM e LTV para recomendar audiências a serem criadas no Google Ads.

Retorne JSON com a estrutura:
{
  "recommendations": [
    {
      "name": "Nome descritivo da audiência",
      "type": "custom|lookalike|remarketing",
      "platform": "google_ads",
      "description": "Por que criar esta audiência",
      "source": "De onde vêm os dados (CRM, website, compradores)",
      "estimatedImpact": "Impacto esperado (ex: reduzir CPA em 20%)",
      "priority": 1-5,
      "criteria": { ...filtros sugeridos... }
    }
  ],
  "insights": "Análise geral das audiências em 2-3 frases"
}`,
      messages: [{
        role: 'user',
        content: `Dados do CRM:
${JSON.stringify(contactStats, null, 2)}

Dados de LTV:
${JSON.stringify(ltvStats, null, 2)}

Audiências existentes:
${JSON.stringify(audiences || [], null, 2)}

Performance de audiências:
${JSON.stringify(audiencePerf || [], null, 2)}

Campanhas ativas:
${JSON.stringify(campaigns || [], null, 2)}

Recomende novas audiências priorizadas por impacto.`,
      }],
      maxTokens: 2048,
      temperature: 0.4,
    });

    let output: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      output = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: [], insights: response.content };
    } catch {
      output = { recommendations: [], insights: response.content };
    }

    return jsonResponse({
      success: true,
      ...output,
      tokensUsed: response.tokensUsed,
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
