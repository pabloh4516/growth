"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Plus,
  Loader2,
  MessageCircle,
  Trash2,
  Eye,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const supabase = createClient();

const STATUS_MAP: Record<string, { label: string; variant: string; className: string }> = {
  draft: { label: "Rascunho", variant: "secondary", className: "bg-t3/10 text-t3" },
  pending_approval: { label: "Aguardando Aprovação", variant: "secondary", className: "bg-warning/10 text-warning" },
  approved: { label: "Aprovado", variant: "secondary", className: "bg-success/10 text-success" },
  rejected: { label: "Rejeitado", variant: "secondary", className: "bg-destructive/10 text-destructive" },
};

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
}

function renderPreview(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, '<span class="text-primary font-medium">[$1]</span>');
}

export default function WhatsAppTemplatesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formStatus, setFormStatus] = useState("draft");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const resetForm = () => {
    setFormName("");
    setFormBody("");
    setFormStatus("draft");
    setCreating(false);
    setEditing(null);
  };

  const handleCreate = async () => {
    if (!orgId || !formName.trim() || !formBody.trim()) return;
    setSaving(true);

    const variables = extractVariables(formBody);

    const { error } = await supabase.from("whatsapp_templates").insert({
      organization_id: orgId,
      name: formName,
      body: formBody,
      variables,
      status: formStatus,
    });

    setSaving(false);
    if (error) {
      toast.error("Erro ao criar template", { description: error.message });
    } else {
      toast.success("Template criado com sucesso!");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    }
  };

  const handleUpdate = async () => {
    if (!editing || !formName.trim() || !formBody.trim()) return;
    setSaving(true);

    const variables = extractVariables(formBody);

    const { error } = await supabase
      .from("whatsapp_templates")
      .update({
        name: formName,
        body: formBody,
        variables,
        status: formStatus,
      })
      .eq("id", editing);

    setSaving(false);
    if (error) {
      toast.error("Erro ao atualizar template", { description: error.message });
    } else {
      toast.success("Template atualizado!");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao excluir template");
    } else {
      toast.success("Template removido");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    }
  };

  const startEditing = (tpl: any) => {
    setEditing(tpl.id);
    setFormName(tpl.name);
    setFormBody(tpl.body || "");
    setFormStatus(tpl.status || "draft");
    setCreating(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isFormOpen = creating || editing;

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-t1">WhatsApp Templates</h1>
          <p className="text-sm text-t3 mt-1">Gerencie templates de mensagens para WhatsApp Business</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/automations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <Button onClick={() => { resetForm(); setCreating(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      {/* Creation / Edit form */}
      {isFormOpen && (
        <Card className="border-primary/30">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-heading font-semibold">
              {editing ? "Editar Template" : "Novo Template WhatsApp"}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Template</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Confirmação de Compra"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Corpo da Mensagem</Label>
                  <textarea
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder={"Olá {{nome}}! Sua compra de R$ {{valor}} foi confirmada. Obrigado pela preferência!"}
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-t3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                  <p className="text-[10px] text-t3">
                    Use {"{{variavel}}"} para variáveis dinâmicas.
                  </p>
                </div>

                {/* Variables detected */}
                {formBody && extractVariables(formBody).length > 0 && (
                  <div className="space-y-2">
                    <Label>Variáveis Detectadas</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {extractVariables(formBody).map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="pending_approval">Aguardando Aprovação</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={editing ? handleUpdate : handleCreate}
                    disabled={!formName.trim() || !formBody.trim() || saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editing ? "Salvar Alterações" : "Criar Template"}
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>
                    Cancelar
                  </Button>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview da Mensagem</Label>
                <div className="rounded-xl bg-[#0B141A] p-4 min-h-[200px]">
                  <div className="bg-[#005C4B] rounded-lg rounded-tl-none p-3 max-w-[85%] ml-auto">
                    {formBody ? (
                      <p
                        className="text-sm text-white whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: renderPreview(formBody) }}
                      />
                    ) : (
                      <p className="text-sm text-white/50 italic">
                        Digite a mensagem para visualizar...
                      </p>
                    )}
                    <p className="text-[10px] text-white/40 text-right mt-1">12:00</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      {templates && templates.length > 0 ? (
        <div className="space-y-3">
          {templates.map((tpl: any) => {
            const variables = tpl.variables ?? extractVariables(tpl.body || "");
            const statusCfg = STATUS_MAP[tpl.status] ?? STATUS_MAP.draft;
            const isPreview = previewId === tpl.id;

            return (
              <Card key={tpl.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <MessageCircle className="h-5 w-5 text-emerald-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium">{tpl.name}</p>
                        <Badge className={cn("text-[10px]", statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-t3 line-clamp-2">
                        {tpl.body || "Sem conteúdo"}
                      </p>
                      {variables.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-[10px] text-t3">Variáveis:</span>
                          {variables.map((v: string) => (
                            <Badge key={v} variant="secondary" className="text-[10px]">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewId(isPreview ? null : tpl.id)}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(tpl)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tpl.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline preview */}
                  {isPreview && (
                    <div className="overflow-hidden">
                      <div className="mt-4 rounded-xl bg-[#0B141A] p-4">
                        <div className="bg-[#005C4B] rounded-lg rounded-tl-none p-3 max-w-[85%] ml-auto">
                          <p
                            className="text-sm text-white whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{
                              __html: renderPreview(tpl.body || ""),
                            }}
                          />
                          <p className="text-[10px] text-white/40 text-right mt-1">12:00</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <MessageCircle className="h-12 w-12 text-t3/30 mx-auto mb-4" />
            <p className="text-t3 mb-2">Nenhum template WhatsApp criado.</p>
            <p className="text-sm text-t3">
              Crie seu primeiro template para usar nas automações de WhatsApp.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
