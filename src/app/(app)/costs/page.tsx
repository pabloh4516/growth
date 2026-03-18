"use client";

import { useState } from "react";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const supabase = createClient();

const COST_FIELDS = [
  { key: "tools", label: "Ferramentas (SaaS)", placeholder: "Ex: 500" },
  { key: "team", label: "Equipe / Freelancers", placeholder: "Ex: 3000" },
  { key: "creative", label: "Produção de criativos", placeholder: "Ex: 800" },
  { key: "hosting", label: "Hospedagem & Domínios", placeholder: "Ex: 150" },
  { key: "other", label: "Outros custos fixos", placeholder: "Ex: 200" },
];

export default function CostsPage() {
  const orgId = useOrgId();
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const totalCost = Object.values(costs).reduce((s, v) => s + (Number(v) || 0), 0);
      await supabase.from("financial_records").insert({
        organization_id: orgId,
        type: "operational_cost",
        amount: totalCost,
        category: "monthly",
        description: JSON.stringify(costs),
        record_date: new Date().toISOString().split("T")[0],
      });
      setSaved(true);
      toast.success("Custos salvos!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err?.message });
    } finally { setSaving(false); }
  };

  const total = Object.values(costs).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fade-up">
      <Card>
        <CardHeader>
          <CardTitle>Custos Operacionais Mensais</CardTitle>
          <p className="text-sm text-t3 mt-1">Defina os custos fixos da operação para cálculo do DRE e lucro real.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {COST_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">{field.label}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 text-md">R$</span>
                <input
                  type="number"
                  value={costs[field.key] || ""}
                  onChange={(e) => setCosts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-s2 border border-input rounded-sm pl-9 pr-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45"
                />
              </div>
            </div>
          ))}

          <div className="h-px bg-border my-2" />

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-t3 uppercase tracking-wide">Total mensal</div>
              <div className="font-heading text-2xl font-bold text-t1">R$ {total.toLocaleString("pt-BR")}</div>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saved ? "✓ Salvo!" : saving ? "Salvando..." : "Salvar custos"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
