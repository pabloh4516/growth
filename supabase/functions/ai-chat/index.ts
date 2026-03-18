import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Chat
 * Conversational interface with the AI Traffic Manager
 * Detects action commands and creates ai_decisions for approval
 */

// Action keywords that indicate the user wants to execute something
const ACTION_PATTERNS = [
  { pattern: /\b(pause|pausar|desativ|deslig|parar)\b/i, type: 'pause_campaign' },
  { pattern: /\b(ativ|ligar|reativ|habilit|iniciar)\b/i, type: 'activate_campaign' },
  { pattern: /\b(aument|escal|subir|dobr|mais budget|mais orçamento)\b/i, type: 'increase_budget' },
  { pattern: /\b(reduz|diminu|corta|baixa|menos budget|menos orçamento)\b/i, type: 'decrease_budget' },
  { pattern: /\b(negativ|bloque|exclu.*palavra)\b/i, type: 'add_negative_keyword' },
];

function detectActionIntent(message: string): string | null {
  for (const { pattern, type } of ACTION_PATTERNS) {
    if (pattern.test(message)) return type;
  }
  return null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  try {
    let userId: string | null = null;
    try {
      const { user } = await validateAuth(req);
      userId = user?.id || null;
    } catch {
      // Allow unauthenticated if organizationId provided
    }

    const body = await req.json();
    const { organizationId, message, conversationId } = body;

    if (!organizationId || !message) {
      return jsonResponse({ error: 'Missing organizationId or message' }, 400, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const convId = conversationId || crypto.randomUUID();

    // Save user message
    await supabase.from('ai_chat_messages').insert({
      organization_id: organizationId,
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    // Load last 10 messages for context
    const { data: history } = await supabase
      .from('ai_chat_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(10);

    // Load current data for context
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status, cost, impressions, clicks, google_conversions, real_sales_count, real_revenue, real_roas, real_cpa, daily_budget, objective')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'paused'])
      .order('cost', { ascending: false })
      .limit(20);

    const { data: recentSales } = await supabase
      .from('utmify_sales')
      .select('status, revenue, product_name, utm_campaign, matched_campaign_id')
      .eq('organization_id', organizationId)
      .eq('status', 'paid')
      .order('sale_date', { ascending: false })
      .limit(20);

    const { data: recentDecisions } = await supabase
      .from('ai_decisions')
      .select('decision_type, reasoning, status, created_at, campaign_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Detect if user wants to execute an action
    const actionIntent = detectActionIntent(message);
    const isActionRequest = actionIntent !== null;

    // Build system prompt with live data
    const systemPrompt = `Você é o gestor de tráfego IA do GrowthOS. Responda em português brasileiro de forma direta e com dados reais.

## DADOS ATUAIS DA OPERAÇÃO

### Campanhas (${(campaigns || []).length} total)
${JSON.stringify((campaigns || []).map(c => ({
  id: c.id,
  nome: c.name,
  tipo: c.objective,
  status: c.status,
  custo: c.cost,
  vendas_reais: c.real_sales_count,
  receita_real: c.real_revenue,
  roas_real: c.real_roas,
  budget_dia: c.daily_budget,
})), null, 2)}

### Últimas vendas pagas (${(recentSales || []).length})
${JSON.stringify((recentSales || []).slice(0, 10), null, 2)}

### Últimas decisões da IA
${JSON.stringify(recentDecisions || [], null, 2)}

## REGRAS
- SEMPRE use dados da Utmify para falar de vendas reais e ROAS real
- Conversões do Google Ads NÃO são vendas confirmadas
- Seja direto, use números reais, sugira ações concretas
- Responda em português brasileiro, máximo 3 parágrafos
- ${isActionRequest ? `O USUÁRIO QUER EXECUTAR UMA AÇÃO (${actionIntent}). Analise quais campanhas se aplicam e liste-as.

IMPORTANTE: Ao final da resposta, adicione um bloco JSON com as ações a criar:
\`\`\`actions
[
  {
    "campaign_id": "uuid",
    "campaign_name": "nome",
    "decision_type": "${actionIntent}",
    "reasoning": "motivo em português",
    "action_details": {}
  }
]
\`\`\`
` : 'Se o usuário pedir para executar uma ação, explique o que faria e peça confirmação.'}`;

    // Build messages array
    const messages = (history || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Call Claude
    const response = await callClaude({
      system: systemPrompt,
      messages,
      maxTokens: 2048,
      temperature: 0.4,
    });

    let aiContent = response.content;
    let actionsCreated = 0;

    // Parse action blocks from response
    const actionsMatch = aiContent.match(/```actions\s*\n([\s\S]*?)```/);
    if (actionsMatch) {
      try {
        const actions = JSON.parse(actionsMatch[1]);
        for (const action of actions) {
          if (!action.campaign_id || !action.decision_type) continue;

          await supabase.from('ai_decisions').insert({
            organization_id: organizationId,
            campaign_id: action.campaign_id,
            decision_type: action.decision_type,
            reasoning: action.reasoning || message,
            description: action.reasoning || `${action.decision_type} - ${action.campaign_name}`,
            action_type: action.decision_type,
            action_details: action.action_details || {},
            status: 'pending',
            confidence: 0.8,
            priority: 5,
            source: 'chat',
          });
          actionsCreated++;
        }
      } catch (e) {
        console.error('Failed to parse actions:', e);
      }

      // Remove actions block from visible message
      aiContent = aiContent.replace(/```actions\s*\n[\s\S]*?```/, '').trim();

      if (actionsCreated > 0) {
        aiContent += `\n\n✅ ${actionsCreated} ${actionsCreated === 1 ? 'ação criada' : 'ações criadas'} e aguardando sua aprovação no painel de Insights.`;
      }
    }

    // Save assistant response
    await supabase.from('ai_chat_messages').insert({
      organization_id: organizationId,
      conversation_id: convId,
      role: 'assistant',
      content: aiContent,
      tokens_used: response.tokensUsed,
    });

    return jsonResponse({
      conversationId: convId,
      message: aiContent,
      tokensUsed: response.tokensUsed,
      actionsCreated,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('AI Chat error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
