import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Churn Predictor (Cron Job)
 * Recalculates churn risk score for all contacts based on:
 * - Days since last activity
 * - Email engagement (opens, clicks)
 * - Deal stage stagnation
 * - Purchase recency
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
    // Get all organizations
    const { data: orgs } = await supabase.from('organizations').select('id');

    let totalUpdated = 0;

    for (const org of (orgs || [])) {
      // Get all contacts with their last activity
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, last_activity_at, lifecycle_stage, lead_score')
        .eq('organization_id', org.id);

      if (!contacts || contacts.length === 0) continue;

      for (const contact of contacts) {
        let churnScore = 0;
        const now = new Date();

        // Factor 1: Days since last activity (max 40 points)
        if (contact.last_activity_at) {
          const daysSince = Math.floor((now.getTime() - new Date(contact.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince > 30) churnScore += 40;
          else if (daysSince > 14) churnScore += 25;
          else if (daysSince > 7) churnScore += 15;
          else if (daysSince > 3) churnScore += 5;
        } else {
          churnScore += 30; // No activity at all
        }

        // Factor 2: Email engagement (max 20 points)
        const { data: recentEmails } = await supabase
          .from('email_sends')
          .select('status')
          .eq('contact_id', contact.id)
          .gte('sent_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (recentEmails && recentEmails.length > 0) {
          const opened = recentEmails.filter((e: any) => e.status === 'opened' || e.status === 'clicked').length;
          const openRate = opened / recentEmails.length;
          if (openRate === 0) churnScore += 20;
          else if (openRate < 0.1) churnScore += 15;
          else if (openRate < 0.3) churnScore += 5;
        }

        // Factor 3: Deal stagnation (max 20 points)
        const { data: deals } = await supabase
          .from('deals')
          .select('created_at, closed_at, won')
          .eq('contact_id', contact.id)
          .is('closed_at', null);

        if (deals && deals.length > 0) {
          const oldestOpenDeal = deals.sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )[0];
          const dealDays = Math.floor((now.getTime() - new Date(oldestOpenDeal.created_at).getTime()) / (1000 * 60 * 60 * 24));
          if (dealDays > 30) churnScore += 20;
          else if (dealDays > 14) churnScore += 10;
        }

        // Factor 4: Low lead score (max 20 points)
        if ((contact.lead_score || 0) < 20) churnScore += 20;
        else if ((contact.lead_score || 0) < 40) churnScore += 10;

        // Cap at 100
        churnScore = Math.min(100, churnScore);

        // Update contact
        await supabase
          .from('contacts')
          .update({ churn_risk_score: churnScore })
          .eq('id', contact.id);

        totalUpdated++;
      }
    }

    return jsonResponse({
      success: true,
      contactsUpdated: totalUpdated,
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
