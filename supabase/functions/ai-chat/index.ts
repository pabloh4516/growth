import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth } from '../_shared/auth.ts';
import { callClaude } from '../_shared/claude-client.ts';

/**
 * GrowthOS — AI Chat
 * Conversational interface with the AI Traffic Manager
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  try {
    const { user } = await validateAuth(req);
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
      .select('name, status, cost, impressions, clicks, google_conversions, real_sales_count, real_revenue, real_roas, real_cpa, daily_budget')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'paused'])
      .order('cost', { ascending: false })
      .limit(10);

    const { data: recentSales } = await supabase
      .from('utmify_sales')
      .select('status, revenue, product_name, utm_campaign')
      .eq('organization_id', organizationId)
      .eq('status', 'paid')
      .order('sale_date', { ascending: false })
      .limit(20);

    const { data: recentDecisions } = await supabase
      .from('ai_decisions')
      .select('decision_type, reasoning, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Build system prompt with live data
    const systemPrompt = `Você é o gestor de tráfego IA do GrowthOS. Responda em português brasileiro de forma direta e com dados reais.

## DADOS ATUAIS DA OPERAÇÃO

### Campanhas ativas
${JSON.stringify(campaigns || [], null, 2)}

### Últimas vendas reais (Utmify)
${JSON.stringify(recentSales || [], null, 2)}

### Últimas decisões da IA
${JSON.stringify(recentDecisions || [], null, 2)}

## REGRAS
- SEMPRE use dados da Utmify para falar de vendas reais e ROAS real
- Conversões do Google Ads NÃO são vendas confirmadas
- Seja direto, use números reais, sugira ações concretas
- Responda em português brasileiro
- Se o usuário pedir para executar uma ação, confirme que vai fazer e explique o que vai mudar`;

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
      temperature: 0.5,
    });

    // Save assistant response
    await supabase.from('ai_chat_messages').insert({
      organization_id: organizationId,
      conversation_id: convId,
      role: 'assistant',
      content: response.content,
      tokens_used: response.tokensUsed,
    });

    return jsonResponse({
      conversationId: convId,
      message: response.content,
      tokensUsed: response.tokensUsed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('AI Chat error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
