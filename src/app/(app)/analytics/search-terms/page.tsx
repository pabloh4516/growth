"use client";

import { useSearchTerms } from "@/lib/hooks/use-supabase-data";
import { formatBRL, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "term", header: "Termo de Busca", cell: ({ row }) => <span className="font-medium">{row.original.term}</span> },
  { accessorKey: "impressions", header: "Impressões", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.impressions || 0)}</span> },
  { accessorKey: "clicks", header: "Cliques", cell: ({ row }) => <span className="font-mono text-sm">{formatNumber(row.original.clicks || 0)}</span> },
  {
    accessorKey: "ctr",
    header: "CTR",
    cell: ({ row }) => <span className="font-mono text-sm">{(row.original.ctr || 0).toFixed(2)}%</span>,
  },
  { accessorKey: "cost", header: "Custo", cell: ({ row }) => <span className="font-mono text-sm">{formatBRL(row.original.cost || 0)}</span> },
  { accessorKey: "conversions", header: "Conv.", cell: ({ row }) => <span className="font-mono text-sm">{row.original.conversions || 0}</span> },
  {
    accessorKey: "suggested_action",
    header: "Ação Sugerida",
    cell: ({ row }) => {
      const action = row.original.suggested_action;
      if (!action) return "—";
      const variant = action === "negate" ? "destructive" : action === "promote" ? "success" : "secondary";
      return <Badge variant={variant as any}>{action}</Badge>;
    },
  },
];

export default function SearchTermsPage() {
  const { data: terms, isLoading } = useSearchTerms();

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Search Terms" description="Analise os termos de busca e tome ações" />
      <DataTable data={terms || []} columns={columns} searchPlaceholder="Buscar termos..." />
    </div>
  );
}
