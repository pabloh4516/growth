"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { User, Building2, Key, Bell, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

const TABS = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "organization", label: "Organizacao", icon: Building2 },
  { id: "api", label: "API Keys", icon: Key },
  { id: "notifications", label: "Notificacoes", icon: Bell },
  { id: "billing", label: "Faturamento", icon: CreditCard },
] as const;

export default function SettingsPage() {
  const { profile, currentOrg, user } = useAuth();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [orgName, setOrgName] = useState(currentOrg?.name || "");
  const [timezone, setTimezone] = useState(currentOrg?.timezone || "America/Sao_Paulo");

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ name })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar perfil", { description: error.message });
    } else {
      toast.success("Perfil atualizado!");
    }
  };

  const handleSaveOrg = async () => {
    if (!currentOrg) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name: orgName, timezone })
      .eq("id", currentOrg.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar organizacao", { description: error.message });
    } else {
      toast.success("Organizacao atualizada!");
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Configuracoes</h1>
        <p className="text-sm text-t3 mt-0.5">Gerencie seu perfil e organizacao</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Sidebar Tabs */}
        <div className="md:w-56 flex md:flex-col gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  tab === t.id ? "bg-primary/10 text-primary font-medium" : "text-t3 hover:bg-s2"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1">
          {tab === "profile" && (
            <Card>
              <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Nome</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-s2 border-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Email</label>
                  <Input defaultValue={profile?.email || ""} disabled className="bg-s2 border-input opacity-60" />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Alteracoes
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === "organization" && (
            <Card>
              <CardHeader><CardTitle>Organizacao</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Nome da Empresa</label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="bg-s2 border-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Fuso Horario</label>
                  <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="bg-s2 border-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Moeda</label>
                  <Input defaultValue={currentOrg?.currency || "BRL"} disabled className="bg-s2 border-input opacity-60" />
                </div>
                <Button onClick={handleSaveOrg} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === "api" && (
            <Card>
              <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-t3 mb-4">Gerencie suas chaves de API para integracoes externas.</p>
                <Button
                  onClick={async () => {
                    if (!currentOrg) return;
                    const key = crypto.randomUUID();
                    const { error } = await supabase.from("api_keys").insert({
                      organization_id: currentOrg.id,
                      name: "API Key " + new Date().toLocaleDateString("pt-BR"),
                      key_hash: key,
                      permissions: ["read"],
                    });
                    if (error) {
                      toast.error("Erro ao gerar key");
                    } else {
                      toast.success("API Key gerada!", { description: key, duration: 15000 });
                    }
                  }}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Gerar Nova Key
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === "notifications" && (
            <Card>
              <CardHeader><CardTitle>Notificacoes</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {[
                  { key: "email_alerts", label: "Alertas por email", desc: "Receba alertas criticos no seu email" },
                  { key: "ai_decisions", label: "Decisoes da IA", desc: "Notificar quando a IA tomar decisoes" },
                  { key: "budget_alerts", label: "Alertas de budget", desc: "Avisar quando o budget estiver proximo do limite" },
                  { key: "daily_report", label: "Relatorio diario", desc: "Resumo diario de performance" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div>
                      <p className="text-base font-medium text-t1">{item.label}</p>
                      <p className="text-xs text-t3">{item.desc}</p>
                    </div>
                    <button
                      className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors data-[state=checked]:bg-primary"
                      data-state="checked"
                      onClick={(e) => {
                        const btn = e.currentTarget;
                        const isChecked = btn.dataset.state === "checked";
                        btn.dataset.state = isChecked ? "unchecked" : "checked";
                        btn.classList.toggle("bg-primary", !isChecked);
                        btn.classList.toggle("bg-muted", isChecked);
                        const thumb = btn.firstElementChild as HTMLElement;
                        if (thumb) thumb.style.transform = isChecked ? "translateX(2px)" : "translateX(22px)";
                        toast.success(`${item.label} ${isChecked ? "desativado" : "ativado"}`);
                      }}
                    >
                      <span className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: "translateX(22px)" }} />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tab === "billing" && (
            <Card>
              <CardHeader><CardTitle>Faturamento</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold text-t1">Plano Atual</h3>
                    <span className="text-xs font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded-full">Pro</span>
                  </div>
                  <div className="font-heading text-2xl font-bold tracking-tight text-t1">R$ 497<span className="text-sm text-t3 font-normal">/mes</span></div>
                  <p className="text-xs text-t3 mt-1">Proxima cobranca: 17/04/2026</p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs text-t3 uppercase tracking-wide font-medium">Uso do mes</p>
                  {[
                    { label: "Campanhas analisadas", used: 8, limit: 50 },
                    { label: "Analises IA", used: 23, limit: 100 },
                    { label: "Relatorios gerados", used: 5, limit: 30 },
                    { label: "Contatos CRM", used: 142, limit: 5000 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-xs text-t3 w-40">{item.label}</span>
                      <div className="flex-1 h-1.5 bg-s3 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.used / item.limit) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-t2 w-16 text-right">{item.used}/{item.limit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
