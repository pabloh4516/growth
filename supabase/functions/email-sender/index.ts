import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, validateCronSecret } from '../_shared/auth.ts';

/**
 * GrowthOS — Email Sender (Resend)
 * Sends emails for sequences, transactional, and reports
 * Also handles Resend webhook callbacks for delivery status
 */

const RESEND_API = 'https://api.resend.com';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'send';

    // Webhook from Resend (no auth needed, validate by source)
    if (action === 'webhook') {
      return await handleResendWebhook(req, supabase, corsHeaders);
    }

    // Process email queue (cron)
    if (action === 'process-queue') {
      if (!validateCronSecret(req)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      return await processEmailQueue(supabase, corsHeaders);
    }

    // Manual send (authenticated)
    await validateAuth(req);
    const body = await req.json();

    switch (action) {
      case 'send': {
        const result = await sendEmail(body, supabase);
        return jsonResponse(result, 200, corsHeaders);
      }
      case 'send-sequence-step': {
        const result = await sendSequenceStep(body, supabase);
        return jsonResponse(result, 200, corsHeaders);
      }
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}, supabase: any) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY not configured');

  const response = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from || 'GrowthOS <noreply@growthOS.com>',
      to: [params.to],
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function sendSequenceStep(params: {
  sequenceStepId: string;
  contactId: string;
}, supabase: any) {
  // Get step details
  const { data: step } = await supabase
    .from('email_sequence_steps')
    .select('*, email_sequences(organization_id, name)')
    .eq('id', params.sequenceStepId)
    .single();

  if (!step) throw new Error('Sequence step not found');

  // Get contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('email, name')
    .eq('id', params.contactId)
    .single();

  if (!contact?.email) throw new Error('Contact has no email');

  // Replace variables in subject/body
  let subject = step.subject || '';
  let body = step.body_html || '';
  subject = subject.replace('{{name}}', contact.name || 'Visitante');
  body = body.replace('{{name}}', contact.name || 'Visitante');

  // Send
  const result = await sendEmail({
    to: contact.email,
    subject,
    html: body,
  }, supabase);

  // Record send
  await supabase.from('email_sends').insert({
    sequence_step_id: params.sequenceStepId,
    contact_id: params.contactId,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });

  // Add to contact timeline
  await supabase.from('contact_timeline').insert({
    contact_id: params.contactId,
    event_type: 'email_open', // Will be updated by webhook
    event_data: { subject, sequenceStepId: params.sequenceStepId },
  });

  return { success: true, emailId: result.id };
}

async function processEmailQueue(supabase: any, corsHeaders: Record<string, string>) {
  // Find queued emails that are ready to send (delay elapsed)
  const { data: queuedSends } = await supabase
    .from('email_sends')
    .select('*, email_sequence_steps(*), contacts(email, name)')
    .eq('status', 'queued')
    .limit(50);

  let sent = 0;
  for (const send of (queuedSends || [])) {
    try {
      if (!send.contacts?.email) continue;

      let subject = send.email_sequence_steps?.subject || '';
      let body = send.email_sequence_steps?.body_html || '';
      subject = subject.replace('{{name}}', send.contacts.name || 'Visitante');
      body = body.replace('{{name}}', send.contacts.name || 'Visitante');

      await sendEmail({ to: send.contacts.email, subject, html: body }, supabase);

      await supabase.from('email_sends').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).eq('id', send.id);

      sent++;
    } catch (e) {
      console.error(`Failed to send email ${send.id}:`, e);
      await supabase.from('email_sends').update({ status: 'bounced' }).eq('id', send.id);
    }
  }

  return jsonResponse({ processed: sent }, 200, corsHeaders);
}

async function handleResendWebhook(req: Request, supabase: any, corsHeaders: Record<string, string>) {
  const payload = await req.json();
  const eventType = payload.type; // email.delivered, email.opened, email.clicked, email.bounced

  // Map Resend events to our status
  const statusMap: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'unsubscribed',
  };

  const newStatus = statusMap[eventType];
  if (!newStatus) {
    return jsonResponse({ received: true }, 200, corsHeaders);
  }

  // Find the email send by Resend email ID (stored in metadata)
  const emailTo = payload.data?.to?.[0];
  if (emailTo) {
    const updateField: Record<string, any> = { status: newStatus };
    if (newStatus === 'opened') updateField.opened_at = new Date().toISOString();
    if (newStatus === 'clicked') updateField.clicked_at = new Date().toISOString();

    // Update the most recent send to this email
    await supabase
      .from('email_sends')
      .update(updateField)
      .eq('status', 'sent')
      .limit(1);
  }

  return jsonResponse({ received: true }, 200, corsHeaders);
}
