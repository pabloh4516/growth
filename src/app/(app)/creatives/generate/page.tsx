"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrgId } from "@/lib/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const supabase = createClient();

interface GeneratedCreative {
  type: string;
  content: string;
  variant?: string;
}

const PLATFORMS = [
  { value: "google_ads", label: "Google Ads" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "tiktok_ads", label: "TikTok Ads" },
  { value: "youtube_ads", label: "YouTube Ads" },
];

const OBJECTIVES = [
  { value: "conversion", label: "Conversão" },
  { value: "traffic", label: "Tráfego" },
  { value: "engagement", label: "Engajamento" },
  { value: "awareness", label: "Reconhecimento" },
];

const TONES = [
  { value: "professional", label: "Profissional" },
  { value: "casual", label: "Casual" },
  { value: "urgent", label: "Urgente" },
  { value: "emotional", label: "Emocional" },
];

const TYPE_COLORS: Record<string, string> = {
  headline: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  description: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  cta: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  hook: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  script: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

export default function CreativeGeneratePage() {
  const orgId = useOrgId();
  const [platform, setPlatform] = useState("");
  const [niche, setNiche] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedCreative[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const canGenerate = platform && niche.trim() && objective && tone && !generating;

  const handleGenerate = async () => {
    if (!orgId || !canGenerate) return;
    setGenerating(true);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-creative-gen", {
        body: {
          organizationId: orgId,
          platform,
          niche: niche.trim(),
          objective,
          tone,
        },
      });

      if (error) throw error;

      const creatives: GeneratedCreative[] = data?.creatives || data?.results || [];
      if (creatives.length === 0) {
        toast.info("Nenhum criativo retornado", {
          description: "Tente novamente com parâmetros diferentes.",
        });
      } else {
        setResults(creatives);
        toast.success(`${creatives.length} criativos gerados!`);
      }
    } catch (err: any) {
      toast.error("Erro ao gerar criativos", {
        description: err?.message || "Tente novamente.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      toast.success("Copiado!");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerador de Criativos"
        description="Gere copies e scripts para anúncios com inteligência artificial"
        actions={
          <Button variant="outline" asChild>
            <Link href="/creatives">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
        }
      />

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="surface-glow">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="platform">Plataforma</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger id="platform">
                    <SelectValue placeholder="Selecione a plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="niche">Nicho / Produto</Label>
                <Input
                  id="niche"
                  placeholder="Ex: Curso de marketing digital"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="objective">Objetivo</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger id="objective">
                    <SelectValue placeholder="Selecione o objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone">Tom de Voz</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger id="tone">
                    <SelectValue placeholder="Selecione o tom" />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleGenerate} disabled={!canGenerate} size="lg">
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {generating ? "Gerando..." : "Gerar Criativos"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Loading Skeletons */}
      {generating && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={`skeleton-${i}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="surface-glow">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                    <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-muted animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-8 w-20 rounded bg-muted animate-pulse ml-auto" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {!generating && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <h2 className="text-lg font-heading font-semibold mb-4">
              Resultados ({results.length} criativos)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((creative, idx) => {
                const typeClass =
                  TYPE_COLORS[creative.type?.toLowerCase()] ||
                  "bg-primary/20 text-primary border-primary/30";

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                  >
                    <Card className="surface-glow hover:surface-glow-hover transition-all h-full flex flex-col">
                      <CardContent className="p-5 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize ${typeClass}`}
                          >
                            {creative.type}
                          </Badge>
                          {creative.variant && (
                            <span className="text-xs text-muted-foreground">
                              Variante {creative.variant}
                            </span>
                          )}
                        </div>

                        <p className="text-sm leading-relaxed flex-1 whitespace-pre-wrap">
                          {creative.content}
                        </p>

                        <div className="mt-4 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(creative.content, idx)}
                            className="text-xs"
                          >
                            {copiedIndex === idx ? (
                              <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {copiedIndex === idx ? "Copiado" : "Copiar"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
