"use client";

import { useEffect, useRef, useCallback, createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";

const supabase = createClient();

// Sync intervals
const GOOGLE_ADS_SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes
const STALE_THRESHOLD = 90 * 1000; // 90 seconds — consider stale after this

interface SyncState {
  lastGoogleSync: string | null;
  isSyncing: boolean;
  syncNow: () => void;
}

const SyncContext = createContext<SyncState>({
  lastGoogleSync: null,
  isSyncing: false,
  syncNow: () => {},
});

export const useSyncState = () => useContext(SyncContext);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const hasSyncedOnMount = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastGoogleSync, setLastGoogleSync] = useState<string | null>(null);

  // ─── Google Ads Auto-Sync ────────────────────────────
  const syncGoogleAds = useCallback(async (force = false) => {
    if (!orgId || isSyncing) return;

    try {
      // Check if any accounts need sync
      const { data: accounts } = await supabase
        .from("ad_accounts")
        .select("id, last_sync_at")
        .eq("organization_id", orgId)
        .eq("status", "connected");

      if (!accounts || accounts.length === 0) return;

      const threshold = new Date(Date.now() - STALE_THRESHOLD).toISOString();
      const staleAccounts = accounts.filter(
        (a) => force || !a.last_sync_at || a.last_sync_at < threshold
      );

      if (staleAccounts.length === 0) return;

      setIsSyncing(true);

      const { error } = await supabase.functions.invoke("google-ads-sync", {
        body: { organizationId: orgId, scope: "campaigns_only" },
      });

      if (!error) {
        const now = new Date().toISOString();
        setLastGoogleSync(now);

        // Invalidate relevant queries so UI updates
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["top-campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["worst-campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["last-sync"] });

        // After syncing campaigns, re-match unmatched sales (non-blocking)
        supabase.functions.invoke("rematch-sales", {
          body: { organizationId: orgId },
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["checkout-sales"] });
          queryClient.invalidateQueries({ queryKey: ["utmify-sales"] });
        }).catch(() => { /* silent */ });
      }
    } catch (err) {
      console.error("Auto-sync Google Ads failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [orgId, isSyncing, queryClient]);

  const syncNow = useCallback(() => {
    syncGoogleAds(true);
  }, [syncGoogleAds]);

  // Initial sync on mount + interval
  useEffect(() => {
    if (!orgId) return;

    // Sync once on first mount
    if (!hasSyncedOnMount.current) {
      hasSyncedOnMount.current = true;
      syncGoogleAds();
    }

    // Set up interval
    intervalRef.current = setInterval(() => syncGoogleAds(), GOOGLE_ADS_SYNC_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orgId, syncGoogleAds]);

  // Reset on org change
  useEffect(() => {
    hasSyncedOnMount.current = false;
  }, [orgId]);

  // ─── Supabase Realtime Subscriptions ─────────────────
  // Subscribe to real-time changes on key tables so UI refreshes instantly
  // when webhooks (Utmify, SellX, etc.) insert new data
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`realtime-${orgId}`)
      // Sales — webhooks insert new sales
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "utmify_sales",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["checkout-sales"] });
          queryClient.invalidateQueries({ queryKey: ["utmify-sales"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        }
      )
      // Sales status updates (paid, refunded, etc.)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "utmify_sales",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["checkout-sales"] });
          queryClient.invalidateQueries({ queryKey: ["utmify-sales"] });
        }
      )
      // Campaign updates (after google-ads-sync writes)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campaigns",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["top-campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["worst-campaigns"] });
        }
      )
      // Daily metrics updates
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "metrics_daily",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        }
      )
      // New insights from AI
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "insights",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["insights"] });
        }
      )
      // Alerts triggered
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["alerts"] });
        }
      )
      // Calls from call-webhook
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["calls"] });
        }
      )
      // Ad account sync status changes
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ad_accounts",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
          queryClient.invalidateQueries({ queryKey: ["last-sync"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  return (
    <SyncContext.Provider value={{ lastGoogleSync, isSyncing, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}
