import { NextRequest, NextResponse } from "next/server";

// GrowthOS — Cron Scheduler
// Called by Vercel Cron or external scheduler.
// Jobs: sync, analysis, scoring, alerts, funnel, email-queue, all
// See vercel.json for schedule configuration.

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type JobResult = { job: string; status: string; data?: unknown; error?: string };

async function invokeEdgeFunction(name: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": CRON_SECRET || "",
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${name} failed: ${response.status} - ${text}`);
  }

  return response.json();
}

async function runJob(job: string): Promise<JobResult> {
  try {
    switch (job) {
      case "sync": {
        const [adsData, utmifyData] = await Promise.allSettled([
          invokeEdgeFunction("google-ads-sync"),
          invokeEdgeFunction("utmify-sync"),
        ]);
        return {
          job: "sync",
          status: "ok",
          data: {
            googleAds: adsData.status === "fulfilled" ? adsData.value : adsData.reason?.message,
            utmify: utmifyData.status === "fulfilled" ? utmifyData.value : utmifyData.reason?.message,
          },
        };
      }

      case "analysis": {
        const data = await invokeEdgeFunction("ai-analysis");
        return { job: "analysis", status: "ok", data };
      }

      case "scoring": {
        const [leadData, healthData, churnData] = await Promise.allSettled([
          invokeEdgeFunction("lead-scoring"),
          invokeEdgeFunction("health-score"),
          invokeEdgeFunction("churn-predictor"),
        ]);
        return {
          job: "scoring",
          status: "ok",
          data: {
            leadScoring: leadData.status === "fulfilled" ? leadData.value : leadData.reason?.message,
            healthScore: healthData.status === "fulfilled" ? healthData.value : healthData.reason?.message,
            churnPredictor: churnData.status === "fulfilled" ? churnData.value : churnData.reason?.message,
          },
        };
      }

      case "alerts": {
        const data = await invokeEdgeFunction("alert-checker");
        return { job: "alerts", status: "ok", data };
      }

      case "funnel": {
        const data = await invokeEdgeFunction("funnel-snapshot");
        return { job: "funnel", status: "ok", data };
      }

      case "email-queue": {
        const data = await invokeEdgeFunction("email-sender", { action: "process-queue" });
        return { job: "email-queue", status: "ok", data };
      }

      case "financial": {
        const data = await invokeEdgeFunction("financial-sync");
        return { job: "financial", status: "ok", data };
      }

      case "ltv": {
        const data = await invokeEdgeFunction("ltv-calculator");
        return { job: "ltv", status: "ok", data };
      }

      case "landing-pages": {
        const data = await invokeEdgeFunction("landing-page-metrics");
        return { job: "landing-pages", status: "ok", data };
      }

      case "competitors": {
        const data = await invokeEdgeFunction("competitor-monitor");
        return { job: "competitors", status: "ok", data };
      }

      case "automations": {
        const data = await invokeEdgeFunction("automation-engine");
        return { job: "automations", status: "ok", data };
      }

      case "all": {
        // Run all jobs sequentially to avoid overwhelming the system
        const results: JobResult[] = [];
        for (const j of ["sync", "scoring", "alerts", "funnel", "analysis", "email-queue", "financial", "ltv", "landing-pages", "automations"]) {
          const result = await runJob(j);
          results.push(result);
        }
        return { job: "all", status: "ok", data: results };
      }

      default:
        return { job, status: "error", error: `Unknown job: ${job}` };
    }
  } catch (error: any) {
    console.error(`Cron job "${job}" failed:`, error);
    return { job, status: "error", error: error.message };
  }
}

function validateCronAuth(request: NextRequest): NextResponse | null {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const isAuthorized = authHeader === `Bearer ${CRON_SECRET}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const job = request.nextUrl.searchParams.get("job") || "all";
  const result = await runJob(job);

  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 500,
  });
}

// Also support POST for manual triggers from dashboard
export async function POST(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const job = body.job || request.nextUrl.searchParams.get("job") || "all";

  const result = await runJob(job);

  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 500,
  });
}
