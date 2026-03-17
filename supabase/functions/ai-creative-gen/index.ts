import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Creative Generator
 * Generates ad copies, headlines, scripts for multiple platforms
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    const { user } = await validateAuth(req);
    const body = await req.json();
    const { organizationId, platform, niche, objective, tone, reference, extraInfo } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get top performing creatives for context
    const { data: topCreatives } = await supabase
      .from('creative_performance')
      .select('creative_library(name, type, platform), ctr, conversions, roas')
      .eq('creative_library.organization_id', organizationId)
      .order('ctr', { ascending: false })
      .limit(5);

    const systemPrompt = `Você é um copywriter expert em anúncios digitais para o mercado brasileiro.
Gere copies criativas, persuasivas e com alta taxa de conversão.
SEMPRE em português brasileiro.
Use gatilhos mentais: urgência, escassez, prova social, autoridade, reciprocidade.
Adapte o tom conforme solicitado.`;

    const platformInstructions: Record<string, string> = {
      google_ads: `Gere para Google Ads RSA (Responsive Search Ads):
- 15 títulos (máx 30 caracteres cada)
- 4 descrições (máx 90 caracteres cada)
- 4 sitelink extensions sugeridos
- 2 callout extensions`,
      meta_ads: `Gere para Meta Ads (Facebook/Instagram):
- 3 variações de copy principal (texto do post)
- 3 headlines (título do anúncio)
- 3 descrições curtas
- 3 sugestões de CTA`,
      tiktok_ads: `Gere para TikTok Ads:
- 3 hooks de abertura (primeiros 3 segundos)
- 3 scripts curtos de vídeo (15-30 segundos)
- 3 ideias de criativo/tendência`,
      youtube_ads: `Gere para YouTube Ads:
- 3 roteiros de vídeo curto (15-30 segundos)
- 3 hooks de abertura (primeiros 5 segundos)
- 3 CTAs de fechamento`,
    };

    const userMessage = `Plataforma: ${platform}
Nicho: ${niche}
Objetivo: ${objective}
Tom de voz: ${tone || 'profissional e persuasivo'}
${reference ? `Referência/criativo vencedor: ${reference}` : ''}
${extraInfo ? `Info extra: ${extraInfo}` : ''}
${topCreatives?.length ? `\nCreativos com melhor performance na conta:\n${JSON.stringify(topCreatives, null, 2)}` : ''}

${platformInstructions[platform] || platformInstructions.google_ads}

Retorne em JSON com a estrutura:
{
  "platform": "${platform}",
  "creatives": [
    { "type": "headline|description|copy|hook|script|sitelink|callout|cta", "content": "...", "variant": 1 }
  ]
}`;

    const response = await callClaude({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 3000,
      temperature: 0.7,
    });

    // Parse and save
    let output: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      output = jsonMatch ? JSON.parse(jsonMatch[0]) : { creatives: [] };
    } catch {
      output = { raw: response.content, creatives: [] };
    }

    // Save to ai_creative_suggestions
    for (const creative of (output.creatives || [])) {
      await supabase.from('ai_creative_suggestions').insert({
        organization_id: organizationId,
        platform,
        type: creative.type,
        content: creative.content,
        status: 'generated',
      });
    }

    return jsonResponse({
      success: true,
      output,
      tokensUsed: response.tokensUsed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('AI Creative Gen error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
