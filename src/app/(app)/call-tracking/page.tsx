"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, PhoneCall, PhoneMissed } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const QUAL_BADGE: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  hot: "success", warm: "warning", cold: "secondary", spam: "destructive",
};

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "caller_number", header: "Número", cell: ({ row }) => <span className="font-mono text-sm">{row.original.caller_number || "—"}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "answered" ? "success" : "warning"}>{row.original.status}</Badge> },
  { accessorKey: "duration_seconds", header: "Duração", cell: ({ row }) => { const d = row.original.duration_seconds || 0; return <span className="font-mono text-sm">{Math.floor(d / 60)}:{String(d % 60).padStart(2, "0")}</span>; } },
  { accessorKey: "qualification", header: "Qualificação", cell: ({ row }) => row.original.qualification ? <Badge variant={QUAL_BADGE[row.original.qualification] || "secondary"}>{row.original.qualification}</Badge> : <span className="text-muted-foreground">—</span> },
  { accessorKey: "created_at", header: "Data", cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.created_at).toLocaleString("pt-BR")}</span> },
];

export default function CallTrackingPage() {
  const orgId = useOrgId();
  const { data: calls, isLoading } = useQuery({
    queryKey: ["calls", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("calls").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false });
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const answered = calls?.filter((c: any) => c.status === "answered").length || 0;
  const missed = calls?.filter((c: any) => c.status === "missed").length || 0;
  const hot = calls?.filter((c: any) => c.qualification === "hot").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Call Tracking" description="Rastreie e qualifique ligações de campanhas" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Calls" value={formatNumber(calls?.length || 0)} delay={0} icon={<Phone className="h-4 w-4" />} />
        <KPICard title="Atendidas" value={formatNumber(answered)} delay={1} icon={<PhoneCall className="h-4 w-4" />} />
        <KPICard title="Perdidas" value={formatNumber(missed)} delay={2} icon={<PhoneMissed className="h-4 w-4" />} />
        <KPICard title="Hot Leads" value={formatNumber(hot)} delay={3} icon={<Phone className="h-4 w-4" />} />
      </div>
      <DataTable data={calls || []} columns={columns} searchPlaceholder="Buscar ligações..." />
    </div>
  );
}
