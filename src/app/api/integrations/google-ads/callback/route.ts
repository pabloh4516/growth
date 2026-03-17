import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/integrations?error=missing_params`);
  }

  try {
    const stateData = JSON.parse(atob(state));
    const organizationId = stateData.organizationId || stateData.orgId;

    const supabase = createClient();

    const { data, error } = await supabase.functions.invoke("google-ads-oauth", {
      body: {
        action: "callback",
        organizationId,
        code,
        state,
        redirectUri: `${origin}/api/integrations/google-ads/callback`,
      },
    });

    if (error) {
      console.error("Google Ads OAuth error:", error);
      return NextResponse.redirect(`${origin}/integrations?error=oauth_failed`);
    }

    return NextResponse.redirect(`${origin}/integrations?success=google_ads_connected`);
  } catch (err) {
    console.error("Google Ads callback error:", err);
    return NextResponse.redirect(`${origin}/integrations?error=callback_failed`);
  }
}
