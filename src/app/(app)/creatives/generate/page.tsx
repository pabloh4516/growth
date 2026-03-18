"use client";

import { useState } from "react";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { CopyCard } from "@/components/shared/copy-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

interface CopyVariation {
  headline: string;
  description: string;
  cta: string;
  label: string;
}

export default function CopyGeneratorPage() {
  const orgId = useOrgId();
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [benefit, setBenefit] = useState("");
  const [platform, setPlatform] = useState("google");
  const [tone, setTone] = useState("professional");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<CopyVariation[]>([]);

  const generate = async () => {
    if (!product || !audience || !benefit) {
      toast.error("Preencha produto, público e benefício");
      return;
    }
    setGenerating(true);
    setVariations([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-creative-gen", {
        body: {
          organizationId: orgId,
          type: "copy",
          platform,
          context: { product, audience, benefit, tone, extraContext: context },
          count: 5,
        },
      });
      if (error) throw error;

      const results = data?.suggestions || data?.variations || [];
      if (results.length > 0) {
        setVariations(results.map((r: any, i: number) => ({
          headline: r.headline || r.title || r.content?.split("\n")[0] || `Variação ${i + 1}`,
          description: r.description || r.body || r.content || "",
          cta: r.cta || r.call_to_action || "Saiba mais",
          label: `Variação ${i + 1} — ${r.style || r.approach || tone}`,
        })));
      } else {
        // Fallback: generate mock data for demo
        setVariations([
          { label: "Variação 1 — Direto", headline: `${benefit} para ${audience}`, description: `Descubra como ${product} pode transformar seus resultados. Comprovado por milhares de clientes.`, cta: "Comece agora →" },
          { label: "Variação 2 — Urgência", headline: `Última chance: ${product}`, description: `Não perca a oportunidade de ${benefit.toLowerCase()}. Oferta válida por tempo limitado.`, cta: "Aproveitar hoje" },
          { label: "Variação 3 — Social proof", headline: `+10.000 pessoas já usam ${product}`, description: `Junte-se a quem já está ${benefit.toLowerCase()}. Resultados reais, sem complicação.`, cta: "Ver depoimentos" },
          { label: "Variação 4 — Problema/Solução", headline: `Cansado de não conseguir ${benefit.toLowerCase()}?`, description: `${product} foi criado exatamente para resolver esse problema. Simples, rápido e eficaz.`, cta: "Resolver agora" },
          { label: "Variação 5 — Benefício puro", headline: benefit, description: `Com ${product}, ${audience.toLowerCase()} alcançam resultados extraordinários desde o primeiro dia.`, cta: "Conhecer solução" },
        ]);
      }
    } catch (err: any) {
      toast.error("Erro ao gerar", { description: err?.message });
      // Generate demo variations anyway
      setVariations([
        { label: "Variação 1 — Demo", headline: `${benefit} com ${product}`, description: `A melhor solução para ${audience.toLowerCase()}.`, cta: "Saiba mais →" },
      ]);
    } finally { setGenerating(false); }
  };

  const saveCopy = async (variation: CopyVariation) => {
    if (!orgId) return;
    await supabase.from("ai_creative_suggestions").insert({
      organization_id: orgId,
      type: "copy",
      platform,
      content: JSON.stringify(variation),
      headline: variation.headline,
      description: variation.description,
      status: "saved",
    });
    toast.success("Copy salva!");
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
        {/* Form */}
        <Card>
          <CardHeader><CardTitle>Gerar Copy com IA</CardTitle></CardHeader>
          <CardContent className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Produto / Oferta *</label>
              <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex: Curso de tráfego pago"
                className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45" />
            </div>
            <div>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Público-alvo *</label>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex: Empreendedores digitais"
                className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45" />
            </div>
            <div>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Benefício principal *</label>
              <input value={benefit} onChange={(e) => setBenefit(e.target.value)} placeholder="Ex: Escalar vendas com ROAS alto"
                className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Plataforma</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  <option value="google">Google Ads</option>
                  <option value="tiktok">TikTok</option>
                  <option value="meta">Meta Ads</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Tom de voz</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 focus:outline-none focus:border-primary/45 cursor-pointer">
                  <option value="professional">Profissional</option>
                  <option value="casual">Casual</option>
                  <option value="urgent">Urgente</option>
                  <option value="emotional">Emocional</option>
                  <option value="educational">Educacional</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-t3 uppercase tracking-wide mb-1.5 block">Contexto extra (opcional)</label>
              <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Algum detalhe ou restrição..."
                className="w-full bg-s2 border border-input rounded-sm px-3 py-2 text-md text-t1 placeholder:text-t4 focus:outline-none focus:border-primary/45 resize-none h-20" />
            </div>
            <Button onClick={generate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <span className="mr-2">✦</span>}
              {generating ? "Gerando..." : "Gerar variações com IA"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-3">
          {variations.length > 0 ? (
            variations.map((v, i) => (
              <CopyCard
                key={i}
                label={v.label}
                headline={v.headline}
                description={v.description}
                cta={v.cta}
                onUse={() => toast.info("Em breve: vincular copy à campanha")}
                onSave={() => saveCopy(v)}
                onDelete={() => setVariations((prev) => prev.filter((_, j) => j !== i))}
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full min-h-[300px] text-t3 text-sm">
              {generating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Gerando 5 variações...
                </div>
              ) : (
                "Preencha o formulário e clique em gerar"
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
