"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCampaigns } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatBRL, formatNumber, formatCompact } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "platform",
    header: "Plataforma",
    cell: ({ row }) => <PlatformIcon platform={row.original.platform?.replace("_ads", "") || "google"} />,
  },
  {
    accessorKey: "name",
    header: "Campanha",
    cell: ({ row }) => (
      <div>
        <p className="font-medium truncate max-w-[200px]">{row.original.name}</p>
        <p className="text-xs text-muted-foreground">{row.original.external_id}</p>
      </div>
    ),
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status || "draft"} /> },
  { accessorKey: "daily_budget", header: "Orçamento/dia", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.daily_budget || 0)}</span> },
  { accessorKey: "impressions", header: "Impressões", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="font-mono text-sm">{formatCompact(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.clicks || 0)}</span> },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.cost || 0)}</span> },
  {
    accessorKey: "roas",
    header: "ROAS Google",
    meta: { className: "hidden lg:table-cell" },
    cell: ({ row }) => {
      const cost = row.original.cost || 0;
      const revenue = row.original.revenue || 0;
      const roas = cost > 0 ? revenue / cost : 0;
      return <span className="font-mono text-sm text-muted-foreground">{roas.toFixed(2)}x</span>;
    },
  },
  {
    accessorKey: "real_roas",
    header: "ROAS Real",
    cell: ({ row }) => {
      const roas = row.original.real_roas || 0;
      return <span className={`font-mono text-sm font-semibold ${roas >= 2 ? "text-success" : roas >= 1 ? "text-warning" : "text-destructive"}`}>{roas.toFixed(2)}x</span>;
    },
  },
  { accessorKey: "real_sales_count", header: "Vendas Reais", cell: ({ row }) => <span className="font-mono text-sm">{row.original.real_sales_count || 0}</span> },
  { accessorKey: "real_revenue", header: "Receita Real", cell: ({ row }) => <span className="font-mono text-sm text-success">{formatBRL(row.original.real_revenue || 0)}</span> },
];

export default function CampaignsPage() {
  const router = useRouter();
  const orgId = useOrgId();
  const { days } = usePeriodStore();
  const { data: campaigns, isLoading, refetch } = useCampaigns(days);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { organizationId: orgId, scope: "full" },
      });
      if (error) throw error;
      toast.success("Sincronização concluída!", {
        description: `${data?.results?.[0]?.campaigns || 0} campanhas sincronizadas`,
      });
      refetch();
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err?.message });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        description="Gerencie e analise todas as suas campanhas com ROAS real"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
            <Button onClick={() => router.push("/campaigns/create")}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </div>
        }
      />
      <DataTable
        data={campaigns || []}
        columns={columns}
        searchPlaceholder="Buscar campanhas..."
        onRowClick={(row: any) => router.push(`/campaigns/${row.id}`)}
      />
    </div>
  );
}
