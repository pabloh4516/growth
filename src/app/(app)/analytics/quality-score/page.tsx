"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "text", header: "Keyword", cell: ({ row }) => <span className="font-medium">{row.original.text}</span> },
  { accessorKey: "match_type", header: "Tipo", cell: ({ row }) => <span className="text-xs uppercase text-t3">{row.original.match_type}</span> },
  {
    accessorKey: "quality_score",
    header: "QS",
    cell: ({ row }) => {
      const qs = row.original.quality_score || 0;
      return (
        <span className={cn("font-mono font-bold", qs >= 7 ? "text-success" : qs >= 5 ? "text-warning" : "text-destructive")}>
          {qs}/10
        </span>
      );
    },
  },
  { accessorKey: "impressions", header: "Impressões", cell: ({ row }) => <span className="font-mono text-sm">{(row.original.impressions || 0).toLocaleString()}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono text-sm">{(row.original.clicks || 0).toLocaleString()}</span> },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conv.", cell: ({ row }) => <span className="font-mono text-sm">{row.original.conversions || 0}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <span className="text-xs">{row.original.status}</span> },
];

export default function QualityScorePage() {
  const orgId = useOrgId();
  const { data: keywords, isLoading } = useQuery({
    queryKey: ["keywords", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("keywords").select("*").not("quality_score", "is", null).order("quality_score", { ascending: true }).limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const distribution = Array.from({ length: 10 }, (_, i) => ({
    score: i + 1,
    count: keywords?.filter((k: any) => k.quality_score === i + 1).length || 0,
  }));
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-heading font-bold text-t1">Quality Score</h1>
        <p className="text-sm text-t3">Distribuição e detalhes do Quality Score das keywords</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base font-heading">Distribuição QS</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {distribution.map((d) => (
              <div key={d.score} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono">{d.count}</span>
                <div
                  className={cn("w-full rounded-t", d.score >= 7 ? "bg-success" : d.score >= 5 ? "bg-warning" : "bg-destructive")}
                  style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                />
                <span className="text-[10px] text-t3">{d.score}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <DataTable data={keywords || []} columns={columns} searchPlaceholder="Buscar keyword..." />
    </div>
  );
}
