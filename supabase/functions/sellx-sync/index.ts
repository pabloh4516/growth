import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — SellX Sync (API Pull)
 *
 * Pulls transactions from SellxPay API to import historical sales.
 * GET https://app.sellxpay.com.br/api/v1/transactions
 * Auth: Bearer {access_token}
 */

const SELLXPAY_API_URL = 'https://app.sellxpay.com.br/api/v1/transactions';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const isCron = validateCronSecret(req);
    let orgId: string | null = null;
    let daysBack = 1;
    let sellxPayToken: string | null = null;

    if (!isCron) {
      await validateAuth(req);
      const body = await req.json().catch(() => ({}));
      orgId = body.organizationId || null;
      daysBack = body.daysBack || 1;
      sellxPayToken = body.sellxPayToken || null;
    }

    if (!orgId) {
      return jsonResponse({ error: 'Missing organizationId' }, 400, corsHeaders);
    }

    // Get SellxPay token from integrations table if not passed directly
    if (!sellxPayToken) {
      const { data: integration } = await supabase
        .from('integrations')
        .select('config_json')
        .eq('organization_id', orgId)
        .eq('type', 'sellx')
        .single();

      sellxPayToken = integration?.config_json?.pay_api_token || null;
    }

    if (!sellxPayToken) {
      return jsonResponse({ error: 'SellxPay API token not configured' }, 400, corsHeaders);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    let page = 1;
    let totalSaved = 0;
    let totalMatched = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        status: 'paid',
        type: 'deposit',
        start_date: startDateStr,
        end_date: endDateStr,
        page: String(page),
        per_page: '100',
      });

      const response = await fetch(`${SELLXPAY_API_URL}?${params}`, {
        headers: {
          'Authorization': `Bearer ${sellxPayToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return jsonResponse({
          error: `SellxPay API error: ${response.status}`,
          details: errorText,
        }, 400, corsHeaders);
      }

      const result = await response.json();
      const transactions = result.data || [];
      const meta = result.meta || {};

      for (const tx of transactions) {
        const revenue = Number(tx.amount || 0);

        // Try to extract UTMs from external_id
        let utmSource: string | null = null;
        let utmCampaign: string | null = null;
        let utmMedium: string | null = null;
        let src: string | null = null;
        let sck: string | null = null;

        if (tx.external_id) {
          const parts = String(tx.external_id).split('|');
          for (const part of parts) {
            const [key, val] = part.split('=');
            if (key === 'src') src = val;
            if (key === 'sck') sck = val;
            if (key === 'utm_source') utmSource = val;
            if (key === 'utm_campaign') utmCampaign = val;
            if (key === 'utm_medium') utmMedium = val;
          }
        }

        // Upsert sale
        const { data: sale } = await supabase
          .from('utmify_sales')
          .upsert({
            organization_id: orgId,
            order_id: tx.id || tx.external_id,
            status: 'paid',
            revenue,
            currency: 'BRL',
            utm_source: utmSource,
            utm_campaign: utmCampaign,
            utm_medium: utmMedium,
            src,
            sck,
            customer_name: tx.payer_name || null,
            customer_phone: null,
            customer_email: null,
            product_name: null,
            sale_date: tx.confirmed_at || tx.created_at || new Date().toISOString(),
            received_at: new Date().toISOString(),
            raw_payload: tx,
          }, {
            onConflict: 'organization_id,order_id',
          })
          .select()
          .single();

        if (sale) {
          totalSaved++;

          // Campaign matching
          let matchedCampaignId: string | null = null;
          let matchConfidence = 0;

          // Strategy 1: sck/src contains external_id
          if (sck || src) {
            const searchValue = (sck || src)!;
            const { data: campaigns } = await supabase
              .from('campaigns')
              .select('id, external_id')
              .eq('organization_id', orgId)
              .eq('platform', 'google_ads');

            if (campaigns) {
              for (const c of campaigns) {
                if (c.external_id && searchValue.includes(c.external_id)) {
                  matchedCampaignId = c.id;
                  matchConfidence = 0.95;
                  break;
                }
              }
            }
          }

          // Strategy 2: utm_campaign = external_id
          if (!matchedCampaignId && utmCampaign) {
            const { data: campaigns } = await supabase
              .from('campaigns')
              .select('id, external_id, name')
              .eq('organization_id', orgId)
              .eq('platform', 'google_ads');

            if (campaigns) {
              // Try matching utm_campaign as external_id first
              const byExternalId = campaigns.find(c => c.external_id === utmCampaign);
              if (byExternalId) {
                matchedCampaignId = byExternalId.id;
                matchConfidence = 0.95;
              } else {
                // Fallback to name matching
                const byName = campaigns.filter(c =>
                  c.name.toLowerCase().includes(utmCampaign!.toLowerCase())
                );
                if (byName.length === 1) {
                  matchedCampaignId = byName[0].id;
                  matchConfidence = 0.7;
                }
              }
            }
          }

          if (matchedCampaignId) {
            await supabase
              .from('utmify_sales')
              .update({ matched_campaign_id: matchedCampaignId, match_confidence: matchConfidence })
              .eq('id', sale.id);
            totalMatched++;
          }
        }
      }

      // Check pagination
      hasMore = page < (meta.last_page || 1);
      page++;
    }

    // Recalculate ROAS for all matched campaigns
    const { data: matchedSales } = await supabase
      .from('utmify_sales')
      .select('matched_campaign_id')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .not('matched_campaign_id', 'is', null);

    const uniqueIds = Array.from(new Set((matchedSales || []).map((s: any) => s.matched_campaign_id)));

    for (const campaignId of uniqueIds) {
      const { data: sales } = await supabase
        .from('utmify_sales')
        .select('revenue')
        .eq('matched_campaign_id', campaignId)
        .eq('status', 'paid');

      if (sales) {
        const count = sales.length;
        const rev = sales.reduce((sum, s) => sum + Number(s.revenue), 0);
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('cost')
          .eq('id', campaignId)
          .single();

        const cost = Number(campaign?.cost || 0);

        await supabase.from('campaigns').update({
          real_sales_count: count,
          real_revenue: rev,
          real_roas: cost > 0 ? Math.round((rev / cost) * 100) / 100 : 0,
          real_cpa: count > 0 ? Math.round((cost / count) * 100) / 100 : 0,
        }).eq('id', campaignId);
      }
    }

    return jsonResponse({
      success: true,
      period: `${startDateStr} to ${endDateStr}`,
      totalSaved,
      totalMatched,
      campaignsUpdated: uniqueIds.length,
    }, 200, corsHeaders);

  } catch (error: any) {
    console.error('SellX sync error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
