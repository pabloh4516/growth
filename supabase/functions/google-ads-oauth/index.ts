import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { validateAuth, getSupabaseClient, getUserOrganization } from '../_shared/auth.ts';
import {
  getGoogleAdsCredentials,
  GOOGLE_ADS_CONFIG,
  refreshGoogleToken,
  getAccessibleCustomers,
  getCustomerDetails,
  getGoogleUserProfile,
  getValidAccessToken,
  googleAdsSearch,
  updateCampaignStatus,
  updateCampaignBudget,
  addNegativeKeyword,
  GAQL,
} from '../_shared/google-ads-api.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handlePreflight(corsHeaders);
  }

  try {
    const { user } = await validateAuth(req);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || (await req.clone().json().catch(() => ({}))).action;

    switch (action) {
      // =============================================
      // GET AUTH URL
      // =============================================
      case 'get-auth-url': {
        const body = await req.json();
        const { redirectUri, organizationId } = body;

        const creds = getGoogleAdsCredentials();
        if (!creds.clientId) {
          return jsonResponse({ error: 'Google Ads credentials not configured' }, 400, corsHeaders);
        }

        const stateData = {
          platform: 'google_ads',
          userId: user.id,
          organizationId,
          nonce: crypto.randomUUID(),
        };

        const authUrl = new URL(GOOGLE_ADS_CONFIG.authUrl);
        authUrl.searchParams.set('client_id', creds.clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', GOOGLE_ADS_CONFIG.scopes.join(' '));
        authUrl.searchParams.set('state', btoa(JSON.stringify(stateData)));
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');

        return jsonResponse({ authUrl: authUrl.toString() }, 200, corsHeaders);
      }

      // =============================================
      // CALLBACK — Exchange code for tokens
      // =============================================
      case 'callback': {
        const body = await req.json();
        const { code, state, redirectUri } = body;

        let stateData: any = {};
        try { stateData = JSON.parse(atob(state)); } catch { /* ignore */ }

        const creds = getGoogleAdsCredentials();
        if (!creds.clientId || !creds.clientSecret) {
          return jsonResponse({ error: 'Google Ads credentials not configured' }, 400, corsHeaders);
        }

        // Exchange code for tokens
        const tokenResponse = await fetch(GOOGLE_ADS_CONFIG.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        const tokens = await tokenResponse.json();
        if (tokens.error) {
          return jsonResponse({ error: tokens.error_description || tokens.error }, 400, corsHeaders);
        }

        const supabase = getSupabaseClient();
        const organizationId = stateData.organizationId;

        // Get user profile from Google
        const userProfile = await getGoogleUserProfile(tokens.access_token);

        // List accessible Google Ads accounts
        let customerIds: string[] = [];
        try {
          customerIds = await getAccessibleCustomers(tokens.access_token, creds.developerToken);
        } catch (err) {
          console.error('Error listing customers:', err);
          return jsonResponse({
            error: 'Não foi possível listar as contas do Google Ads. Verifique se o Developer Token está ativo.',
            details: String(err),
          }, 400, corsHeaders);
        }

        // Create ad accounts for each customer
        const createdAccounts = [];
        for (const customerId of customerIds) {
          const details = await getCustomerDetails(tokens.access_token, customerId, creds.developerToken);
          if (!details || details.manager) continue;
          if (details.status === 'CANCELED' || details.status === 'CLOSED') continue;

          const expiresAt = tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null;

          const { data: adAccount, error: accountError } = await supabase
            .from('ad_accounts')
            .upsert({
              organization_id: organizationId,
              platform: 'google_ads',
              account_id: customerId,
              account_name: details.descriptiveName,
              access_token_encrypted: tokens.access_token,
              refresh_token_encrypted: tokens.refresh_token,
              token_expires_at: expiresAt,
              developer_token: creds.developerToken,
              status: 'connected',
              currency_code: details.currencyCode,
              timezone: details.timeZone,
              connected_at: new Date().toISOString(),
              metadata: {
                google_ads_status: details.status,
                profile_name: userProfile?.name,
                profile_email: userProfile?.email,
              },
            }, {
              onConflict: 'organization_id,platform,account_id',
            })
            .select()
            .single();

          if (!accountError && adAccount) {
            createdAccounts.push(adAccount);
          }
        }

        return jsonResponse({
          success: true,
          accounts: createdAccounts,
          message: `${createdAccounts.length} conta(s) do Google Ads conectada(s)!`,
        }, 200, corsHeaders);
      }

      // =============================================
      // DISCONNECT
      // =============================================
      case 'disconnect': {
        const body = await req.json();
        const { accountId } = body;

        const supabase = getSupabaseClient();
        await supabase
          .from('ad_accounts')
          .update({
            status: 'disconnected',
            access_token_encrypted: null,
            refresh_token_encrypted: null,
            token_expires_at: null,
          })
          .eq('id', accountId);

        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // =============================================
      // SYNC — Sync campaigns and metrics
      // =============================================
      case 'sync': {
        const body = await req.json();
        const { accountId } = body;

        const supabase = getSupabaseClient();
        const tokenData = await getValidAccessToken(supabase, accountId);
        if (!tokenData) {
          return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
        }

        const { accessToken, account, developerToken } = tokenData;
        const customerId = account.account_id;

        // Sync campaigns
        const campaignResults = await googleAdsSearch(accessToken, customerId, GAQL.campaigns, developerToken);

        let syncedCount = 0;
        for (const row of campaignResults) {
          const c = row.campaign;
          const m = row.metrics;
          const b = row.campaignBudget;

          const statusMap: Record<string, string> = {
            'ENABLED': 'active',
            'PAUSED': 'paused',
            'REMOVED': 'deleted',
          };

          await supabase.from('campaigns').upsert({
            ad_account_id: accountId,
            organization_id: account.organization_id,
            platform: 'google_ads',
            external_id: String(c.id),
            name: c.name,
            status: statusMap[c.status] || 'active',
            objective: c.advertisingChannelType,
            daily_budget: b?.amountMicros ? Number(b.amountMicros) / 1_000_000 : null,
            budget_micros: b?.amountMicros ? Number(b.amountMicros) : null,
            campaign_budget_resource: c.campaignBudget || null,
            impressions: Number(m.impressions || 0),
            clicks: Number(m.clicks || 0),
            cost: Number(m.costMicros || 0) / 1_000_000,
            google_conversions: Number(m.conversions || 0),
            google_conversion_value: Number(m.conversionsValue || 0),
            ctr: Number(m.ctr || 0),
            avg_cpc: Number(m.averageCpc || 0) / 1_000_000,
            last_sync_at: new Date().toISOString(),
          }, {
            onConflict: 'ad_account_id,external_id',
          });

          syncedCount++;
        }

        // Update account last sync
        await supabase
          .from('ad_accounts')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', accountId);

        return jsonResponse({
          success: true,
          synced: syncedCount,
          message: `${syncedCount} campanha(s) sincronizada(s)`,
        }, 200, corsHeaders);
      }

      // =============================================
      // UPDATE CAMPAIGN STATUS
      // =============================================
      case 'update-campaign-status': {
        const body = await req.json();
        const { accountId, campaignExternalId, status } = body;

        const supabase = getSupabaseClient();
        const tokenData = await getValidAccessToken(supabase, accountId);
        if (!tokenData) {
          return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
        }

        const googleStatus = status === 'active' ? 'ENABLED' : 'PAUSED';
        const success = await updateCampaignStatus(
          tokenData.accessToken,
          tokenData.account.account_id,
          campaignExternalId,
          googleStatus,
          tokenData.developerToken
        );

        if (success) {
          await supabase
            .from('campaigns')
            .update({ status })
            .eq('ad_account_id', accountId)
            .eq('external_id', campaignExternalId);
        }

        return jsonResponse({ success }, 200, corsHeaders);
      }

      // =============================================
      // UPDATE CAMPAIGN BUDGET
      // =============================================
      case 'update-campaign-budget': {
        const body = await req.json();
        const { accountId, campaignId, newBudget } = body;

        const supabase = getSupabaseClient();
        const tokenData = await getValidAccessToken(supabase, accountId);
        if (!tokenData) {
          return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
        }

        // Get campaign budget resource
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('campaign_budget_resource')
          .eq('id', campaignId)
          .single();

        if (!campaign?.campaign_budget_resource) {
          return jsonResponse({ error: 'Campaign budget resource not found' }, 400, corsHeaders);
        }

        const amountMicros = Math.round(newBudget * 1_000_000);
        const success = await updateCampaignBudget(
          tokenData.accessToken,
          tokenData.account.account_id,
          campaign.campaign_budget_resource,
          amountMicros,
          tokenData.developerToken
        );

        if (success) {
          await supabase
            .from('campaigns')
            .update({ daily_budget: newBudget, budget_micros: amountMicros })
            .eq('id', campaignId);
        }

        return jsonResponse({ success }, 200, corsHeaders);
      }

      // =============================================
      // ADD NEGATIVE KEYWORD
      // =============================================
      case 'add-negative-keyword': {
        const body = await req.json();
        const { accountId, campaignExternalId, keyword, matchType } = body;

        const supabase = getSupabaseClient();
        const tokenData = await getValidAccessToken(supabase, accountId);
        if (!tokenData) {
          return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
        }

        const success = await addNegativeKeyword(
          tokenData.accessToken,
          tokenData.account.account_id,
          campaignExternalId,
          keyword,
          matchType || 'BROAD',
          tokenData.developerToken
        );

        return jsonResponse({ success }, 200, corsHeaders);
      }

      // =============================================
      // CREATE CAMPAIGN in Google Ads
      // =============================================
      case 'create-campaign': {
        const body = await req.json();
        const { accountId, campaignName, dailyBudget, biddingStrategy, channelType } = body;

        if (!accountId || !campaignName) {
          return jsonResponse({ error: 'Missing accountId or campaignName' }, 400, corsHeaders);
        }

        const supabase = getSupabaseClient();
        const tokenData = await getValidAccessToken(supabase, accountId);
        if (!tokenData) {
          return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
        }

        const { accessToken, account, developerToken } = tokenData;
        const customerId = account.account_id;
        const budgetMicros = Math.round((dailyBudget || 50) * 1_000_000);

        // Step 1: Create campaign budget
        const budgetUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_CONFIG.apiVersion || 'v23'}/customers/${customerId}/campaignBudgets:mutate`;
        const budgetResponse = await fetch(budgetUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operations: [{
              create: {
                name: `Budget - ${campaignName} - ${Date.now()}`,
                amountMicros: budgetMicros.toString(),
                deliveryMethod: 'STANDARD',
              },
            }],
          }),
        });

        const budgetResult = await budgetResponse.json();
        if (!budgetResponse.ok) {
          return jsonResponse({ error: 'Failed to create budget', details: budgetResult }, 400, corsHeaders);
        }

        const budgetResourceName = budgetResult.results?.[0]?.resourceName;
        if (!budgetResourceName) {
          return jsonResponse({ error: 'Budget created but no resource name returned' }, 500, corsHeaders);
        }

        // Step 2: Create campaign
        const campaignUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_CONFIG.apiVersion || 'v23'}/customers/${customerId}/campaigns:mutate`;

        const biddingConfig: Record<string, any> = {};
        const strategy = biddingStrategy || 'MAXIMIZE_CONVERSIONS';
        switch (strategy) {
          case 'MAXIMIZE_CONVERSIONS':
            biddingConfig.maximizeConversions = {};
            break;
          case 'MAXIMIZE_CLICKS':
            biddingConfig.maximizeClicks = {};
            break;
          case 'TARGET_CPA':
            biddingConfig.targetCpa = { targetCpaMicros: String(budgetMicros / 10) };
            break;
          case 'TARGET_ROAS':
            biddingConfig.targetRoas = { targetRoas: 2.0 };
            break;
          case 'MANUAL_CPC':
            biddingConfig.manualCpc = { enhancedCpcEnabled: true };
            break;
          default:
            biddingConfig.maximizeConversions = {};
        }

        const campaignResponse = await fetch(campaignUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operations: [{
              create: {
                name: campaignName,
                status: 'PAUSED',
                advertisingChannelType: channelType || 'SEARCH',
                campaignBudget: budgetResourceName,
                ...biddingConfig,
                networkSettings: {
                  targetGoogleSearch: true,
                  targetSearchNetwork: true,
                  targetContentNetwork: false,
                },
              },
            }],
          }),
        });

        const campaignResult = await campaignResponse.json();
        if (!campaignResponse.ok) {
          return jsonResponse({ error: 'Failed to create campaign', details: campaignResult }, 400, corsHeaders);
        }

        const campaignResourceName = campaignResult.results?.[0]?.resourceName;
        const campaignId = campaignResourceName?.split('/').pop() || null;

        return jsonResponse({
          success: true,
          campaignId,
          campaignResourceName,
          budgetResourceName,
          message: `Campanha "${campaignName}" criada no Google Ads (pausada por padrão)`,
        }, 200, corsHeaders);
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders);
    }
  } catch (error) {
    console.error('Google Ads OAuth error:', error);
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req));
  }
});
