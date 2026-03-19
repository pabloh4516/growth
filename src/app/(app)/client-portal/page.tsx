"use client";

import { useAuth } from "@/lib/hooks/use-auth";
import { useDashboardMetrics } from "@/lib/hooks/use-supabase-data";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Loader2 } from "lucide-react";

export default function ClientPortalPage() {
  const { currentOrg } = useAuth();
  const { data: metrics, isLoading } = useDashboardMetrics(30);

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Portal do Cliente</h1>
        <p className="text-sm text-t3">Dashboard simplificado para {currentOrg?.name || "o cliente"}</p>
      </div>

      <Card>
        <CardContent>
          <EmptyState
            icon="\ud83d\udcca"
            title="Portal do Cliente"
            subtitle="Dashboard simplificado com relatorios e aprovacoes para clientes. Em breve."
          />
        </CardContent>
      </Card>
    </div>
  );
}
