import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Utmify Sync (API Pull)
 *
 * Busca vendas da API da Utmify usando o token da API.
 * Endpoint: POST https://api.utmify.com.br/api-credentials/orders
 * Header: x-api-token
 *
 * Pode ser chamado via cron ou manualmente.
 */

const UTMIFY_API_URL = 'https://api.utmify.com.br/api-credentials/orders';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Auth: cron secret or user token
    const isCron = validateCronSecret(req);
    let orgFilter: string | null = null;

    if (!isCron) {
      await validateAuth(req);
      const body = await req.json().catch(() => ({}));
      orgFilter = body.organizationId || null;
    }

    // Get all active Utmify configs
    let query = supabase
      .from('utmify_config')
      .select('*')
      .eq('is_active', true);

    if (orgFilter) {
      query = query.eq('organization_id', orgFilter);
    }

    const { data: configs } = await query;

    if (!configs || configs.length === 0) {
      return jsonResponse({ message: 'No active Utmify configs' }, 200, corsHeaders);
    }

    const results = [];

    for (const config of configs) {
      if (!config.api_token) {
        results.push({ orgId: config.organization_id, error: 'No API token configured' });
        continue;
      }

      try {
        // Fetch orders from Utmify API
        // Try different date ranges - last 30 days
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);

        const response = await fetch(UTMIFY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-token': config.api_token,
          },
          body: JSON.stringify({
            dateFrom: dateFrom.toISOString().split('T')[0],
            dateTo: new Date().toISOString().split('T')[0],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          results.push({
            orgId: config.organization_id,
            error: `Utmify API error: ${response.status} - ${errorText}`,
          });
          continue;
        }

        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data.orders || data.data || []);

        let savedCount = 0;
        let matchedCount = 0;

        for (const order of orders) {
          // Extract tracking parameters
          const tracking = order.trackingParameters || order.tracking || {};
          const revenue = order.commission?.totalPriceInCents
            ? order.commission.totalPriceInCents / 100
            : (order.commission?.userCommissionInCents
              ? order.commission.userCommissionInCents / 100
              : (order.amount || order.revenue || order.value || 0));

          const status = order.status || 'paid';

          // Upsert the sale
          const { data: sale, error: saleError } = await supabase
            .from('utmify_sales')
            .upsert({
              organization_id: config.organization_id,
              order_id: order.orderId || order.id || order.order_id,
              status,
              revenue,
              currency: order.commission?.currency || order.currency || 'BRL',
              utm_source: tracking.utm_source || order.utm_source || null,
              utm_campaign: tracking.utm_campaign || order.utm_campaign || null,
              utm_medium: tracking.utm_medium || order.utm_medium || null,
              utm_content: tracking.utm_content || order.utm_content || null,
              utm_term: tracking.utm_term || order.utm_term || null,
              src: tracking.src || order.src || null,
              sck: tracking.sck || order.sck || null,
              customer_email: order.customer?.email || order.email || null,
              customer_name: order.customer?.name || order.name || null,
              customer_phone: order.customer?.phone || order.phone || null,
              product_name: order.products?.[0]?.name || order.product_name || order.productName || null,
              sale_date: order.approvedDate || order.approved_date || order.createdAt || order.created_at || new Date().toISOString(),
              received_at: new Date().toISOString(),
              raw_payload: order,
            }, {
              onConflict: 'organization_id,order_id',
            })
            .select()
            .single();

          if (saleError) {
            console.error('Error saving sale:', saleError);
            continue;
          }

          savedCount++;

          // Match to campaign (only for paid orders)
          if (sale && status === 'paid') {
            let matchedCampaignId: string | null = null;
            let matchConfidence = 0;

            // Strategy 1: sck/src contains campaign external_id
            if (tracking.sck || tracking.src || order.sck || order.src) {
              const searchValue = tracking.sck || tracking.src || order.sck || order.src;
              const { data: campaigns } = await supabase
                .from('campaigns')
                .select('id, external_id, name')
                .eq('organization_id', config.organization_id)
                .eq('platform', 'google_ads');

              if (campaigns) {
                for (const campaign of campaigns) {
                  if (campaign.external_id && searchValue.includes(campaign.external_id)) {
                    matchedCampaignId = campaign.id;
                    matchConfidence = 0.95;
                    break;
                  }
                }
              }
            }

            // Strategy 2: utm_campaign name match
            const utmCampaign = tracking.utm_campaign || order.utm_campaign;
            if (!matchedCampaignId && utmCampaign) {
              const { data: campaigns } = await supabase
                .from('campaigns')
                .select('id, name')
                .eq('organization_id', config.organization_id)
                .ilike('name', `%${utmCampaign}%`);

              if (campaigns && campaigns.length === 1) {
                matchedCampaignId = campaigns[0].id;
                matchConfidence = 0.7;
              } else if (campaigns && campaigns.length > 1) {
                const exact = campaigns.find(c =>
                  c.name.toLowerCase() === utmCampaign.toLowerCase()
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

            // Update sale with match
            if (matchedCampaignId) {
              await supabase
                .from('utmify_sales')
                .update({ matched_campaign_id: matchedCampaignId, match_confidence: matchConfidence })
                .eq('id', sale.id);
              matchedCount++;
            }
          }
        }

        // Recalculate ROAS for all matched campaigns
        const { data: matchedCampaigns } = await supabase
          .from('utmify_sales')
          .select('matched_campaign_id')
          .eq('organization_id', config.organization_id)
          .eq('status', 'paid')
          .not('matched_campaign_id', 'is', null);

        const uniqueCampaignIds = Array.from(
          new Set((matchedCampaigns || []).map((s: any) => s.matched_campaign_id))
        );

        for (const campaignId of uniqueCampaignIds) {
          const { data: salesForCampaign } = await supabase
            .from('utmify_sales')
            .select('revenue')
            .eq('matched_campaign_id', campaignId)
            .eq('status', 'paid');

          if (salesForCampaign) {
            const realSalesCount = salesForCampaign.length;
            const realRevenue = salesForCampaign.reduce((sum, s) => sum + Number(s.revenue), 0);

            const { data: campaign } = await supabase
              .from('campaigns')
              .select('cost')
              .eq('id', campaignId)
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
              .eq('id', campaignId);
          }
        }

        results.push({
          orgId: config.organization_id,
          ordersFound: orders.length,
          saved: savedCount,
          matched: matchedCount,
          campaignsUpdated: uniqueCampaignIds.length,
        });

      } catch (e) {
        console.error(`Error syncing Utmify for org ${config.organization_id}:`, e);
        results.push({ orgId: config.organization_id, error: e.message });
      }
    }

    return jsonResponse({ success: true, results }, 200, corsHeaders);

  } catch (error) {
    console.error('Utmify sync error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
