import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Financial Sync (Cron Job)
 *
 * Auto-populates financial_records from daily metrics and sales data.
 * For each organization with connected ad accounts:
 *   1. Sum today's ad spend from metrics_daily → financial_record type='ad_spend'
 *   2. Sum today's paid revenue from utmify_sales → financial_record type='revenue'
 *   3. Sum today's refunds from utmify_sales → financial_record type='refund'
 * Uses upsert logic to avoid duplicate records for the same date+type+org.
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
    // Get organizations that have connected ad accounts
    const { data: adAccounts } = await supabase
      .from('ad_accounts')
      .select('organization_id')
      .eq('is_active', true);

    if (!adAccounts || adAccounts.length === 0) {
      return jsonResponse({ message: 'No organizations with ad accounts' }, 200, corsHeaders);
    }

    // Deduplicate org IDs
    const orgIds = [...new Set(adAccounts.map((a: any) => a.organization_id))];

    const today = new Date().toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;
    let recordsCreated = 0;

    for (const orgId of orgIds) {
      try {
        // 1. Sum today's ad spend from metrics_daily
        const { data: spendMetrics } = await supabase
          .from('metrics_daily')
          .select('spend')
          .eq('organization_id', orgId)
          .eq('date', today);

        const totalSpend = (spendMetrics || []).reduce(
          (sum: number, m: any) => sum + Number(m.spend || 0), 0
        );

        if (totalSpend > 0) {
          // Check if record already exists
          const { data: existingSpend } = await supabase
            .from('financial_records')
            .select('id')
            .eq('organization_id', orgId)
            .eq('type', 'ad_spend')
            .eq('date', today)
            .maybeSingle();

          if (existingSpend) {
            // Update existing record
            await supabase
              .from('financial_records')
              .update({
                amount: totalSpend,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingSpend.id);
          } else {
            // Insert new record
            await supabase.from('financial_records').insert({
              organization_id: orgId,
              type: 'ad_spend',
              date: today,
              amount: totalSpend,
              description: `Gasto com anúncios - ${today}`,
              created_at: new Date().toISOString(),
            });
            recordsCreated++;
          }
        }

        // 2. Sum today's paid revenue from utmify_sales
        const { data: paidSales } = await supabase
          .from('utmify_sales')
          .select('revenue')
          .eq('organization_id', orgId)
          .eq('status', 'paid')
          .gte('sale_date', todayStart)
          .lte('sale_date', todayEnd);

        const totalRevenue = (paidSales || []).reduce(
          (sum: number, s: any) => sum + Number(s.revenue || 0), 0
        );

        if (totalRevenue > 0) {
          const { data: existingRevenue } = await supabase
            .from('financial_records')
            .select('id')
            .eq('organization_id', orgId)
            .eq('type', 'revenue')
            .eq('date', today)
            .maybeSingle();

          if (existingRevenue) {
            await supabase
              .from('financial_records')
              .update({
                amount: totalRevenue,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingRevenue.id);
          } else {
            await supabase.from('financial_records').insert({
              organization_id: orgId,
              type: 'revenue',
              date: today,
              amount: totalRevenue,
              description: `Receita de vendas - ${today}`,
              created_at: new Date().toISOString(),
            });
            recordsCreated++;
          }
        }

        // 3. Sum today's refunds from utmify_sales (refunded or chargedback)
        const { data: refundSales } = await supabase
          .from('utmify_sales')
          .select('revenue')
          .eq('organization_id', orgId)
          .in('status', ['refunded', 'chargedback'])
          .gte('sale_date', todayStart)
          .lte('sale_date', todayEnd);

        const totalRefunds = (refundSales || []).reduce(
          (sum: number, s: any) => sum + Number(s.revenue || 0), 0
        );

        if (totalRefunds > 0) {
          const { data: existingRefund } = await supabase
            .from('financial_records')
            .select('id')
            .eq('organization_id', orgId)
            .eq('type', 'refund')
            .eq('date', today)
            .maybeSingle();

          if (existingRefund) {
            await supabase
              .from('financial_records')
              .update({
                amount: totalRefunds,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingRefund.id);
          } else {
            await supabase.from('financial_records').insert({
              organization_id: orgId,
              type: 'refund',
              date: today,
              amount: totalRefunds,
              description: `Reembolsos e chargebacks - ${today}`,
              created_at: new Date().toISOString(),
            });
            recordsCreated++;
          }
        }
      } catch (orgError) {
        console.error(`[financial-sync] Error processing org ${orgId}:`, orgError.message);
      }
    }

    return jsonResponse({
      success: true,
      date: today,
      organizationsProcessed: orgIds.length,
      recordsCreated,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[financial-sync] Error:', error.message);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
