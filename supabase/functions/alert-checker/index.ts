import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Alert Checker (Cron Job)
 * Checks all alert rules and triggers alerts when thresholds are exceeded
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
    // Get all enabled alert rules
    const { data: rules } = await supabase
      .from('alert_rules')
      .select('*, organizations(name)')
      .eq('enabled', true);

    if (!rules || rules.length === 0) {
      return jsonResponse({ message: 'No alert rules' }, 200, corsHeaders);
    }

    let alertsTriggered = 0;

    for (const rule of rules) {
      try {
        let currentValue: number | null = null;

        // Get current metric value based on rule.metric
        switch (rule.metric) {
          case 'cpa': {
            const { data } = await supabase
              .from('campaigns')
              .select('real_cpa')
              .eq('organization_id', rule.organization_id)
              .eq('status', 'active')
              .order('real_cpa', { ascending: false })
              .limit(1)
              .single();
            currentValue = data?.real_cpa || 0;
            break;
          }
          case 'roas': {
            const { data } = await supabase
              .from('campaigns')
              .select('real_roas')
              .eq('organization_id', rule.organization_id)
              .eq('status', 'active')
              .order('real_roas', { ascending: true })
              .limit(1)
              .single();
            currentValue = data?.real_roas || 0;
            break;
          }
          case 'ctr': {
            const { data } = await supabase
              .from('campaigns')
              .select('ctr')
              .eq('organization_id', rule.organization_id)
              .eq('status', 'active')
              .order('ctr', { ascending: true })
              .limit(1)
              .single();
            currentValue = data?.ctr || 0;
            break;
          }
          case 'budget_spent_pct': {
            const { data } = await supabase
              .from('budgets')
              .select('amount, spent_amount')
              .eq('organization_id', rule.organization_id);
            if (data && data.length > 0) {
              const worst = data.reduce((max, b) => {
                const pct = b.amount > 0 ? (b.spent_amount / b.amount) * 100 : 0;
                return pct > max ? pct : max;
              }, 0);
              currentValue = worst;
            }
            break;
          }
          default:
            continue;
        }

        if (currentValue === null) continue;

        // Check threshold
        let triggered = false;
        switch (rule.operator) {
          case '>': triggered = currentValue > rule.threshold; break;
          case '<': triggered = currentValue < rule.threshold; break;
          case '>=': triggered = currentValue >= rule.threshold; break;
          case '<=': triggered = currentValue <= rule.threshold; break;
          case '=': triggered = currentValue === rule.threshold; break;
        }

        if (triggered) {
          // Check if similar alert already active (avoid spam)
          const { data: existingAlert } = await supabase
            .from('alerts')
            .select('id')
            .eq('organization_id', rule.organization_id)
            .eq('type', rule.metric)
            .eq('status', 'active')
            .gte('triggered_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
            .limit(1);

          if (!existingAlert || existingAlert.length === 0) {
            const alertTitle = `Alerta: ${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}`;
            const alertMessage = `Valor atual: ${currentValue.toFixed(2)}. Threshold: ${rule.operator} ${rule.threshold}`;

            await supabase.from('alerts').insert({
              organization_id: rule.organization_id,
              type: rule.metric,
              severity: rule.severity,
              title: alertTitle,
              message: alertMessage,
              threshold_value: rule.threshold,
              current_value: currentValue,
              channel: (rule.channels || ['dashboard'])[0],
              status: 'active',
              triggered_at: new Date().toISOString(),
            });
            alertsTriggered++;

            // Send email notification for high/critical alerts
            const channels = rule.channels || ['dashboard'];
            if ((rule.severity === 'high' || rule.severity === 'critical') && channels.includes('email')) {
              try {
                // Get org admin emails
                const { data: members } = await supabase
                  .from('organization_members')
                  .select('users(email, name)')
                  .eq('organization_id', rule.organization_id)
                  .in('role', ['owner', 'admin']);

                const resendKey = Deno.env.get('RESEND_API_KEY');
                if (resendKey && members) {
                  for (const member of members) {
                    const user = (member as any).users;
                    if (!user?.email) continue;

                    await fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${resendKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        from: 'GrowthOS Alerts <alerts@growthos.com.br>',
                        to: user.email,
                        subject: `[${rule.severity.toUpperCase()}] ${alertTitle}`,
                        html: `
                          <div style="font-family: sans-serif; padding: 20px; background: #0A0A0F; color: #F0F0F5;">
                            <h2 style="color: ${rule.severity === 'critical' ? '#FF5252' : '#FFB300'};">
                              ${alertTitle}
                            </h2>
                            <p>${alertMessage}</p>
                            <p style="color: #9898B0; font-size: 14px;">
                              Organização: ${rule.organizations?.name || 'N/A'}<br/>
                              Métrica: ${rule.metric.toUpperCase()}<br/>
                              Severidade: ${rule.severity}
                            </p>
                            <a href="${Deno.env.get('APP_ORIGIN') || 'http://localhost:3000'}/alerts"
                               style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #6C5CE7; color: white; text-decoration: none; border-radius: 6px;">
                              Ver no Dashboard
                            </a>
                          </div>
                        `,
                      }),
                    });
                  }
                }
              } catch (emailErr) {
                console.error('Error sending alert email:', emailErr);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error checking rule ${rule.id}:`, e);
      }
    }

    return jsonResponse({
      success: true,
      rulesChecked: rules.length,
      alertsTriggered,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Alert checker error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
