/**
 * GrowthOS — Shared Auth Utilities for Edge Functions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

export function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

export function getSupabaseClientWithAuth(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}

/**
 * Validate user auth and return user + organization
 */
export async function validateAuth(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  const supabase = getSupabaseClientWithAuth(authHeader);

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return { user, supabase };
}

/**
 * Get user's organization from request
 */
export async function getUserOrganization(userId: string, orgId?: string) {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('organization_members')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', userId);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    throw new Error('User has no organization');
  }

  return {
    organizationId: data.organization_id,
    role: data.role,
    organization: data.organizations,
  };
}

/**
 * Validate cron secret for scheduled jobs
 */
export function validateCronSecret(req: Request): boolean {
  const secret = req.headers.get('x-cron-secret');
  return secret === Deno.env.get('CRON_SECRET');
}
