"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { KPICard } from "@/components/shared/kpi-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Phone, PhoneCall, PhoneMissed, Info } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const QUAL_BADGE: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  hot: "success", warm: "warning", cold: "secondary", spam: "destructive",
};

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "caller_number", header: "Número", cell: ({ row }) => <span className="font-mono text-sm">{row.original.caller_number || "—"}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "answered" ? "success" : "warning"}>{row.original.status === "answered" ? "Atendida" : row.original.status === "missed" ? "Perdida" : row.original.status}</Badge> },
  { accessorKey: "duration_seconds", header: "Duração", cell: ({ row }) => { const d = row.original.duration_seconds || 0; return <span className="font-mono text-sm">{Math.floor(d / 60)}:{String(d % 60).padStart(2, "0")}</span>; } },
  { accessorKey: "qualification", header: "Qualificação", cell: ({ row }) => row.original.qualification ? <Badge variant={QUAL_BADGE[row.original.qualification] || "secondary"}>{row.original.qualification}</Badge> : <span className="text-muted-foreground">—</span> },
  { accessorKey: "utm_source", header: "UTM Source", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.utm_source || "—"}</span> },
  { accessorKey: "utm_campaign", header: "UTM Campaign", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-muted-foreground truncate max-w-[120px] block">{row.original.utm_campaign || "—"}</span> },
  { accessorKey: "created_at", header: "Data", cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.created_at).toLocaleString("pt-BR")}</span> },
];

export default function CallTrackingPage() {
  const orgId = useOrgId();
  const { days } = usePeriodStore();

  const { data: calls, isLoading } = useQuery({
    queryKey: ["calls", orgId, days],
    queryFn: async () => {
      const dateFrom = new Date();
      if (days <= 1) { dateFrom.setHours(0, 0, 0, 0); } else { dateFrom.setDate(dateFrom.getDate() - days); }
      const { data } = await supabase.from("calls").select("*").eq("organization_id", orgId!).gte("created_at", dateFrom.toISOString()).order("created_at", { ascending: false });
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const answered = calls?.filter((c: any) => c.status === "answered").length || 0;
  const missed = calls?.filter((c: any) => c.status === "missed").length || 0;
  const hot = calls?.filter((c: any) => c.qualification === "hot").length || 0;

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace("localhost:3000", "<SUPABASE_URL>")}/functions/v1/call-webhook`
    : "";

  return (
    <div className="space-y-6">
      <PageHeader title="Call Tracking" description="Rastreie e qualifique ligações de campanhas" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Calls" value={formatNumber(calls?.length || 0)} delay={0} icon={<Phone className="h-4 w-4" />} />
        <KPICard title="Atendidas" value={formatNumber(answered)} delay={1} icon={<PhoneCall className="h-4 w-4" />} />
        <KPICard title="Perdidas" value={formatNumber(missed)} delay={2} icon={<PhoneMissed className="h-4 w-4" />} />
        <KPICard title="Hot Leads" value={formatNumber(hot)} delay={3} icon={<Phone className="h-4 w-4" />} />
      </div>

      {/* Webhook setup info */}
      <Card className="surface-glow border-primary/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Configuração do Webhook</p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure seu provedor de telefonia (ex: Twilio, Nexmo, JivoChat) para enviar chamadas via webhook POST:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded mt-1 block break-all">
                POST {webhookUrl}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Body: <code className="bg-muted px-1 rounded">{"{ organization_id, caller_number, status, duration_seconds, utm_source, utm_campaign, api_token }"}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                O <code className="bg-muted px-1 rounded">api_token</code> deve ser configurado na aba Integrações com tipo <code className="bg-muted px-1 rounded">call_tracking</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable data={calls || []} columns={columns} searchPlaceholder="Buscar ligações..." />
    </div>
  );
}
