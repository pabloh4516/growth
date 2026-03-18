import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — LTV Calculator (Cron Job)
 *
 * Calculates Lifetime Value by customer segment for each organization.
 * Segments:
 *   - 'novo': 1 purchase
 *   - 'recorrente': 2-5 purchases
 *   - 'vip': 6+ purchases
 *   - 'inativo': no purchase in last 90 days
 * Aggregates avg_ltv, contact_count, avg_purchase_frequency, avg_ticket
 * and upserts into ltv_by_segment table.
 */

const INACTIVITY_DAYS = 90;

interface CustomerData {
  email: string;
  totalRevenue: number;
  purchaseCount: number;
  firstPurchase: string;
  lastPurchase: string;
}

function getSegment(customer: CustomerData, now: Date): string {
  const lastPurchaseDate = new Date(customer.lastPurchase);
  const daysSinceLastPurchase = Math.floor(
    (now.getTime() - lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastPurchase >= INACTIVITY_DAYS) {
    return 'inativo';
  }
  if (customer.purchaseCount >= 6) {
    return 'vip';
  }
  if (customer.purchaseCount >= 2) {
    return 'recorrente';
  }
  return 'novo';
}

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
    // Get all organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id');

    if (!orgs || orgs.length === 0) {
      return jsonResponse({ message: 'No organizations found' }, 200, corsHeaders);
    }

    const now = new Date();
    let orgsProcessed = 0;

    for (const org of orgs) {
      try {
        // Get all paid sales for this organization
        const { data: sales } = await supabase
          .from('utmify_sales')
          .select('customer_email, revenue, sale_date')
          .eq('organization_id', org.id)
          .eq('status', 'paid')
          .order('sale_date', { ascending: true });

        if (!sales || sales.length === 0) {
          continue;
        }

        // Group by customer_email
        const customerMap = new Map<string, CustomerData>();

        for (const sale of sales) {
          const email = (sale.customer_email || '').toLowerCase().trim();
          if (!email) continue;

          const existing = customerMap.get(email);
          const revenue = Number(sale.revenue || 0);

          if (existing) {
            existing.totalRevenue += revenue;
            existing.purchaseCount += 1;
            if (sale.sale_date < existing.firstPurchase) {
              existing.firstPurchase = sale.sale_date;
            }
            if (sale.sale_date > existing.lastPurchase) {
              existing.lastPurchase = sale.sale_date;
            }
          } else {
            customerMap.set(email, {
              email,
              totalRevenue: revenue,
              purchaseCount: 1,
              firstPurchase: sale.sale_date,
              lastPurchase: sale.sale_date,
            });
          }
        }

        // Segment customers and aggregate
        const segmentData: Record<string, {
          totalLtv: number;
          count: number;
          totalPurchases: number;
          totalRevenue: number;
        }> = {
          novo: { totalLtv: 0, count: 0, totalPurchases: 0, totalRevenue: 0 },
          recorrente: { totalLtv: 0, count: 0, totalPurchases: 0, totalRevenue: 0 },
          vip: { totalLtv: 0, count: 0, totalPurchases: 0, totalRevenue: 0 },
          inativo: { totalLtv: 0, count: 0, totalPurchases: 0, totalRevenue: 0 },
        };

        for (const customer of customerMap.values()) {
          const segment = getSegment(customer, now);
          const data = segmentData[segment];
          data.totalLtv += customer.totalRevenue;
          data.count += 1;
          data.totalPurchases += customer.purchaseCount;
          data.totalRevenue += customer.totalRevenue;
        }

        // Upsert into ltv_by_segment for each segment
        for (const [segment, data] of Object.entries(segmentData)) {
          if (data.count === 0) continue;

          const avgLtv = data.totalLtv / data.count;
          const avgPurchaseFrequency = data.totalPurchases / data.count;
          const avgTicket = data.totalRevenue / data.totalPurchases;

          // Check if record exists
          const { data: existing } = await supabase
            .from('ltv_by_segment')
            .select('id')
            .eq('organization_id', org.id)
            .eq('segment', segment)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('ltv_by_segment')
              .update({
                avg_ltv: avgLtv,
                contact_count: data.count,
                avg_purchase_frequency: avgPurchaseFrequency,
                avg_ticket: avgTicket,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
          } else {
            await supabase.from('ltv_by_segment').insert({
              organization_id: org.id,
              segment,
              avg_ltv: avgLtv,
              contact_count: data.count,
              avg_purchase_frequency: avgPurchaseFrequency,
              avg_ticket: avgTicket,
              updated_at: new Date().toISOString(),
            });
          }
        }

        orgsProcessed++;
      } catch (orgError) {
        console.error(`[ltv-calculator] Error processing org ${org.id}:`, orgError.message);
      }
    }

    return jsonResponse({
      success: true,
      orgsProcessed,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[ltv-calculator] Error:', error.message);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
