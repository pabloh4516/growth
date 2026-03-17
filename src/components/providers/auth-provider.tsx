"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AuthContext,
  type UserProfile,
  type Organization,
  type OrganizationMember,
} from "@/lib/hooks/use-auth";
import type { User, Session } from "@supabase/supabase-js";

const ORG_STORAGE_KEY = "growthOS_current_org";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationMember[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(
    async (userId: string) => {
      const [profileRes, membersRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("id", userId).single(),
        supabase
          .from("organization_members")
          .select("organization_id, role, organizations:organization_id(id, name, logo_url, timezone, currency, industry)")
          .eq("user_id", userId),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as UserProfile);
      }

      if (membersRes.data && membersRes.data.length > 0) {
        const members = membersRes.data.map((m: any) => ({
          organization_id: m.organization_id,
          role: m.role,
          organization: m.organizations as Organization,
        }));
        setOrganizations(members);

        const savedOrgId = localStorage.getItem(ORG_STORAGE_KEY);
        const savedMember = savedOrgId
          ? members.find((m: OrganizationMember) => m.organization_id === savedOrgId)
          : null;
        const activeMember = savedMember || members[0];

        setCurrentOrg(activeMember.organization);
        setCurrentRole(activeMember.role);
        localStorage.setItem(ORG_STORAGE_KEY, activeMember.organization_id);
      }
    },
    [supabase]
  );

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setProfile(null);
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentRole(null);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase, loadUserData]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string, orgName: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error || !data.user) return { error: error as Error | null };

      const userId = data.user.id;

      await supabase.from("user_profiles").insert({ id: userId, email, name });

      const { data: org } = await supabase
        .from("organizations")
        .insert({ name: orgName, timezone: "America/Sao_Paulo", currency: "BRL" })
        .select()
        .single();

      if (org) {
        await supabase.from("organization_members").insert({
          organization_id: org.id,
          user_id: userId,
          role: "owner",
        });
        await supabase.from("ai_settings").insert({ organization_id: org.id });
        await supabase.from("utmify_config").insert({ organization_id: org.id });
      }

      return { error: null };
    },
    [supabase]
  );

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ORG_STORAGE_KEY);
  }, [supabase]);

  const resetPassword = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      return { error: error as Error | null };
    },
    [supabase]
  );

  const switchOrganization = useCallback(
    (orgId: string) => {
      const member = organizations.find((m) => m.organization_id === orgId);
      if (member) {
        setCurrentOrg(member.organization);
        setCurrentRole(member.role);
        localStorage.setItem(ORG_STORAGE_KEY, orgId);
      }
    },
    [organizations]
  );

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      organizations,
      currentOrg,
      currentRole,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      resetPassword,
      switchOrganization,
    }),
    [user, session, profile, organizations, currentOrg, currentRole, loading, signIn, signUp, signInWithGoogle, signOut, resetPassword, switchOrganization]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
