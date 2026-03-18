import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getWebhookCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * GrowthOS — Call Webhook Receiver
 *
 * Public webhook endpoint for call tracking integrations.
 * Receives call data, validates API token against org integrations,
 * inserts into `calls` table, and attempts campaign matching via utm_campaign.
 *
 * Endpoint: POST /functions/v1/call-webhook
 */

serve(async (req) => {
  const corsHeaders = getWebhookCorsHeaders();
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const payload = await req.json();

    const {
      organization_id,
      caller_number,
      called_number,
      status,
      duration_seconds,
      recording_url,
      utm_source,
      utm_campaign,
      api_token,
    } = payload;

    // Validate required fields
    if (!organization_id) {
      return jsonResponse({ error: 'Missing organization_id' }, 400, corsHeaders);
    }
    if (!api_token) {
      return jsonResponse({ error: 'Missing api_token' }, 400, corsHeaders);
    }
    if (!caller_number) {
      return jsonResponse({ error: 'Missing caller_number' }, 400, corsHeaders);
    }

    // Validate api_token against org's integrations table
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, config_json')
      .eq('organization_id', organization_id)
      .eq('type', 'call_tracking')
      .single();

    if (integrationError || !integration) {
      return jsonResponse({ error: 'Call tracking integration not found for this organization' }, 401, corsHeaders);
    }

    const storedToken = integration.config_json?.api_token || integration.config_json?.webhook_token;
    if (!storedToken || storedToken !== api_token) {
      return jsonResponse({ error: 'Invalid api_token' }, 401, corsHeaders);
    }

    // Insert into calls table
    const { data: call, error: insertError } = await supabase
      .from('calls')
      .insert({
        organization_id,
        caller_number,
        called_number: called_number || null,
        status: status || 'completed',
        duration_seconds: duration_seconds || 0,
        recording_url: recording_url || null,
        qualification: null,
        utm_source: utm_source || null,
        utm_campaign: utm_campaign || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting call:', insertError);
      return jsonResponse({ error: 'Failed to save call record' }, 500, corsHeaders);
    }

    // Try to match to a campaign via utm_campaign
    let matchedCampaignId: string | null = null;

    if (utm_campaign) {
      // Strategy 1: exact name match
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('organization_id', organization_id)
        .eq('platform', 'google_ads');

      if (campaigns && campaigns.length > 0) {
        // Try exact match first
        const exactMatch = campaigns.find(
          (c: any) => c.name.toLowerCase() === utm_campaign.toLowerCase()
        );
        if (exactMatch) {
          matchedCampaignId = exactMatch.id;
        } else {
          // Try partial match (campaign name contains utm_campaign or vice versa)
          const partialMatch = campaigns.find(
            (c: any) =>
              c.name.toLowerCase().includes(utm_campaign.toLowerCase()) ||
              utm_campaign.toLowerCase().includes(c.name.toLowerCase())
          );
          if (partialMatch) {
            matchedCampaignId = partialMatch.id;
          }
        }
      }

      // Update call with matched campaign
      if (matchedCampaignId) {
        await supabase
          .from('calls')
          .update({ matched_campaign_id: matchedCampaignId })
          .eq('id', call.id);
      }
    }

    return jsonResponse({
      success: true,
      callId: call.id,
      matched: !!matchedCampaignId,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('Call webhook error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
