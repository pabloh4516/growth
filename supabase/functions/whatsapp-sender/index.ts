import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getUserOrganization } from '../_shared/auth.ts';

/**
 * GrowthOS — WhatsApp Sender (Evolution API)
 *
 * Sends WhatsApp messages using templates stored in whatsapp_templates.
 * Replaces {{variable}} placeholders with provided values.
 * Sends via Evolution API and logs each message in whatsapp_message_logs.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Authenticate user
    const { user } = await validateAuth(req);
    const { organizationId } = await getUserOrganization(user.id);

    const body = await req.json();
    const { templateId, contacts } = body;

    if (!templateId || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return jsonResponse(
        { error: 'Missing required fields: templateId, contacts (array)' },
        400,
        corsHeaders
      );
    }

    // Load template
    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .single();

    if (templateError || !template) {
      return jsonResponse({ error: 'Template not found' }, 404, corsHeaders);
    }

    // Get Evolution API config
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    // Get WhatsApp instance name from integrations
    let instanceName: string | null = null;
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('organization_id', organizationId)
      .eq('type', 'whatsapp')
      .single();

    if (integration?.config) {
      instanceName = integration.config.instance_name || integration.config.instanceName || null;
    }

    const isEvolutionConfigured = evolutionUrl && evolutionKey && instanceName;

    if (!isEvolutionConfigured) {
      console.log('[whatsapp-sender] Evolution API not configured, falling back to logging only');
    }

    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      const { phone, variables } = contact;

      if (!phone) {
        failed++;
        continue;
      }

      // Replace {{variable}} placeholders in template body
      let messageText = template.body || '';
      if (variables && typeof variables === 'object') {
        for (const [key, value] of Object.entries(variables)) {
          messageText = messageText.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
            String(value)
          );
        }
      }

      let status = 'logged';

      if (isEvolutionConfigured) {
        try {
          const response = await fetch(
            `${evolutionUrl}/message/sendText/${instanceName}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionKey!,
              },
              body: JSON.stringify({
                number: phone,
                text: messageText,
              }),
            }
          );

          if (response.ok) {
            status = 'sent';
            sent++;
          } else {
            const errorText = await response.text();
            console.error(`[whatsapp-sender] Evolution API error for ${phone}: ${response.status} - ${errorText}`);
            status = 'failed';
            failed++;
          }
        } catch (sendError) {
          console.error(`[whatsapp-sender] Send error for ${phone}:`, sendError.message);
          status = 'failed';
          failed++;
        }
      } else {
        // No Evolution API configured — log only, not an error
        console.log(`[whatsapp-sender] Would send to ${phone}: ${messageText.substring(0, 100)}...`);
        status = 'logged';
        sent++;
      }

      // Track in whatsapp_message_logs
      await supabase.from('whatsapp_message_logs').insert({
        organization_id: organizationId,
        template_id: templateId,
        contact_phone: phone,
        message_text: messageText,
        status,
        sent_at: new Date().toISOString(),
      });
    }

    return jsonResponse({ success: true, sent, failed }, 200, corsHeaders);
  } catch (error) {
    console.error('[whatsapp-sender] Error:', error.message);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
