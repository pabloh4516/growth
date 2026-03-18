import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Automation Engine (Cron Job)
 *
 * Evaluates all active automation rules, checks trigger conditions,
 * and executes corresponding actions (add tag, notify, send email, change stage).
 *
 * Endpoint: POST /functions/v1/automation-engine (cron only)
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
    // Get all active automation rules
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('status', 'active');

    if (rulesError) {
      console.error('Error fetching automation rules:', rulesError);
      return jsonResponse({ error: 'Failed to fetch automation rules' }, 500, corsHeaders);
    }

    if (!rules || rules.length === 0) {
      return jsonResponse({ message: 'No active automation rules', rulesProcessed: 0, actionsExecuted: 0 }, 200, corsHeaders);
    }

    let rulesProcessed = 0;
    let actionsExecuted = 0;
    const errors: string[] = [];

    for (const rule of rules) {
      try {
        const triggerType = rule.trigger_type || rule.trigger;
        const conditions = rule.conditions || {};
        const actions = rule.actions || [];
        const orgId = rule.organization_id;
        const lastExecutedAt = rule.last_executed_at || new Date(0).toISOString();

        console.log(`[automation-engine] Processing rule: ${rule.name} (${triggerType})`);

        // Find matching data based on trigger type
        let triggerData: any[] = [];

        switch (triggerType) {
          case 'sale_completed': {
            // Check for new paid sales since last execution
            const { data: newSales } = await supabase
              .from('utmify_sales')
              .select('*')
              .eq('organization_id', orgId)
              .eq('status', 'paid')
              .gt('received_at', lastExecutedAt)
              .order('received_at', { ascending: true });

            triggerData = newSales || [];

            // Apply conditions if defined
            if (conditions.min_revenue) {
              triggerData = triggerData.filter((s: any) => Number(s.revenue) >= conditions.min_revenue);
            }
            if (conditions.utm_source) {
              triggerData = triggerData.filter((s: any) => s.utm_source === conditions.utm_source);
            }
            if (conditions.product_name) {
              triggerData = triggerData.filter((s: any) =>
                s.product_name?.toLowerCase().includes(conditions.product_name.toLowerCase())
              );
            }
            break;
          }

          case 'campaign_metric_change': {
            // Check campaigns with significant metric changes
            const metric = conditions.metric || 'real_cpa';
            const threshold = conditions.threshold || 0;
            const direction = conditions.direction || 'above'; // 'above' or 'below'

            const { data: campaigns } = await supabase
              .from('campaigns')
              .select('*')
              .eq('organization_id', orgId)
              .eq('status', 'active');

            if (campaigns) {
              triggerData = campaigns.filter((c: any) => {
                const value = Number(c[metric] || 0);
                if (direction === 'above') return value > threshold;
                if (direction === 'below') return value < threshold;
                return false;
              });
            }
            break;
          }

          case 'contact_created': {
            // Check for new contacts since last execution
            const { data: newContacts } = await supabase
              .from('contacts')
              .select('*')
              .eq('organization_id', orgId)
              .gt('created_at', lastExecutedAt)
              .order('created_at', { ascending: true });

            triggerData = newContacts || [];

            // Apply conditions
            if (conditions.source) {
              triggerData = triggerData.filter((c: any) => c.source === conditions.source);
            }
            if (conditions.lifecycle_stage) {
              triggerData = triggerData.filter((c: any) => c.lifecycle_stage === conditions.lifecycle_stage);
            }
            break;
          }

          default:
            console.warn(`[automation-engine] Unknown trigger type: ${triggerType}`);
            continue;
        }

        // If no matching data, skip this rule
        if (triggerData.length === 0) {
          rulesProcessed++;
          continue;
        }

        console.log(`[automation-engine] Rule "${rule.name}" triggered with ${triggerData.length} items`);

        // Execute actions for each triggered item
        for (const item of triggerData) {
          for (const action of actions) {
            try {
              await executeAction(supabase, orgId, action, item, rule);
              actionsExecuted++;
            } catch (actionError: any) {
              console.error(`[automation-engine] Action failed:`, actionError.message);
              errors.push(`Rule "${rule.name}" action "${action.type}": ${actionError.message}`);
            }
          }
        }

        // Update rule: increment executions_count and set last_executed_at
        const currentCount = rule.executions_count || 0;
        await supabase
          .from('automation_rules')
          .update({
            executions_count: currentCount + triggerData.length,
            last_executed_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

        rulesProcessed++;

      } catch (ruleError: any) {
        console.error(`[automation-engine] Error processing rule ${rule.name}:`, ruleError.message);
        errors.push(`Rule "${rule.name}": ${ruleError.message}`);
        rulesProcessed++;
      }
    }

    return jsonResponse({
      success: true,
      rulesProcessed,
      actionsExecuted,
      totalRules: rules.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('[automation-engine] Fatal error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});

/**
 * Execute a single automation action
 */
async function executeAction(
  supabase: any,
  orgId: string,
  action: any,
  triggerItem: any,
  rule: any
): Promise<void> {
  const actionType = action.type;

  switch (actionType) {
    case 'add_tag': {
      // Add a tag to the contact associated with this trigger item
      const contactId = triggerItem.contact_id || triggerItem.id;
      const tag = action.tag || action.value;

      if (!contactId || !tag) {
        console.warn('[automation-engine] add_tag: missing contactId or tag');
        return;
      }

      // Get contact to find email if we have a sale
      let targetContactId = contactId;
      if (triggerItem.customer_email && !triggerItem.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, tags')
          .eq('organization_id', orgId)
          .eq('email', triggerItem.customer_email)
          .single();

        if (contact) {
          targetContactId = contact.id;
          const existingTags = contact.tags || [];
          if (!existingTags.includes(tag)) {
            await supabase
              .from('contacts')
              .update({ tags: [...existingTags, tag] })
              .eq('id', targetContactId);
          }
        }
      } else {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, tags')
          .eq('id', targetContactId)
          .single();

        if (contact) {
          const existingTags = contact.tags || [];
          if (!existingTags.includes(tag)) {
            await supabase
              .from('contacts')
              .update({ tags: [...existingTags, tag] })
              .eq('id', targetContactId);
          }
        }
      }
      break;
    }

    case 'notify_team': {
      // Create an alert/notification
      const message = action.message || `Automation "${rule.name}" triggered`;

      await supabase
        .from('alerts')
        .insert({
          organization_id: orgId,
          type: 'automation',
          severity: action.severity || 'info',
          title: `Automacao: ${rule.name}`,
          message,
          data: {
            rule_id: rule.id,
            trigger_item: {
              id: triggerItem.id,
              type: triggerItem.customer_email ? 'sale' : 'record',
            },
          },
          status: 'active',
        });
      break;
    }

    case 'send_email': {
      // Invoke the email-sender edge function
      const recipientEmail = action.email || triggerItem.customer_email || triggerItem.email;
      const subject = action.subject || `Notification from GrowthOS`;
      const body = action.body || action.template || `Automation "${rule.name}" was triggered.`;

      if (!recipientEmail) {
        console.warn('[automation-engine] send_email: no recipient email found');
        return;
      }

      const emailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-sender`;
      const emailResponse = await fetch(emailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject,
          html: body,
          organizationId: orgId,
        }),
      });

      if (!emailResponse.ok) {
        const errText = await emailResponse.text();
        throw new Error(`Email send failed: ${emailResponse.status} - ${errText}`);
      }
      break;
    }

    case 'change_stage': {
      // Update contact lifecycle_stage
      const newStage = action.stage || action.value;
      const contactId = triggerItem.contact_id || triggerItem.id;

      if (!newStage) {
        console.warn('[automation-engine] change_stage: missing stage');
        return;
      }

      // Find contact by email if from a sale
      if (triggerItem.customer_email) {
        await supabase
          .from('contacts')
          .update({
            lifecycle_stage: newStage,
            last_activity_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)
          .eq('email', triggerItem.customer_email);
      } else if (contactId) {
        await supabase
          .from('contacts')
          .update({
            lifecycle_stage: newStage,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', contactId)
          .eq('organization_id', orgId);
      }
      break;
    }

    default:
      console.warn(`[automation-engine] Unknown action type: ${actionType}`);
  }
}
