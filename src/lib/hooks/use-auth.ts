"use client";

import { createContext, useContext } from "react";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string;
  currency: string;
  industry: string | null;
}

export interface OrganizationMember {
  organization_id: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  organization: Organization;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  organizations: OrganizationMember[];
  currentOrg: Organization | null;
  currentRole: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, orgName: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  switchOrganization: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { AuthContext };
