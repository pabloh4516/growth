import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getWebhookCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';

/**
 * GrowthOS — SellX Webhook Receiver
 *
 * Handles webhooks from both:
 * - SellxCheckout (checkout): order.created, order.paid, order.failed, order.refunded
 * - SellxPay (gateway): transaction.paid, transaction.cancelled, transaction.reversed, etc.
 *
 * Endpoint: POST /functions/v1/sellx-webhook?org={orgId}&source=checkout|gateway
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
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    const source = url.searchParams.get('source') || 'checkout';

    if (!orgId) {
      return jsonResponse({ error: 'Missing org parameter' }, 400, corsHeaders);
    }

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // =============================================
    // HMAC Validation (per-org secret from integrations table)
    // =============================================
    const signature = req.headers.get('x-webhook-signature') || '';

    // Get org-specific webhook secret from integrations table
    const { data: sellxIntegration } = await supabase
      .from('integrations')
      .select('config_json')
      .eq('organization_id', orgId)
      .eq('type', 'sellx')
      .single();

    const secretKey = source === 'gateway' ? 'pay_secret' : 'checkout_secret';
    const webhookSecret = sellxIntegration?.config_json?.[secretKey] || '';

    if (webhookSecret) {
      if (!signature) {
        return jsonResponse({ error: 'Missing webhook signature' }, 401, corsHeaders);
      }

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
        return jsonResponse({ error: 'Invalid signature' }, 401, corsHeaders);
      }
    }

    // =============================================
    // Parse based on source
    // =============================================
    let orderId: string;
    let status: string;
    let revenue: number;
    let customerEmail: string | null;
    let customerName: string | null;
    let customerPhone: string | null;
    let productName: string | null;
    let paymentMethod: string | null;
    let saleDate: string;
    let utmSource: string | null = null;
    let utmCampaign: string | null = null;
    let utmMedium: string | null = null;
    let utmContent: string | null = null;
    let utmTerm: string | null = null;
    let src: string | null = null;
    let sck: string | null = null;

    if (source === 'gateway') {
      // ─── SellxPay Gateway ────────────────────────────
      const tx = payload.transaction || payload;
      const event = payload.event || '';

      const statusMap: Record<string, string> = {
        'transaction.paid': 'paid',
        'transaction.cancelled': 'refused',
        'transaction.reversed': 'refunded',
        'transaction.refused': 'refused',
        'transaction.chargedback': 'chargedback',
        'transaction.expired': 'refused',
        'transaction.in_analysis': 'waiting_payment',
      };

      orderId = tx.id || tx.external_id || crypto.randomUUID();
      status = statusMap[event] || tx.status || 'paid';
      revenue = Number(tx.amount || tx.net_amount || 0);
      customerEmail = null;
      customerName = tx.payer_name || null;
      customerPhone = null;
      productName = null;
      paymentMethod = tx.method || null;
      saleDate = tx.confirmed_at || new Date().toISOString();

      // Try to extract UTMs from external_id or metadata
      if (tx.external_id) {
        // Common pattern: external_id contains UTM params
        const parts = String(tx.external_id).split('|');
        for (const part of parts) {
          if (part.startsWith('src=')) src = part.replace('src=', '');
          if (part.startsWith('sck=')) sck = part.replace('sck=', '');
          if (part.startsWith('utm_source=')) utmSource = part.replace('utm_source=', '');
          if (part.startsWith('utm_campaign=')) utmCampaign = part.replace('utm_campaign=', '');
        }
      }

    } else {
      // ─── SellxCheckout ───────────────────────────────
      const event = payload.event || '';
      const data = payload.data || {};
      const order = data.order || {};
      const customer = data.customer || {};
      const product = data.product || {};
      const tracking = data.trackingParameters || data.tracking || order.tracking || {};

      console.log('SellxCheckout webhook received:', { event, orderId: order.id, amount: order.amount });

      const statusMap: Record<string, string> = {
        'order.paid': 'paid',
        'order.created': 'waiting_payment',
        'order.failed': 'refused',
        'order.refunded': 'refunded',
        'order.pending': 'waiting_payment',
        'order.canceled': 'refused',
        'test': 'paid', // Test webhook
      };

      orderId = order.id || order.orderNumber || `test-${Date.now()}`;
      status = statusMap[event] || order.status || 'paid';

      // Amount: SellX sends cents as integer. Detect by checking if it's an integer
      // and if there's an explicit currency_type field. Fallback: integers >= 100 are likely cents.
      const rawAmount = Number(order.amount || order.price || 0);
      const currencyType = order.currency_type || order.amountType || payload.amountType || '';
      if (currencyType === 'cents' || currencyType === 'centavos') {
        revenue = rawAmount / 100;
      } else if (currencyType === 'reais' || currencyType === 'brl') {
        revenue = rawAmount;
      } else {
        // Heuristic: if integer and >= 100, likely cents (R$1.00+)
        revenue = Number.isInteger(rawAmount) && rawAmount >= 100 ? rawAmount / 100 : rawAmount;
      }

      customerEmail = customer.email || null;
      customerName = customer.name || null;
      customerPhone = customer.phone || null;
      productName = product.name || null;
      paymentMethod = order.paymentMethod || null;
      saleDate = order.paidAt || payload.timestamp || new Date().toISOString();

      // UTM params — accept both camelCase (utmSource) and snake_case (utm_source)
      utmSource = tracking.utm_source || tracking.utmSource || order.utm_source || order.utmSource || data.utm_source || null;
      utmCampaign = tracking.utm_campaign || tracking.utmCampaign || order.utm_campaign || order.utmCampaign || data.utm_campaign || null;
      utmMedium = tracking.utm_medium || tracking.utmMedium || order.utm_medium || order.utmMedium || data.utm_medium || null;
      utmContent = tracking.utm_content || tracking.utmContent || order.utm_content || order.utmContent || data.utm_content || null;
      utmTerm = tracking.utm_term || tracking.utmTerm || order.utm_term || order.utmTerm || data.utm_term || null;
      src = tracking.src || order.src || data.src || null;
      sck = tracking.sck || order.sck || data.sck || null;

      // Also check metadata object
      const meta = tracking.metadata || order.metadata || {};
      utmSource = utmSource || meta.utm_source || meta.utmSource || null;
      utmCampaign = utmCampaign || meta.utm_campaign || meta.utmCampaign || null;
      utmMedium = utmMedium || meta.utm_medium || meta.utmMedium || null;
      src = src || meta.src || null;
      sck = sck || meta.sck || null;

      console.log('UTM params extracted:', { utmSource, utmCampaign, utmMedium, src, sck });
    }

    // =============================================
    // Save to utmify_sales (reusing same table for all sale sources)
    // =============================================
    const { data: sale, error: saleError } = await supabase
      .from('utmify_sales')
      .upsert({
        organization_id: orgId,
        order_id: orderId,
        status,
        revenue,
        currency: 'BRL',
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        utm_content: utmContent,
        utm_term: utmTerm,
        src,
        sck,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
        product_name: productName,
        sale_date: saleDate,
        received_at: new Date().toISOString(),
        raw_payload: payload,
      }, {
        onConflict: 'organization_id,order_id',
      })
      .select()
      .single();

    if (saleError) {
      console.error('Error saving sale:', saleError);
      return jsonResponse({ error: 'Failed to save sale' }, 500, corsHeaders);
    }

    // =============================================
    // CAMPAIGN MATCHING (same logic as utmify-webhook)
    // =============================================
    let matchedCampaignId: string | null = null;
    let matchConfidence = 0;

    if (sale && status === 'paid') {
      // Strategy 1: sck/src contains campaign external_id
      if (sck || src) {
        const searchValue = sck || src;
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, external_id, name')
          .eq('organization_id', orgId)
          .eq('platform', 'google_ads');

        if (campaigns) {
          for (const campaign of campaigns) {
            if (campaign.external_id && searchValue!.includes(campaign.external_id)) {
              matchedCampaignId = campaign.id;
              matchConfidence = 0.95;
              break;
            }
          }
        }
      }

      // Strategy 2: utm_campaign name match
      if (!matchedCampaignId && utmCampaign) {
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, name')
          .eq('organization_id', orgId)
          .ilike('name', `%${utmCampaign}%`);

        if (campaigns && campaigns.length === 1) {
          matchedCampaignId = campaigns[0].id;
          matchConfidence = 0.7;
        } else if (campaigns && campaigns.length > 1) {
          const exact = campaigns.find(c =>
            c.name.toLowerCase() === utmCampaign!.toLowerCase()
          );
          matchedCampaignId = exact ? exact.id : campaigns[0].id;
          matchConfidence = exact ? 0.85 : 0.5;
        }
      }

      // Strategy 3: utm_source = google
      if (!matchedCampaignId && utmSource === 'google') {
        matchConfidence = 0.2;
      }

      // Update sale with match
      if (matchedCampaignId) {
        await supabase
          .from('utmify_sales')
          .update({ matched_campaign_id: matchedCampaignId, match_confidence: matchConfidence })
          .eq('id', sale.id);
      }

      // Recalculate ROAS for matched campaign
      if (matchedCampaignId) {
        const { data: salesForCampaign } = await supabase
          .from('utmify_sales')
          .select('revenue')
          .eq('matched_campaign_id', matchedCampaignId)
          .eq('status', 'paid');

        if (salesForCampaign) {
          const realSalesCount = salesForCampaign.length;
          const realRevenue = salesForCampaign.reduce((sum, s) => sum + Number(s.revenue), 0);

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

    // Log to contact timeline if customer email exists
    if (customerEmail && status === 'paid') {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', customerEmail)
        .single();

      if (contact) {
        await supabase.from('contact_timeline').insert({
          contact_id: contact.id,
          event_type: 'sale',
          event_data: {
            orderId,
            revenue,
            productName,
            source: source === 'gateway' ? 'sellxpay' : 'sellxcheckout',
          },
        });

        // Promote lifecycle stage to customer
        await supabase
          .from('contacts')
          .update({ lifecycle_stage: 'customer', last_activity_at: new Date().toISOString() })
          .eq('id', contact.id);
      }
    }

    return jsonResponse({
      success: true,
      saleId: sale?.id,
      matched: !!matchedCampaignId,
      matchConfidence,
      status,
      source,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('SellX webhook error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
