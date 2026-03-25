/**
 * GrowthOS — Google Ads API Helpers
 * Extracted and adapted from TrackVio
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const GOOGLE_ADS_API_VERSION = 'v23';

// =============================================
// CREDENTIALS
// =============================================

export function getGoogleAdsCredentials() {
  return {
    clientId: Deno.env.get('GOOGLE_ADS_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') || '',
    developerToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || '',
  };
}

export const GOOGLE_ADS_CONFIG = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

// =============================================
// TOKEN MANAGEMENT
// =============================================

export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

export async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<{ accessToken: string; account: Record<string, any>; developerToken: string } | null> {
  const { data: account, error } = await supabase
    .from('ad_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    console.error('Account not found:', error);
    return null;
  }

  const creds = getGoogleAdsCredentials();
  const tokenExpiry = account.token_expires_at ? new Date(account.token_expires_at) : null;
  const isExpired = !tokenExpiry || tokenExpiry <= new Date();

  if (isExpired && account.refresh_token_encrypted) {
    console.log('Token expired, refreshing...');
    const newTokens = await refreshGoogleToken(
      account.refresh_token_encrypted,
      creds.clientId,
      creds.clientSecret
    );

    if (newTokens) {
      const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

      await supabase
        .from('ad_accounts')
        .update({
          access_token_encrypted: newTokens.access_token,
          token_expires_at: expiresAt,
          status: 'connected',
        })
        .eq('id', accountId);

      return { accessToken: newTokens.access_token, account, developerToken: creds.developerToken };
    } else {
      await supabase.from('ad_accounts').update({ status: 'expired' }).eq('id', accountId);
      return null;
    }
  }

  return { accessToken: account.access_token_encrypted, account, developerToken: creds.developerToken };
}

// =============================================
// GOOGLE ADS API CALLS
// =============================================

export async function googleAdsSearch(
  accessToken: string,
  customerId: string,
  query: string,
  developerToken: string
): Promise<any[]> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Ads API error:', response.status, errorText);
      throw new Error(`Google Ads API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function getAccessibleCustomers(
  accessToken: string,
  developerToken: string
): Promise<string[]> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list customers: ${errorText}`);
  }

  const data = await response.json();
  return data.resourceNames?.map((rn: string) => rn.replace('customers/', '')) || [];
}

export async function getCustomerDetails(
  accessToken: string,
  customerId: string,
  developerToken: string
): Promise<{ descriptiveName: string; currencyCode: string; timeZone: string; manager: boolean; status: string } | null> {
  try {
    const results = await googleAdsSearch(
      accessToken,
      customerId,
      `SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer LIMIT 1`,
      developerToken
    );

    if (results.length === 0) return null;

    const customer = results[0].customer;
    return {
      descriptiveName: customer.descriptiveName || `Google Ads ${customerId}`,
      currencyCode: customer.currencyCode || 'BRL',
      timeZone: customer.timeZone || 'America/Sao_Paulo',
      manager: customer.manager || false,
      status: customer.status || 'UNKNOWN',
    };
  } catch {
    return null;
  }
}

export async function getGoogleUserProfile(
  accessToken: string
): Promise<{ name: string; email: string; picture: string } | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// =============================================
// CAMPAIGN MUTATIONS
// =============================================

export async function updateCampaignStatus(
  accessToken: string,
  customerId: string,
  campaignId: string,
  status: 'ENABLED' | 'PAUSED',
  developerToken: string
): Promise<boolean> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/campaigns:mutate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        updateMask: 'status',
        update: {
          resourceName: `customers/${customerId}/campaigns/${campaignId}`,
          status,
        },
      }],
    }),
  });

  if (!response.ok) {
    console.error('Update campaign status error:', await response.text());
    return false;
  }
  return true;
}

export async function updateCampaignBudget(
  accessToken: string,
  customerId: string,
  campaignBudgetResource: string,
  amountMicros: number,
  developerToken: string
): Promise<boolean> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/campaignBudgets:mutate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        updateMask: 'amount_micros',
        update: {
          resourceName: campaignBudgetResource,
          amountMicros: amountMicros.toString(),
        },
      }],
    }),
  });

  if (!response.ok) {
    console.error('Update budget error:', await response.text());
    return false;
  }
  return true;
}

export async function addNegativeKeyword(
  accessToken: string,
  customerId: string,
  campaignId: string,
  keyword: string,
  matchType: 'EXACT' | 'PHRASE' | 'BROAD',
  developerToken: string
): Promise<boolean> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/campaignCriteria:mutate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operations: [{
        create: {
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          negative: true,
          keyword: {
            text: keyword,
            matchType,
          },
        },
      }],
    }),
  });

  if (!response.ok) {
    console.error('Add negative keyword error:', await response.text());
    return false;
  }
  return true;
}

// =============================================
// GAQL QUERIES
// =============================================

export const GAQL = {
  campaigns: `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.campaign_budget, campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date DURING TODAY
    ORDER BY metrics.cost_micros DESC
  `,

  campaignsByDateRange: (startDate: string, endDate: string) => `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.campaign_budget, campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY segments.date DESC, metrics.cost_micros DESC
  `,

  adGroups: (campaignId: string) => `
    SELECT
      ad_group.id, ad_group.name, ad_group.status,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND ad_group.status != 'REMOVED'
  `,

  keywords: (adGroupId?: string) => `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.effective_cpc_bid_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions,
      ad_group_criterion.quality_info.quality_score,
      campaign.id, campaign.name,
      ad_group.id, ad_group.name
    FROM keyword_view
    ${adGroupId ? `WHERE ad_group.id = ${adGroupId} AND` : 'WHERE'}
      ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 1000
  `,

  searchTerms: (campaignId?: string) => `
    SELECT
      search_term_view.search_term,
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr
    FROM search_term_view
    ${campaignId ? `WHERE campaign.id = ${campaignId}` : ''}
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `,

  geoReport: (campaignId?: string) => `
    SELECT
      campaign.id, campaign.name,
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM geographic_view
    ${campaignId ? `WHERE campaign.id = ${campaignId}` : ''}
    ORDER BY metrics.impressions DESC
    LIMIT 500
  `,

  placements: (campaignId?: string) => `
    SELECT
      campaign.id, campaign.name,
      group_placement_view.placement,
      group_placement_view.placement_type,
      group_placement_view.target_url,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM group_placement_view
    ${campaignId ? `WHERE campaign.id = ${campaignId}` : ''}
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `,

  deviceReport: (campaignId?: string) => `
    SELECT
      campaign.id, campaign.name,
      segments.device,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    ${campaignId ? `WHERE campaign.id = ${campaignId} AND` : 'WHERE'}
      campaign.status != 'REMOVED'
  `,

  hourlyReport: (campaignId?: string) => `
    SELECT
      campaign.id, campaign.name,
      segments.hour,
      segments.day_of_week,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    ${campaignId ? `WHERE campaign.id = ${campaignId} AND` : 'WHERE'}
      campaign.status != 'REMOVED'
  `,

  audiences: () => `
    SELECT
      user_list.id,
      user_list.name,
      user_list.description,
      user_list.membership_status,
      user_list.size_for_display,
      user_list.size_for_search,
      user_list.type,
      user_list.membership_life_span
    FROM user_list
    WHERE user_list.membership_status = 'OPEN'
    ORDER BY user_list.name ASC
    LIMIT 500
  `,
};
