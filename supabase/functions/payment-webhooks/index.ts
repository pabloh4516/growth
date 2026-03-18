import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getWebhookCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { getSupabaseClient } from '../_shared/auth.ts';

/**
 * GrowthOS -- Multi-Platform Payment Webhook Receiver
 *
 * Receives payment notifications from multiple gateways and normalises them
 * into the internal `sales` table, optionally linking to a CRM contact and
 * upserting UTM-enriched records to `utmify_sales`.
 *
 * Endpoint: POST /functions/v1/payment-webhooks?platform={platform}&org={organizationId}
 *
 * Supported platforms:
 *   stripe, mercadopago, pagseguro, asaas, hotmart, kiwify, eduzz
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NormalisedPayment {
  status: 'paid' | 'refunded' | 'pending' | 'failed';
  amount: number;
  currency: string;
  customer_email: string | null;
  customer_name: string | null;
  product: string | null;
  payment_method: string | null;
  transaction_id: string;
  sale_date: string;
  metadata: Record<string, string | null>;
  raw_payload: unknown;
}

type Platform =
  | 'stripe'
  | 'mercadopago'
  | 'pagseguro'
  | 'asaas'
  | 'hotmart'
  | 'kiwify'
  | 'eduzz';

const SUPPORTED_PLATFORMS: Platform[] = [
  'stripe',
  'mercadopago',
  'pagseguro',
  'asaas',
  'hotmart',
  'kiwify',
  'eduzz',
];

// ---------------------------------------------------------------------------
// Platform parsers
// ---------------------------------------------------------------------------

function parseStripe(payload: any): NormalisedPayment | null {
  const eventType: string = payload.type ?? payload.event?.type ?? '';

  if (eventType !== 'checkout.session.completed' && eventType !== 'charge.succeeded') {
    console.log(`[stripe] Ignoring event type: ${eventType}`);
    return null;
  }

  const obj = payload.data?.object ?? {};
  const amount = (obj.amount_total ?? obj.amount ?? 0) / 100; // Stripe uses cents
  const metadata = obj.metadata ?? {};

  return {
    status: 'paid',
    amount,
    currency: (obj.currency ?? 'brl').toUpperCase(),
    customer_email: obj.customer_email ?? obj.receipt_email ?? metadata.email ?? null,
    customer_name: obj.customer_details?.name ?? metadata.customer_name ?? null,
    product: metadata.product_name ?? metadata.product ?? obj.description ?? null,
    payment_method: obj.payment_method_types?.[0] ?? obj.payment_method ?? 'card',
    transaction_id: obj.id ?? obj.payment_intent ?? payload.id,
    sale_date: obj.created
      ? new Date(obj.created * 1000).toISOString()
      : new Date().toISOString(),
    metadata,
    raw_payload: payload,
  };
}

function parseMercadoPago(payload: any): NormalisedPayment | null {
  // MercadoPago sends a lightweight notification; the actual payment details
  // would normally require a fetch to their API. We handle what arrives in
  // the webhook body directly (some integrations forward the full payment
  // object). If only the action + data.id arrive, we still persist what we can
  // and flag the transaction for later enrichment.

  const action: string = payload.action ?? '';
  if (action && action !== 'payment.created' && action !== 'payment.updated') {
    console.log(`[mercadopago] Ignoring action: ${action}`);
    return null;
  }

  // Full payment object (when forwarded by middleware or API fetch)
  const payment = payload.payment ?? payload.data ?? payload;
  const amount = Number(payment.transaction_amount ?? payment.total_paid_amount ?? 0);
  const statusRaw: string = payment.status ?? '';
  const statusMap: Record<string, NormalisedPayment['status']> = {
    approved: 'paid',
    refunded: 'refunded',
    pending: 'pending',
    in_process: 'pending',
    rejected: 'failed',
  };

  return {
    status: statusMap[statusRaw] ?? 'paid',
    amount,
    currency: (payment.currency_id ?? 'BRL').toUpperCase(),
    customer_email: payment.payer?.email ?? null,
    customer_name: payment.payer
      ? [payment.payer.first_name, payment.payer.last_name].filter(Boolean).join(' ') || null
      : null,
    product: payment.description ?? payment.additional_info?.items?.[0]?.title ?? null,
    payment_method: payment.payment_type_id ?? payment.payment_method_id ?? null,
    transaction_id: String(payment.id ?? payload.data?.id ?? ''),
    sale_date: payment.date_approved ?? payment.date_created ?? new Date().toISOString(),
    metadata: payment.metadata ?? {},
    raw_payload: payload,
  };
}

function parseHotmart(payload: any): NormalisedPayment | null {
  const event: string = payload.event ?? '';
  if (event !== 'PURCHASE_COMPLETE' && event !== 'PURCHASE_REFUNDED') {
    console.log(`[hotmart] Ignoring event: ${event}`);
    return null;
  }

  const data = payload.data ?? {};
  const buyer = data.buyer ?? {};
  const purchase = data.purchase ?? {};
  const product = data.product ?? {};
  const price = purchase.price ?? {};

  return {
    status: event === 'PURCHASE_COMPLETE' ? 'paid' : 'refunded',
    amount: Number(price.value ?? 0),
    currency: (price.currency_code ?? 'BRL').toUpperCase(),
    customer_email: buyer.email ?? null,
    customer_name: buyer.name ?? null,
    product: product.name ?? null,
    payment_method: purchase.payment?.type ?? null,
    transaction_id: String(purchase.transaction ?? purchase.order_date ?? ''),
    sale_date: purchase.approved_date ?? purchase.order_date ?? new Date().toISOString(),
    metadata: {
      utm_source: data.purchase?.tracking?.source ?? null,
      utm_medium: data.purchase?.tracking?.medium ?? null,
      utm_campaign: data.purchase?.tracking?.campaign ?? null,
      utm_content: data.purchase?.tracking?.content ?? null,
      utm_term: data.purchase?.tracking?.term ?? null,
      src: data.purchase?.tracking?.src ?? null,
      sck: data.purchase?.tracking?.sck ?? null,
    },
    raw_payload: payload,
  };
}

function parseKiwify(payload: any): NormalisedPayment | null {
  const orderStatus: string = payload.order_status ?? '';
  if (orderStatus !== 'paid' && orderStatus !== 'refunded') {
    console.log(`[kiwify] Ignoring order_status: ${orderStatus}`);
    return null;
  }

  const customer = payload.Customer ?? {};
  const product = payload.Product ?? {};
  const commissions = payload.Commissions ?? {};
  const subscription = payload.Subscription ?? {};

  return {
    status: orderStatus === 'paid' ? 'paid' : 'refunded',
    amount: Number(commissions.charge_amount ?? payload.order_ref?.price ?? 0),
    currency: 'BRL',
    customer_email: customer.email ?? null,
    customer_name: customer.full_name ?? customer.name ?? null,
    product: product.product_name ?? null,
    payment_method: payload.payment_method ?? subscription.plan?.frequency ?? null,
    transaction_id: String(payload.order_id ?? payload.order_ref?.order_id ?? ''),
    sale_date: payload.sale_date ?? payload.created_at ?? new Date().toISOString(),
    metadata: {
      utm_source: payload.TrackingParameters?.utm_source ?? null,
      utm_medium: payload.TrackingParameters?.utm_medium ?? null,
      utm_campaign: payload.TrackingParameters?.utm_campaign ?? null,
      utm_content: payload.TrackingParameters?.utm_content ?? null,
      utm_term: payload.TrackingParameters?.utm_term ?? null,
      src: payload.TrackingParameters?.src ?? null,
      sck: payload.TrackingParameters?.sck ?? null,
    },
    raw_payload: payload,
  };
}

function parseEduzz(payload: any): NormalisedPayment | null {
  const eventType: string = payload.event_type ?? '';
  if (eventType !== 'sale_confirmed' && eventType !== 'sale_refunded') {
    console.log(`[eduzz] Ignoring event_type: ${eventType}`);
    return null;
  }

  const customer = payload.customer ?? {};
  const sale = payload.sale ?? {};
  const content = payload.content ?? {};

  return {
    status: eventType === 'sale_confirmed' ? 'paid' : 'refunded',
    amount: Number(sale.amount ?? sale.net_gain ?? 0),
    currency: (sale.currency ?? 'BRL').toUpperCase(),
    customer_email: customer.email ?? null,
    customer_name: customer.name ?? null,
    product: content.title ?? content.name ?? null,
    payment_method: sale.payment_method ?? null,
    transaction_id: String(sale.sale_id ?? sale.contract_id ?? payload.id ?? ''),
    sale_date: sale.date_create ?? sale.sale_date ?? new Date().toISOString(),
    metadata: {
      utm_source: payload.tracker?.utm_source ?? sale.tracker?.utm_source ?? null,
      utm_medium: payload.tracker?.utm_medium ?? sale.tracker?.utm_medium ?? null,
      utm_campaign: payload.tracker?.utm_campaign ?? sale.tracker?.utm_campaign ?? null,
      utm_content: payload.tracker?.utm_content ?? sale.tracker?.utm_content ?? null,
      utm_term: payload.tracker?.utm_term ?? sale.tracker?.utm_term ?? null,
      src: payload.tracker?.src ?? sale.tracker?.src ?? null,
      sck: payload.tracker?.sck ?? sale.tracker?.sck ?? null,
    },
    raw_payload: payload,
  };
}

function parseAsaas(payload: any): NormalisedPayment | null {
  const event: string = payload.event ?? '';
  if (event !== 'PAYMENT_CONFIRMED' && event !== 'PAYMENT_REFUNDED' && event !== 'PAYMENT_RECEIVED') {
    console.log(`[asaas] Ignoring event: ${event}`);
    return null;
  }

  const payment = payload.payment ?? {};

  return {
    status: event === 'PAYMENT_REFUNDED' ? 'refunded' : 'paid',
    amount: Number(payment.value ?? 0),
    currency: 'BRL',
    customer_email: payment.customer_email ?? payload.customer?.email ?? null,
    customer_name: payment.customer_name ?? payload.customer?.name ?? null,
    product: payment.description ?? null,
    payment_method: payment.billingType ?? null,
    transaction_id: String(payment.id ?? payment.externalReference ?? ''),
    sale_date: payment.confirmedDate ?? payment.paymentDate ?? new Date().toISOString(),
    metadata: payment.metadata ?? {},
    raw_payload: payload,
  };
}

function parsePagSeguro(payload: any): NormalisedPayment | null {
  // PagSeguro v4 sends JSON (not XML) for newer integrations.
  // We handle both the notification object and the direct charge object.

  const charges = payload.charges ?? [];
  const charge = charges[0] ?? payload;

  const statusRaw: string = (charge.status ?? payload.status ?? '').toUpperCase();
  const statusMap: Record<string, NormalisedPayment['status']> = {
    PAID: 'paid',
    AUTHORIZED: 'paid',
    AVAILABLE: 'paid',
    REFUNDED: 'refunded',
    CANCELLED: 'failed',
    DECLINED: 'failed',
    IN_ANALYSIS: 'pending',
    WAITING: 'pending',
  };

  const amount = charge.amount?.value
    ? Number(charge.amount.value) / 100 // PagSeguro uses cents
    : Number(charge.grossAmount ?? payload.grossAmount ?? 0);

  const customer = payload.customer ?? payload.sender ?? {};

  return {
    status: statusMap[statusRaw] ?? 'pending',
    amount,
    currency: 'BRL',
    customer_email: customer.email ?? charge.customer?.email ?? null,
    customer_name: customer.name ?? charge.customer?.name ?? null,
    product: payload.description ?? payload.items?.[0]?.name ?? payload.reference ?? null,
    payment_method: charge.payment_method?.type ?? payload.paymentMethod ?? null,
    transaction_id: String(charge.id ?? payload.code ?? payload.id ?? ''),
    sale_date: charge.paid_at ?? charge.created_at ?? new Date().toISOString(),
    metadata: payload.metadata ?? {},
    raw_payload: payload,
  };
}

// ---------------------------------------------------------------------------
// Parser dispatch
// ---------------------------------------------------------------------------

const parsers: Record<Platform, (payload: any) => NormalisedPayment | null> = {
  stripe: parseStripe,
  mercadopago: parseMercadoPago,
  pagseguro: parsePagSeguro,
  asaas: parseAsaas,
  hotmart: parseHotmart,
  kiwify: parseKiwify,
  eduzz: parseEduzz,
};

// ---------------------------------------------------------------------------
// Contact matching helper
// ---------------------------------------------------------------------------

async function findContactByEmail(
  supabase: SupabaseClient,
  orgId: string,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;

  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', email.toLowerCase().trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[contact-match] Error looking up contact:', error.message);
    return null;
  }

  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// UTM upsert helper
// ---------------------------------------------------------------------------

async function upsertUtmifySale(
  supabase: SupabaseClient,
  orgId: string,
  payment: NormalisedPayment,
  platform: Platform,
): Promise<void> {
  const meta = payment.metadata;
  const hasUtm =
    meta.utm_source || meta.utm_campaign || meta.utm_medium || meta.src || meta.sck;

  if (!hasUtm) return;

  const statusMap: Record<string, string> = {
    paid: 'paid',
    refunded: 'refunded',
    pending: 'waiting_payment',
    failed: 'refused',
  };

  const { error } = await supabase
    .from('utmify_sales')
    .upsert(
      {
        organization_id: orgId,
        order_id: `${platform}_${payment.transaction_id}`,
        status: statusMap[payment.status] ?? 'paid',
        revenue: payment.amount,
        currency: payment.currency,
        utm_source: meta.utm_source ?? null,
        utm_campaign: meta.utm_campaign ?? null,
        utm_medium: meta.utm_medium ?? null,
        utm_content: meta.utm_content ?? null,
        utm_term: meta.utm_term ?? null,
        src: meta.src ?? null,
        sck: meta.sck ?? null,
        customer_email: payment.customer_email,
        customer_name: payment.customer_name,
        product_name: payment.product,
        sale_date: payment.sale_date,
        received_at: new Date().toISOString(),
        raw_payload: payment.raw_payload,
      },
      { onConflict: 'organization_id,order_id' },
    );

  if (error) {
    console.error('[utmify-upsert] Error upserting utmify_sales:', error.message);
  } else {
    console.log('[utmify-upsert] Upserted UTM sale for', payment.transaction_id);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsHeaders = getWebhookCorsHeaders();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const supabase = getSupabaseClient();

  try {
    // -----------------------------------------------------------------------
    // 1. Validate query parameters
    // -----------------------------------------------------------------------
    const url = new URL(req.url);
    const platform = (url.searchParams.get('platform') ?? '').toLowerCase() as Platform;
    const orgId = url.searchParams.get('org');

    if (!orgId) {
      return jsonResponse({ error: 'Missing required query parameter: org' }, 400, corsHeaders);
    }

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return jsonResponse(
        {
          error: `Unsupported platform: "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`,
        },
        400,
        corsHeaders,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Validate organisation exists
    // -----------------------------------------------------------------------
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .maybeSingle();

    if (orgError || !org) {
      console.error('[payment-webhooks] Organisation not found:', orgId);
      return jsonResponse({ error: 'Organisation not found' }, 404, corsHeaders);
    }

    // -----------------------------------------------------------------------
    // 3. Validate webhook signature (per-platform)
    // -----------------------------------------------------------------------
    const rawBody = await req.text();

    const { data: integration } = await supabase
      .from('integrations')
      .select('config_json')
      .eq('organization_id', orgId)
      .eq('type', platform)
      .maybeSingle();

    const webhookSecret = integration?.config_json?.webhook_secret || '';

    if (webhookSecret) {
      const signature = req.headers.get('x-webhook-signature')
        || req.headers.get('stripe-signature')
        || req.headers.get('x-hotmart-hottok')
        || req.headers.get('x-hub-signature-256')
        || '';

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

      const sigValue = signature.replace(/^sha256=/, '').replace(/^v1,/, '');
      if (sigValue !== expectedSignature) {
        console.error(`[payment-webhooks][${platform}] Invalid signature for org ${orgId}`);
        return jsonResponse({ error: 'Invalid signature' }, 401, corsHeaders);
      }
    }

    // -----------------------------------------------------------------------
    // 3b. Parse payload
    // -----------------------------------------------------------------------
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error(`[payment-webhooks][${platform}] Failed to parse JSON body`);
      return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
    }

    console.log(`[payment-webhooks][${platform}] Received webhook for org ${orgId}`);

    const parser = parsers[platform];
    const normalised = parser(payload);

    if (!normalised) {
      // The event type is not one we track -- acknowledge receipt silently
      console.log(`[payment-webhooks][${platform}] Event ignored (not a tracked type)`);
      return jsonResponse({ success: true, ignored: true }, 200, corsHeaders);
    }

    // -----------------------------------------------------------------------
    // 4. Look up CRM contact by email
    // -----------------------------------------------------------------------
    const contactId = await findContactByEmail(supabase, orgId, normalised.customer_email);

    if (contactId) {
      console.log(`[payment-webhooks] Matched contact ${contactId} via email ${normalised.customer_email}`);
    }

    // -----------------------------------------------------------------------
    // 5. Insert into the `sales` table
    // -----------------------------------------------------------------------
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        organization_id: orgId,
        contact_id: contactId,
        amount: normalised.amount,
        currency: normalised.currency,
        product: normalised.product,
        payment_method: normalised.payment_method,
        transaction_id: normalised.transaction_id,
        sale_date: normalised.sale_date,
        is_offline: false,
      })
      .select('id')
      .single();

    if (saleError) {
      console.error('[payment-webhooks] Error inserting sale:', saleError.message);
      return jsonResponse({ error: 'Failed to save sale', detail: saleError.message }, 500, corsHeaders);
    }

    console.log(`[payment-webhooks] Sale saved: ${sale.id} (${platform}, ${normalised.status}, R$${normalised.amount})`);

    // -----------------------------------------------------------------------
    // 6. Add timeline event on the contact (if matched)
    // -----------------------------------------------------------------------
    if (contactId) {
      const { error: timelineError } = await supabase.from('contact_timeline').insert({
        contact_id: contactId,
        event_type: 'sale',
        event_data: {
          sale_id: sale.id,
          platform,
          amount: normalised.amount,
          currency: normalised.currency,
          product: normalised.product,
          status: normalised.status,
        },
      });

      if (timelineError) {
        console.error('[payment-webhooks] Error inserting timeline event:', timelineError.message);
        // Non-critical -- do not fail the webhook
      }

      // Promote contact lifecycle stage to 'customer' if currently lower
      await supabase
        .from('contacts')
        .update({
          lifecycle_stage: 'customer',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .in('lifecycle_stage', ['subscriber', 'lead', 'mql', 'sql', 'opportunity']);
    }

    // -----------------------------------------------------------------------
    // 7. Upsert to utmify_sales when UTM params are present
    // -----------------------------------------------------------------------
    await upsertUtmifySale(supabase, orgId, normalised, platform);

    // -----------------------------------------------------------------------
    // 8. Respond success
    // -----------------------------------------------------------------------
    return jsonResponse(
      {
        success: true,
        sale_id: sale.id,
        platform,
        status: normalised.status,
        amount: normalised.amount,
        contact_matched: !!contactId,
      },
      200,
      corsHeaders,
    );
  } catch (error: any) {
    console.error('[payment-webhooks] Unhandled error:', error);
    return jsonResponse({ error: error.message ?? 'Internal server error' }, 500, corsHeaders);
  }
});
