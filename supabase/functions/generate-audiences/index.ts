import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getSupabaseClient } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    const { user } = await validateAuth(req);
    const { organizationId, sourceType } = await req.json();

    if (!organizationId) {
      return jsonResponse({ error: 'Missing organizationId' }, 400, corsHeaders);
    }

    const supabase = getSupabaseClient();

    const { data: contacts } = await supabase
      .from('contacts')
      .select('lifecycle_stage, source, lead_score, predicted_ltv')
      .eq('organization_id', organizationId)
      .limit(200);

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('name, platform, real_roas, real_sales_count')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    const stageDistribution = (contacts || []).reduce((acc: Record<string, number>, c: any) => {
      acc[c.lifecycle_stage || 'unknown'] = (acc[c.lifecycle_stage || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    const sourceDistribution = (contacts || []).reduce((acc: Record<string, number>, c: any) => {
      acc[c.source || 'unknown'] = (acc[c.source || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    const systemPrompt = `Você é um especialista em segmentação de públicos-alvo para marketing digital.
Analise os dados e gere 4-6 sugestões de audiências otimizadas.
Responda SOMENTE em JSON:
{
  "audiences": [
    {
      "name": "nome descritivo",
      "type": "custom|lookalike|remarketing",
      "source_type": "${sourceType || 'crm_list'}",
      "description": "por que este público é relevante"
    }
  ]
}`;

    const message = `Contatos: ${(contacts || []).length}
Estágios: ${JSON.stringify(stageDistribution)}
Fontes: ${JSON.stringify(sourceDistribution)}
Campanhas ativas: ${JSON.stringify((campaigns || []).map(c => ({ name: c.name, roas: c.real_roas })))}
Tipo solicitado: ${sourceType || 'top_ltv'}`;

    const result = await callClaude({
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
      maxTokens: 2048,
      temperature: 0.5,
    });

    let audiences = [];
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { audiences: [] };
      audiences = parsed.audiences || [];
    } catch {
      audiences = [];
    }

    const saved = [];
    for (const aud of audiences) {
      const { data } = await supabase.from('audiences').insert({
        organization_id: organizationId,
        name: aud.name,
        type: aud.type || 'custom',
        source_type: aud.source_type || sourceType || 'crm_list',
        status: 'ready',
        contact_count: 0,
      }).select().single();
      if (data) saved.push(data);
    }

    return jsonResponse({ success: true, audiences: saved }, 200, corsHeaders);
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
