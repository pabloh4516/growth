import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Lead Scoring (Cron Job)
 *
 * Recalculates lead_score for all contacts in every organization based on
 * contact_timeline events with recency decay. Updates contacts.lead_score
 * and contacts.lifecycle_stage based on score thresholds.
 */

// Points per event type
const EVENT_SCORES: Record<string, number> = {
  page_view: 5,
  form_submit: 20,
  email_open: 10,
  email_click: 15,
  sale: 50,
};

// Recency decay: events lose value over time
function recencyMultiplier(eventDate: Date, now: Date): number {
  const daysDiff = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) return 1.0;
  if (daysDiff <= 14) return 0.8;
  if (daysDiff <= 30) return 0.6;
  if (daysDiff <= 60) return 0.3;
  if (daysDiff <= 90) return 0.1;
  return 0.05;
}

// Lifecycle stage based on score
function getLifecycleStage(score: number): string {
  if (score >= 80) return 'customer';
  if (score >= 50) return 'opportunity';
  if (score >= 30) return 'mql';
  if (score >= 10) return 'lead';
  return 'subscriber';
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
      .select('id, name');

    if (!orgs || orgs.length === 0) {
      return jsonResponse({ message: 'No organizations found' }, 200, corsHeaders);
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const results: any[] = [];

    for (const org of orgs) {
      try {
        let contactsUpdated = 0;
        let stageChanges = 0;

        // Get all contacts for this org
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, lead_score, lifecycle_stage')
          .eq('organization_id', org.id);

        if (!contacts || contacts.length === 0) {
          results.push({
            organizationId: org.id,
            contactsUpdated: 0,
            stageChanges: 0,
          });
          continue;
        }

        // Get all timeline events for this org in the last 90 days
        const { data: events } = await supabase
          .from('contact_timeline')
          .select('contact_id, event_type, created_at')
          .eq('organization_id', org.id)
          .gte('created_at', ninetyDaysAgo);

        // Group events by contact_id
        const eventsByContact: Record<string, Array<{ event_type: string; created_at: string }>> = {};
        for (const event of (events || [])) {
          if (!eventsByContact[event.contact_id]) {
            eventsByContact[event.contact_id] = [];
          }
          eventsByContact[event.contact_id].push(event);
        }

        // Calculate score for each contact
        for (const contact of contacts) {
          const contactEvents = eventsByContact[contact.id] || [];

          let score = 0;
          for (const event of contactEvents) {
            const basePoints = EVENT_SCORES[event.event_type] || 0;
            if (basePoints === 0) continue;
            const multiplier = recencyMultiplier(new Date(event.created_at), now);
            score += basePoints * multiplier;
          }

          // Cap score at 100
          score = Math.min(100, Math.round(score));

          const newStage = getLifecycleStage(score);
          const oldStage = contact.lifecycle_stage;

          // Only update if score changed
          if (score !== contact.lead_score || newStage !== oldStage) {
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                lead_score: score,
                lifecycle_stage: newStage,
                updated_at: now.toISOString(),
              })
              .eq('id', contact.id);

            if (!updateError) {
              contactsUpdated++;
              if (newStage !== oldStage) {
                stageChanges++;
              }
            }
          }
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          totalContacts: contacts.length,
          contactsUpdated,
          stageChanges,
        });

      } catch (orgError) {
        console.error(`Error scoring org ${org.id}:`, orgError);
        results.push({
          organizationId: org.id,
          error: orgError.message,
        });
      }
    }

    const totalUpdated = results.reduce((sum, r) => sum + (r.contactsUpdated || 0), 0);
    const totalStageChanges = results.reduce((sum, r) => sum + (r.stageChanges || 0), 0);

    return jsonResponse({
      success: true,
      organizationsProcessed: results.length,
      totalContactsUpdated: totalUpdated,
      totalStageChanges,
      results,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Lead scoring error:', error);
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
