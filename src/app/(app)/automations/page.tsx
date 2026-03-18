"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const supabase = createClient();

export default function AutomationsPage() {
  const orgId = useOrgId();

  const { data: sequences } = useQuery({
    queryKey: ["email-sequences", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("email_sequences").select("id, status, name").eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates-summary", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_templates").select("id, status, name").eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: rules } = useQuery({
    queryKey: ["automation-rules-summary", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("automation_rules").select("id, is_active, name").eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Visual Flow — Demo */}
      <Card>
        <CardHeader><CardTitle>Fluxo de Automação</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 overflow-x-auto py-2">
            {/* Trigger */}
            <div className="flex items-center gap-2 bg-amber-dim border border-warning/20 rounded-[10px] px-4 py-3 shrink-0">
              <span className="text-lg">⚡</span>
              <div>
                <div className="text-xs font-medium text-warning uppercase">Gatilho</div>
                <div className="text-sm text-t1">Nova venda confirmada</div>
              </div>
            </div>
            <span className="text-t4 shrink-0">→</span>
            {/* Action 1 */}
            <div className="flex items-center gap-2 bg-green-dim border border-success/20 rounded-[10px] px-4 py-3 shrink-0">
              <span className="text-lg">💬</span>
              <div>
                <div className="text-xs font-medium text-success uppercase">WhatsApp</div>
                <div className="text-sm text-t1">Enviar boas-vindas</div>
              </div>
            </div>
            <span className="text-t4 shrink-0">→</span>
            {/* Condition */}
            <div className="flex items-center gap-2 bg-purple-dim border border-primary/20 rounded-[10px] px-4 py-3 shrink-0">
              <span className="text-lg">🔀</span>
              <div>
                <div className="text-xs font-medium text-primary uppercase">Condição</div>
                <div className="text-sm text-t1">Abriu em 24h?</div>
              </div>
            </div>
            <span className="text-t4 shrink-0">→</span>
            {/* Action 2 */}
            <div className="flex items-center gap-2 bg-blue-dim border border-info/20 rounded-[10px] px-4 py-3 shrink-0">
              <span className="text-lg">📧</span>
              <div>
                <div className="text-xs font-medium text-info uppercase">Email</div>
                <div className="text-sm text-t1">Enviar sequência</div>
              </div>
            </div>
            <button className="text-xs text-t3 border border-dashed border-border rounded-[10px] px-4 py-6 hover:border-primary hover:text-primary transition-colors cursor-pointer shrink-0">
              editar fluxo →
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads">Auto-ads</TabsTrigger>
          <TabsTrigger value="crm">Auto-CRM</TabsTrigger>
          <TabsTrigger value="log">Auto-log</TabsTrigger>
        </TabsList>

        <TabsContent value="ads">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/automations/rules">
              <Card className="cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-[10px] bg-amber-dim flex items-center justify-center text-lg">⚡</div>
                    <div className="flex-1">
                      <div className="text-md font-medium text-t1 group-hover:text-primary transition-colors">Rules Engine</div>
                      <div className="text-xs text-t3">Regras automáticas</div>
                    </div>
                    <span className="text-t4 group-hover:text-t2 transition-colors">→</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{(rules || []).length} regras</Badge>
                    <Badge variant="success">{(rules || []).filter((r: any) => r.is_active).length} ativas</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="crm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link href="/automations/email">
              <Card className="cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-[10px] bg-purple-dim flex items-center justify-center text-lg">📧</div>
                    <div className="flex-1">
                      <div className="text-md font-medium text-t1 group-hover:text-primary transition-colors">Email Sequences</div>
                      <div className="text-xs text-t3">Sequências automatizadas</div>
                    </div>
                    <span className="text-t4 group-hover:text-t2 transition-colors">→</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{(sequences || []).length} sequências</Badge>
                    <Badge variant="success">{(sequences || []).filter((s: any) => s.status === "active").length} ativas</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/automations/whatsapp">
              <Card className="cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-[10px] bg-green-dim flex items-center justify-center text-lg">💬</div>
                    <div className="flex-1">
                      <div className="text-md font-medium text-t1 group-hover:text-primary transition-colors">WhatsApp Templates</div>
                      <div className="text-xs text-t3">Mensagens automáticas</div>
                    </div>
                    <span className="text-t4 group-hover:text-t2 transition-colors">→</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{(templates || []).length} templates</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardContent className="py-8 text-center text-t3 text-sm">
              Log de automações executadas — em breve
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
