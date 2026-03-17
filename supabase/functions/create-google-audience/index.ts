import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getSupabaseClient } from '../_shared/auth.ts';
import { getValidAccessToken } from '../_shared/google-ads-api.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handlePreflight(corsHeaders);

  try {
    const { user } = await validateAuth(req);
    const { audienceId, accountId } = await req.json();

    if (!audienceId) {
      return jsonResponse({ error: 'Missing audienceId' }, 400, corsHeaders);
    }

    const supabase = getSupabaseClient();

    // Get audience data
    const { data: audience, error: audError } = await supabase
      .from('audiences')
      .select('*')
      .eq('id', audienceId)
      .single();

    if (audError || !audience) {
      return jsonResponse({ error: 'Audience not found' }, 404, corsHeaders);
    }

    // Get ad account with tokens
    let adAccount;
    if (accountId) {
      const { data } = await supabase.from('ad_accounts').select('*').eq('id', accountId).single();
      adAccount = data;
    } else {
      const { data } = await supabase.from('ad_accounts').select('*').eq('organization_id', audience.organization_id).eq('status', 'connected').limit(1).single();
      adAccount = data;
    }

    if (!adAccount) {
      return jsonResponse({ error: 'No connected Google Ads account found' }, 400, corsHeaders);
    }

    // Get valid access token
    const tokenData = await getValidAccessToken(supabase, adAccount.id);
    if (!tokenData) {
      return jsonResponse({ error: 'Invalid or expired Google Ads token' }, 401, corsHeaders);
    }
    const { accessToken, developerToken } = tokenData;
    const customerId = adAccount.account_id;

    // Create user list in Google Ads
    const createResponse = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/userLists:mutate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operations: [{
            create: {
              name: audience.name,
              description: audience.description || `GrowthOS Audience - ${audience.type}`,
              membershipLifeSpan: 540,
              crmBasedUserList: {
                uploadKeyType: 'CONTACT_INFO',
                dataSourceType: 'FIRST_PARTY',
              },
            },
          }],
        }),
      }
    );

    const result = await createResponse.json();

    if (!createResponse.ok) {
      return jsonResponse({ error: 'Failed to create audience in Google Ads', details: result }, 400, corsHeaders);
    }

    // Update audience status
    await supabase.from('audiences').update({ status: 'synced' }).eq('id', audienceId);

    return jsonResponse({ success: true, result }, 200, corsHeaders);
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
});
