import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getWebhookCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * GrowthOS — Utmify Webhook Receiver
 *
 * Receives sale notifications from Utmify and maps them to Google Ads campaigns.
 * This is the CRITICAL bridge between ad spend and REAL revenue.
 *
 * Endpoint: POST /functions/v1/utmify-webhook?org={organizationId}
 * Auth: HMAC signature in x-webhook-signature header OR org-specific webhook secret
 */

serve(async (req) => {
  const corsHeaders = getWebhookCorsHeaders();

  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');

    if (!orgId) {
      return jsonResponse({ error: 'Missing org parameter' }, 400, corsHeaders);
    }

    // Validate organization exists
    const { data: utmifyConfig } = await supabase
      .from('utmify_config')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!utmifyConfig) {
      return jsonResponse({ error: 'Organization not found or Utmify not active' }, 404, corsHeaders);
    }

    // Parse payload (must read body before HMAC check)
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // Validate HMAC signature
    if (utmifyConfig.webhook_secret) {
      const signature = req.headers.get('x-webhook-signature') || '';
      if (signature) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(utmifyConfig.webhook_secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
        const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
          return jsonResponse({ error: 'Invalid webhook signature' }, 401, corsHeaders);
        }
      }
    }

    // Map Utmify status
    const statusMap: Record<string, string> = {
      'paid': 'paid',
      'waiting_payment': 'waiting_payment',
      'refused': 'refused',
      'refunded': 'refunded',
      'chargedback': 'chargedback',
    };

    const status = statusMap[payload.status] || payload.status;

    // Extract tracking parameters
    const tracking = payload.trackingParameters || {};
    const revenue = (payload.commission?.totalPriceInCents || 0) / 100;

    // Upsert the sale
    const { data: sale, error: saleError } = await supabase
      .from('utmify_sales')
      .upsert({
        organization_id: orgId,
        order_id: payload.orderId,
        status,
        revenue,
        currency: payload.commission?.currency || 'BRL',
        utm_source: tracking.utm_source || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_medium: tracking.utm_medium || null,
        utm_content: tracking.utm_content || null,
        utm_term: tracking.utm_term || null,
        src: tracking.src || null,
        sck: tracking.sck || null,
        customer_email: payload.customer?.email || null,
        customer_name: payload.customer?.name || null,
        customer_phone: payload.customer?.phone || null,
        product_name: payload.products?.[0]?.name || null,
        sale_date: payload.approvedDate || payload.createdAt || new Date().toISOString(),
        received_at: new Date().toISOString(),
        raw_payload: payload,
      }, {
        onConflict: 'organization_id,order_id',
      })
      .select()
      .single();

    if (saleError) {
      console.error('Error saving Utmify sale:', saleError);
      return jsonResponse({ error: 'Failed to save sale' }, 500, corsHeaders);
    }

    // =============================================
    // UTM-TO-CAMPAIGN MATCHING
    // =============================================
    let matchedCampaignId: string | null = null;
    let matchConfidence = 0;

    if (sale && status === 'paid') {
      // Strategy 1: Match by sck/src containing campaign external_id (highest confidence)
      if (tracking.sck || tracking.src) {
        const searchValue = tracking.sck || tracking.src;
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, external_id, name')
          .eq('organization_id', orgId)
          .eq('platform', 'google_ads');

        if (campaigns) {
          for (const campaign of campaigns) {
            if (searchValue.includes(campaign.external_id)) {
              matchedCampaignId = campaign.id;
              matchConfidence = 0.95;
              break;
            }
          }
        }
      }

      // Strategy 2: Match by utm_campaign name (medium confidence)
      if (!matchedCampaignId && tracking.utm_campaign) {
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, name')
          .eq('organization_id', orgId)
          .ilike('name', `%${tracking.utm_campaign}%`);

        if (campaigns && campaigns.length === 1) {
          matchedCampaignId = campaigns[0].id;
          matchConfidence = 0.7;
        } else if (campaigns && campaigns.length > 1) {
          // Exact match preferred
          const exact = campaigns.find(c =>
            c.name.toLowerCase() === tracking.utm_campaign.toLowerCase()
          );
          if (exact) {
            matchedCampaignId = exact.id;
            matchConfidence = 0.85;
          } else {
            matchedCampaignId = campaigns[0].id;
            matchConfidence = 0.5;
          }
        }
      }

      // Strategy 3: Match by utm_source = google (low confidence, just tags it as Google)
      if (!matchedCampaignId && tracking.utm_source === 'google') {
        matchConfidence = 0.2; // Very low - we know it's Google but not which campaign
      }

      // Update sale with match
      if (matchedCampaignId) {
        await supabase
          .from('utmify_sales')
          .update({
            matched_campaign_id: matchedCampaignId,
            match_confidence: matchConfidence,
          })
          .eq('id', sale.id);
      }

      // =============================================
      // RECALCULATE REAL METRICS FOR MATCHED CAMPAIGN
      // =============================================
      if (matchedCampaignId) {
        const { data: salesForCampaign } = await supabase
          .from('utmify_sales')
          .select('revenue')
          .eq('matched_campaign_id', matchedCampaignId)
          .eq('status', 'paid');

        if (salesForCampaign) {
          const realSalesCount = salesForCampaign.length;
          const realRevenue = salesForCampaign.reduce((sum, s) => sum + Number(s.revenue), 0);

          // Get campaign cost
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('cost')
            .eq('id', matchedCampaignId)
            .single();

          const cost = Number(campaign?.cost || 0);
          const realRoas = cost > 0 ? realRevenue / cost : 0;
          const realCpa = realSalesCount > 0 ? cost / realSalesCount : 0;

          await supabase
            .from('campaigns')
            .update({
              real_sales_count: realSalesCount,
              real_revenue: realRevenue,
              real_roas: Math.round(realRoas * 100) / 100,
              real_cpa: Math.round(realCpa * 100) / 100,
            })
            .eq('id', matchedCampaignId);
        }
      }
    }

    return jsonResponse({
      success: true,
      saleId: sale?.id,
      matched: !!matchedCampaignId,
      matchConfidence,
      status,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Utmify webhook error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
