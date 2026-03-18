import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — Competitor Monitor (Cron Job)
 *
 * AI-powered competitor analysis. Fetches competitor homepages,
 * uses Claude to analyze their positioning and ad strategy,
 * and saves results to competitor_ads table.
 *
 * Endpoint: POST /functions/v1/competitor-monitor (cron only)
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
    // Get all competitors from all orgs that have a domain
    const { data: competitors, error: competitorsError } = await supabase
      .from('competitors')
      .select('id, organization_id, name, domain, website_url, last_analyzed_at')
      .not('domain', 'is', null)
      .neq('domain', '');

    if (competitorsError) {
      console.error('Error fetching competitors:', competitorsError);
      return jsonResponse({ error: 'Failed to fetch competitors' }, 500, corsHeaders);
    }

    if (!competitors || competitors.length === 0) {
      return jsonResponse({ message: 'No competitors with domains found', competitorsAnalyzed: 0 }, 200, corsHeaders);
    }

    let competitorsAnalyzed = 0;
    const errors: string[] = [];

    for (const competitor of competitors) {
      try {
        const url = competitor.website_url || `https://${competitor.domain}`;
        console.log(`[competitor-monitor] Analyzing: ${competitor.name} (${url})`);

        // Fetch homepage HTML with timeout
        let pageContent = '';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; GrowthOS/1.0)',
              'Accept': 'text/html',
            },
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const html = await response.text();
            // Extract meaningful text content (strip tags, limit size)
            pageContent = extractTextFromHTML(html).slice(0, 5000);
          } else {
            pageContent = `[Could not fetch: HTTP ${response.status}]`;
          }
        } catch (fetchError: any) {
          console.warn(`[competitor-monitor] Fetch failed for ${url}:`, fetchError.message);
          pageContent = `[Fetch error: ${fetchError.message}]`;
        }

        // Use Claude to analyze the competitor
        const claudeResponse = await callClaude({
          system: `Voce e um analista de marketing digital especializado no mercado brasileiro.
Analise o conteudo de um site concorrente e retorne um JSON com sua analise.

RETORNE APENAS JSON VALIDO, sem markdown, sem code blocks. Formato:
{
  "main_product": "O que vendem / servico principal",
  "value_proposition": "Proposta de valor principal",
  "target_audience": "Publico-alvo estimado",
  "ad_strategy_estimate": "Estrategia de anuncios estimada (Google Ads, Meta, etc)",
  "pricing_model": "Modelo de precificacao se visivel",
  "strengths": ["Ponto forte 1", "Ponto forte 2"],
  "weaknesses": ["Fraqueza 1", "Fraqueza 2"],
  "summary": "Resumo executivo em 2-3 frases"
}`,
          messages: [{
            role: 'user',
            content: `Analise este concorrente:
Nome: ${competitor.name}
Dominio: ${competitor.domain}

Conteudo da homepage:
${pageContent}`,
          }],
          maxTokens: 1024,
          temperature: 0.3,
        });

        // Parse Claude's response
        let analysis: any;
        try {
          const jsonMatch = claudeResponse.content.match(/\{[\s\S]*\}/);
          analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          analysis = null;
        }

        if (!analysis) {
          errors.push(`${competitor.name}: Failed to parse AI response`);
          continue;
        }

        // Save analysis to competitor_ads table
        const headline = analysis.summary || `${analysis.main_product} - ${analysis.value_proposition}`;
        const description = JSON.stringify({
          main_product: analysis.main_product,
          value_proposition: analysis.value_proposition,
          target_audience: analysis.target_audience,
          ad_strategy_estimate: analysis.ad_strategy_estimate,
          pricing_model: analysis.pricing_model,
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
        });

        await supabase
          .from('competitor_ads')
          .insert({
            competitor_id: competitor.id,
            organization_id: competitor.organization_id,
            ad_type: 'analysis',
            headline: headline.slice(0, 500),
            description,
            analyzed_at: new Date().toISOString(),
          });

        // Update last_analyzed_at on competitor
        await supabase
          .from('competitors')
          .update({ last_analyzed_at: new Date().toISOString() })
          .eq('id', competitor.id);

        competitorsAnalyzed++;
        console.log(`[competitor-monitor] Analyzed: ${competitor.name}`);

      } catch (compError: any) {
        console.error(`[competitor-monitor] Error analyzing ${competitor.name}:`, compError.message);
        errors.push(`${competitor.name}: ${compError.message}`);
      }
    }

    return jsonResponse({
      success: true,
      competitorsAnalyzed,
      totalCompetitors: competitors.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('[competitor-monitor] Fatal error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});

/**
 * Extract readable text from HTML, stripping tags and excess whitespace.
 */
function extractTextFromHTML(html: string): string {
  // Remove script and style elements entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
