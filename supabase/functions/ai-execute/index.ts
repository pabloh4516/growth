import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';
import { getValidAccessToken, updateCampaignStatus, updateCampaignBudget, addNegativeKeyword } from '../_shared/google-ads-api.ts';

/**
 * GrowthOS — AI Execute
 * Executes AI decisions on Google Ads (the hands of the brain)
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const isCron = validateCronSecret(req);
    if (!isCron) {
      await validateAuth(req);
    }

    const body = await req.json().catch(() => ({}));

    // Execute specific decision or all pending approved decisions
    if (body.decisionId) {
      const result = await executeDecision(supabase, body.decisionId);
      return jsonResponse(result, 200, corsHeaders);
    }

    // Execute all approved decisions
    const { data: pendingDecisions } = await supabase
      .from('ai_decisions')
      .select('id')
      .eq('status', 'approved')
      .order('priority', { ascending: true })
      .limit(20);

    const results = [];
    for (const decision of (pendingDecisions || [])) {
      const result = await executeDecision(supabase, decision.id);
      results.push(result);
    }

    return jsonResponse({ executed: results.length, results }, 200, corsHeaders);

  } catch (error) {
    console.error('AI Execute error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});

// Guardrails configuration
const GUARDRAILS = {
  maxBudgetChangePct: 30,       // Max 30% budget change per action
  maxActionsPerOrgPerDay: 20,   // Max AI-initiated actions per org per day
  highRiskBudgetThreshold: 500, // Budget changes > R$500 flagged for review
  minConfidence: 0.3,           // Minimum confidence to execute
};

async function checkGuardrails(supabase: any, decision: any): Promise<string | null> {
  // 1. Check confidence threshold
  if (decision.confidence && decision.confidence < GUARDRAILS.minConfidence) {
    return `Confidence too low (${decision.confidence}). Minimum: ${GUARDRAILS.minConfidence}`;
  }

  // 2. Check daily action limit per org
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('ai_decisions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', decision.organization_id)
    .eq('status', 'executed')
    .gte('executed_at', todayStart.toISOString());

  if ((count || 0) >= GUARDRAILS.maxActionsPerOrgPerDay) {
    return `Daily action limit reached (${GUARDRAILS.maxActionsPerOrgPerDay}). Wait until tomorrow.`;
  }

  // 3. Check budget change guardrails
  if (decision.decision_type === 'increase_budget' || decision.decision_type === 'decrease_budget') {
    const action = decision.action_details || {};
    const newBudget = action.newBudget || action.new_budget || 0;
    const currentBudget = decision.campaigns?.daily_budget || 0;

    if (currentBudget > 0) {
      const changePct = Math.abs((newBudget - currentBudget) / currentBudget) * 100;
      if (changePct > GUARDRAILS.maxBudgetChangePct) {
        return `Budget change too large (${changePct.toFixed(0)}%). Max: ${GUARDRAILS.maxBudgetChangePct}%`;
      }
    }

    if (Math.abs(newBudget - currentBudget) > GUARDRAILS.highRiskBudgetThreshold) {
      return `High-risk budget change (R$${Math.abs(newBudget - currentBudget).toFixed(0)}). Requires manual approval.`;
    }
  }

  return null; // No guardrail violations
}

async function executeDecision(supabase: any, decisionId: string) {
  const { data: decision } = await supabase
    .from('ai_decisions')
    .select('*, campaigns(ad_account_id, external_id, daily_budget, campaign_budget_resource)')
    .eq('id', decisionId)
    .single();

  if (!decision) {
    return { decisionId, error: 'Decision not found' };
  }

  if (decision.status !== 'approved' && decision.status !== 'pending') {
    return { decisionId, error: `Decision status is ${decision.status}, expected approved` };
  }

  try {
    // Check guardrails before executing
    const guardrailViolation = await checkGuardrails(supabase, decision);
    if (guardrailViolation) {
      await supabase.from('ai_decisions').update({
        status: 'blocked',
        error_message: `Guardrail: ${guardrailViolation}`,
      }).eq('id', decisionId);
      return { decisionId, blocked: true, reason: guardrailViolation };
    }

    const campaign = decision.campaigns;
    if (!campaign) {
      throw new Error('No campaign associated with this decision');
    }

    // Get valid token
    const tokenData = await getValidAccessToken(supabase, campaign.ad_account_id);
    if (!tokenData) {
      throw new Error('Could not get valid access token');
    }

    const { accessToken, account, developerToken } = tokenData;
    const customerId = account.account_id;
    let success = false;
    let rollbackAction: any = null;

    switch (decision.decision_type) {
      case 'pause_campaign': {
        success = await updateCampaignStatus(accessToken, customerId, campaign.external_id, 'PAUSED', developerToken);
        rollbackAction = { type: 'activate_campaign', campaignId: campaign.external_id };
        if (success) {
          await supabase.from('campaigns').update({ status: 'paused' }).eq('id', decision.campaign_id);
        }
        break;
      }

      case 'activate_campaign': {
        success = await updateCampaignStatus(accessToken, customerId, campaign.external_id, 'ENABLED', developerToken);
        rollbackAction = { type: 'pause_campaign', campaignId: campaign.external_id };
        if (success) {
          await supabase.from('campaigns').update({ status: 'active' }).eq('id', decision.campaign_id);
        }
        break;
      }

      case 'increase_budget':
      case 'decrease_budget': {
        const action = decision.action_details;
        const newBudget = action.newBudget || action.new_budget;
        if (!newBudget || !campaign.campaign_budget_resource) {
          throw new Error('Missing budget details');
        }

        const amountMicros = Math.round(newBudget * 1_000_000);
        success = await updateCampaignBudget(
          accessToken, customerId, campaign.campaign_budget_resource, amountMicros, developerToken
        );
        rollbackAction = {
          type: decision.decision_type === 'increase_budget' ? 'decrease_budget' : 'increase_budget',
          oldBudget: campaign.daily_budget,
        };
        if (success) {
          await supabase.from('campaigns').update({
            daily_budget: newBudget,
            budget_micros: amountMicros,
          }).eq('id', decision.campaign_id);
        }
        break;
      }

      case 'add_negative_keyword': {
        const action = decision.action_details;
        success = await addNegativeKeyword(
          accessToken, customerId, campaign.external_id,
          action.keyword, action.matchType || 'BROAD', developerToken
        );
        break;
      }

      default:
        throw new Error(`Unsupported decision type: ${decision.decision_type}`);
    }

    // Update decision status
    await supabase.from('ai_decisions').update({
      status: success ? 'executed' : 'failed',
      executed_at: new Date().toISOString(),
      execution_result: { success },
      rollback_action: rollbackAction,
      error_message: success ? null : 'Execution failed',
    }).eq('id', decisionId);

    // Log activity
    await supabase.from('activity_log').insert({
      organization_id: decision.organization_id,
      action: `ai_${decision.decision_type}`,
      entity_type: 'campaign',
      entity_id: decision.campaign_id,
      details: {
        decisionId,
        reasoning: decision.reasoning,
        success,
      },
    });

    return { decisionId, success, type: decision.decision_type };

  } catch (error) {
    await supabase.from('ai_decisions').update({
      status: 'failed',
      error_message: error.message,
      executed_at: new Date().toISOString(),
    }).eq('id', decisionId);

    return { decisionId, error: error.message };
  }
}
