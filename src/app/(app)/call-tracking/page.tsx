"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { formatNumber } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Info } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

const supabase = createClient();

const QUAL_BADGE: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  hot: "success", warm: "warning", cold: "secondary", spam: "destructive",
};

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "caller_number", header: "Numero", cell: ({ row }) => <span className="font-mono text-sm">{row.original.caller_number || "—"}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "answered" ? "success" : "warning"}>{row.original.status === "answered" ? "Atendida" : row.original.status === "missed" ? "Perdida" : row.original.status}</Badge> },
  { accessorKey: "duration_seconds", header: "Duracao", cell: ({ row }) => { const d = row.original.duration_seconds || 0; return <span className="font-mono text-sm">{Math.floor(d / 60)}:{String(d % 60).padStart(2, "0")}</span>; } },
  { accessorKey: "qualification", header: "Qualificacao", cell: ({ row }) => row.original.qualification ? <Badge variant={QUAL_BADGE[row.original.qualification] || "secondary"}>{row.original.qualification}</Badge> : <span className="text-t3">—</span> },
  { accessorKey: "utm_source", header: "UTM Source", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-t3">{row.original.utm_source || "—"}</span> },
  { accessorKey: "utm_campaign", header: "UTM Campaign", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => <span className="text-xs text-t3 truncate max-w-[120px] block">{row.original.utm_campaign || "—"}</span> },
  { accessorKey: "created_at", header: "Data", cell: ({ row }) => <span className="text-xs text-t3">{new Date(row.original.created_at).toLocaleString("pt-BR")}</span> },
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
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Call Tracking</h1>
        <p className="text-sm text-t3">Rastreie e qualifique ligacoes de campanhas</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Calls" value={formatNumber(calls?.length || 0)} gradient="purple" />
        <MetricCard label="Atendidas" value={formatNumber(answered)} gradient="green" />
        <MetricCard label="Perdidas" value={formatNumber(missed)} gradient="amber" />
        <MetricCard label="Hot Leads" value={formatNumber(hot)} gradient="blue" />
      </div>

      {/* Webhook setup info */}
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Configuracao do Webhook</p>
              <p className="text-xs text-t3 mt-1">
                Configure seu provedor de telefonia (ex: Twilio, Nexmo, JivoChat) para enviar chamadas via webhook POST:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded mt-1 block break-all">
                POST {webhookUrl}
              </code>
              <p className="text-xs text-t3 mt-2">
                Body: <code className="bg-muted px-1 rounded">{"{ organization_id, caller_number, status, duration_seconds, utm_source, utm_campaign, api_token }"}</code>
              </p>
              <p className="text-xs text-t3 mt-1">
                O <code className="bg-muted px-1 rounded">api_token</code> deve ser configurado na aba Integracoes com tipo <code className="bg-muted px-1 rounded">call_tracking</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable data={calls || []} columns={columns} searchPlaceholder="Buscar ligacoes..." />
    </div>
  );
}
