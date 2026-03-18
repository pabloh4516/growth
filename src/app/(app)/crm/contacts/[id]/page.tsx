"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { formatBRL } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Mail, Phone, Globe, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const supabase = createClient();

const STAGE_COLORS: Record<string, string> = {
  subscriber: "bg-slate-500/20 text-slate-400", lead: "bg-blue-500/20 text-blue-400",
  mql: "bg-purple-500/20 text-purple-400", sql: "bg-indigo-500/20 text-indigo-400",
  opportunity: "bg-amber-500/20 text-amber-400", customer: "bg-emerald-500/20 text-emerald-400",
};

const EVENT_ICONS: Record<string, any> = {
  page_view: Globe, email_open: Mail, email_click: Mail, ad_click: Globe,
  call: Phone, form_submit: Tag, sale: Tag, stage_change: Clock,
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = useOrgId();

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, contact_timeline(*)")
        .eq("id", id)
        .eq("organization_id", orgId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!contact) return <div className="text-center py-16 text-t3">Contato não encontrado</div>;

  const timeline = contact.contact_timeline?.sort((a: any, b: any) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime()) || [];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-xl font-heading font-bold">{contact.name || contact.email}</h1>
          <p className="text-sm text-t3">{contact.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base font-heading">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-t3">Email</span><span className="text-sm">{contact.email}</span></div>
            {contact.phone && <div className="flex justify-between"><span className="text-sm text-t3">Telefone</span><span className="text-sm">{contact.phone}</span></div>}
            <div className="flex justify-between"><span className="text-sm text-t3">Estágio</span><Badge className={STAGE_COLORS[contact.lifecycle_stage] || ""}>{(contact.lifecycle_stage || "lead").toUpperCase()}</Badge></div>
            <div className="flex justify-between"><span className="text-sm text-t3">Lead Score</span><span className={cn("text-sm font-mono font-bold", (contact.lead_score || 0) >= 70 ? "text-success" : "text-warning")}>{contact.lead_score || 0}</span></div>
            <div className="flex justify-between"><span className="text-sm text-t3">LTV Previsto</span><span className="text-sm font-mono">{formatBRL(contact.predicted_ltv || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-t3">Risco Churn</span><span className={cn("text-sm font-mono", (contact.churn_risk || 0) >= 70 ? "text-destructive" : "text-success")}>{contact.churn_risk || 0}%</span></div>
            <div className="flex justify-between"><span className="text-sm text-t3">Fonte</span><span className="text-sm">{contact.source || "—"}</span></div>
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">{contact.tags.map((tag: string) => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base font-heading">Timeline ({timeline.length})</CardTitle></CardHeader>
          <CardContent>
            {timeline.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-auto scrollbar-thin">
                {timeline.map((event: any) => {
                  const Icon = EVENT_ICONS[event.event_type] || Clock;
                  return (
                    <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-s2 transition-colors">
                      <div className="p-1.5 rounded bg-muted"><Icon className="h-3.5 w-3.5 text-t3" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{event.event_type?.replace(/_/g, " ")}</p>
                        {event.event_data && <p className="text-xs text-t3 line-clamp-1">{typeof event.event_data === "string" ? event.event_data : JSON.stringify(event.event_data)}</p>}
                      </div>
                      <span className="text-[10px] text-t3 shrink-0">{new Date(event.timestamp || event.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-t3 text-center py-8">Nenhum evento registrado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
