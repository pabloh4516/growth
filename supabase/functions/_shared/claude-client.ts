/**
 * GrowthOS — Claude AI Client
 * Wrapper around Anthropic API for all AI operations
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

interface ClaudeOptions {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

interface ClaudeResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

export async function callClaude(options: ClaudeOptions): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const model = options.model || DEFAULT_MODEL;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.3,
      system: options.system,
      messages: options.messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    content: data.content?.[0]?.text || '',
    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    model,
  };
}

/**
 * Build the system prompt for the AI Traffic Manager
 */
export function buildTrafficManagerPrompt(context: {
  targetRoas: number;
  maxCpa: number | null;
  maxBudgetChangePct: number;
  minDataDays: number;
  dailyBudgetLimit: number | null;
}): string {
  return `Você é um gestor de tráfego expert em Google Ads para o mercado brasileiro.
Você tem autonomia TOTAL para tomar decisões e executar ações.

## REGRA CRÍTICA
Google Ads "conversões" NÃO são vendas reais. SOMENTE dados da Utmify representam vendas confirmadas (pagas).
Calcule ROAS SEMPRE usando: ROAS_real = receita_utmify / custo_google_ads
Se Google diz que uma campanha converte mas Utmify mostra 0 vendas pagas, essa campanha está PERDENDO dinheiro.

## CONFIGURAÇÕES
- Target ROAS: ${context.targetRoas}x
${context.maxCpa ? `- CPA máximo: R$${context.maxCpa}` : ''}
- Máximo de alteração de budget por ação: ${context.maxBudgetChangePct}%
- Mínimo de dias de dados para decisões: ${context.minDataDays}
${context.dailyBudgetLimit ? `- Limite total diário: R$${context.dailyBudgetLimit}` : ''}

## FORMATO DE RESPOSTA
Retorne SEMPRE um JSON válido com a seguinte estrutura:
{
  "summary": "Resumo executivo em português (2-3 frases)",
  "decisions": [
    {
      "type": "pause_campaign|activate_campaign|increase_budget|decrease_budget|add_negative_keyword|adjust_bid|scale_campaign|reallocate_budget",
      "campaignId": "uuid da campanha",
      "campaignName": "nome da campanha",
      "reasoning": "Explicação detalhada em português do porquê desta decisão",
      "action": { ...detalhes específicos da ação... },
      "confidence": 0.0 a 1.0,
      "priority": 1 a 10 (1=urgente)
    }
  ],
  "insights": [
    {
      "type": "funnel_bottleneck|campaign_alert|creative_winner|budget_suggestion|keyword_opportunity",
      "severity": "info|warning|critical",
      "title": "Título curto",
      "description": "Descrição detalhada com dados",
      "suggestedAction": "O que fazer"
    }
  ]
}

## REGRAS DE DECISÃO
- NUNCA aumente budget mais de ${context.maxBudgetChangePct}% de uma vez
- Mínimo ${context.minDataDays} dias de dados antes de decisões importantes
- Priorize campanhas com ROAS real (Utmify) alto para escalar
- Pause campanhas com ROAS real < 0.5x por 3+ dias
- Identifique gap entre conversões Google e vendas Utmify
- Sugira palavras negativas para termos que gastam sem converter
- Considere horários e dispositivos ao sugerir ajustes de bid`;
}
