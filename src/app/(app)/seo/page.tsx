"use client";

import { useState } from "react";
import { useSEOKeywords } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { syncSearchConsole } from "@/lib/services/edge-functions";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "keyword", header: "Keyword", cell: ({ row }) => <span className="font-medium">{row.original.keyword}</span> },
  {
    accessorKey: "position",
    header: "Posição",
    cell: ({ row }) => {
      const pos = row.original.position || 0;
      return <span className={cn("font-mono font-bold", pos <= 3 ? "text-success" : pos <= 10 ? "text-warning" : "text-t3")}>{pos}</span>;
    },
  },
  { accessorKey: "impressions", header: "Impressões", cell: ({ row }) => <span className="font-mono text-sm">{row.original.impressions || 0}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono text-sm">{row.original.clicks || 0}</span> },
  { accessorKey: "ctr", header: "CTR", cell: ({ row }) => <span className="font-mono text-sm">{(row.original.ctr || 0).toFixed(2)}%</span> },
  { accessorKey: "url", header: "URL", cell: ({ row }) => <span className="text-xs text-t3 truncate max-w-[200px] block">{row.original.url || "—"}</span> },
];

export default function SEOPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: keywords, isLoading } = useSEOKeywords();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      await syncSearchConsole(orgId);
      toast.success("Search Console sincronizado!");
      queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
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
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-t1">SEO Monitor</h1>
          <p className="text-sm text-t3 mt-1">Acompanhe rankings, impressões e cliques orgânicos</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          Sync Search Console
        </Button>
      </div>
      <DataTable data={keywords || []} columns={columns} searchPlaceholder="Buscar keyword..." />
    </div>
  );
}
