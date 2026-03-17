"use client";

import { useAuth } from "./use-auth";

export function useOrgId(): string | null {
  const { currentOrg } = useAuth();
  return currentOrg?.id ?? null;
}
