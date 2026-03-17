import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Budget Optimizer
 * Analyzes all campaigns and suggests optimal budget allocation
 * with 3 scenarios: conservative, moderate, aggressive
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    const { user } = await validateAuth(req);
    const body = await req.json();
    const { organizationId, totalBudget } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all active campaigns with metrics
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status, daily_budget, cost, impressions, clicks, google_conversions, real_sales_count, real_revenue, real_roas, real_cpa, health_score')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'paused'])
      .order('real_roas', { ascending: false });

    // Get AI settings for targets
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('target_roas, max_cpa, daily_budget_limit')
      .eq('organization_id', organizationId)
      .single();

    const totalCurrentSpend = (campaigns || []).reduce((sum: number, c: any) => sum + Number(c.daily_budget || 0), 0);
    const budget = totalBudget || totalCurrentSpend;

    const response = await callClaude({
      system: `Você é um especialista em alocação de budget para Google Ads no Brasil.
Analise as campanhas e sugira a distribuição ótima de budget.

REGRA: Use ROAS REAL (Utmify) para decisões, não ROAS do Google.

Retorne JSON:
{
  "currentAllocation": {
    "totalDaily": number,
    "campaigns": [{ "name": "...", "currentBudget": number, "roas": number }]
  },
  "scenarios": {
    "conservative": {
      "description": "Descrição da estratégia conservadora",
      "campaigns": [{ "name": "...", "suggestedBudget": number, "change": "+20%", "expectedROAS": number }],
      "expectedResults": { "totalSpend": number, "expectedRevenue": number, "expectedROAS": number }
    },
    "moderate": { ...same structure... },
    "aggressive": { ...same structure... }
  },
  "recommendation": "Qual cenário recomenda e por quê (2-3 frases)",
  "warnings": ["Lista de alertas se houver"]
}`,
      messages: [{
        role: 'user',
        content: `Budget total disponível: R$${budget}/dia
Target ROAS: ${settings?.target_roas || 3}x
CPA máximo: R$${settings?.max_cpa || 'não definido'}

Campanhas:
${JSON.stringify(campaigns || [], null, 2)}

Sugira 3 cenários de alocação de budget.`,
      }],
      maxTokens: 3000,
      temperature: 0.3,
    });

    let output: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      output = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: response.content };
    } catch {
      output = { recommendation: response.content };
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
