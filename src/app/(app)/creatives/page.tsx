"use client";

import { useRef, useState } from "react";
import { useCreatives } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { generateCreatives } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { Loader2, Plus, Image as ImageIcon, Video, Type, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

const TYPE_ICONS: Record<string, any> = {
  image: ImageIcon,
  video: Video,
  text: Type,
};

export default function CreativesPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: creatives, isLoading } = useCreatives();
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    setUploading(true);
    try {
      const fileType = file.type.startsWith("video") ? "video" : "image";
      const { error } = await supabase.from("creative_library").insert({
        organization_id: orgId,
        name: file.name.replace(/\.[^.]+$/, ""),
        type: fileType,
        platform: "google_ads",
        tags: [],
      });
      if (error) throw error;
      toast.success("Criativo adicionado!", { description: file.name });
      queryClient.invalidateQueries({ queryKey: ["creatives"] });
    } catch (err: any) {
      toast.error("Erro no upload", { description: err?.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      await generateCreatives({
        organization_id: orgId,
        platform: "google_ads",
        type: "responsive",
        prompt: "Gerar copies para campanha de alta performance",
      });
      toast.success("Criativos gerados!", { description: "Novos criativos foram adicionados à biblioteca." });
      queryClient.invalidateQueries({ queryKey: ["creatives"] });
    } catch (err: any) {
      toast.error("Erro ao gerar criativos", { description: err?.message });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Criativos"
        description="Biblioteca de criativos com análise de performance"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? "Gerando..." : "Gerar com IA"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </div>
        }
      />

      {creatives && creatives.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creatives.map((creative: any, idx: number) => {
            const TypeIcon = TYPE_ICONS[creative.type] || ImageIcon;
            const perf = creative.creative_performance?.[0];
            return (
              <motion.div key={creative.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer overflow-hidden">
                  <div className="h-40 bg-muted flex items-center justify-center">
                    {creative.thumbnail_url ? (
                      <img src={creative.thumbnail_url} alt={creative.name} className="h-full w-full object-cover" />
                    ) : (
                      <TypeIcon className="h-12 w-12 text-muted-foreground/30" />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium truncate flex-1">{creative.name}</p>
                      <PlatformIcon platform={creative.platform?.replace("_ads", "") || "google"} />
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant="secondary" className="text-[10px]">{creative.type}</Badge>
                      {creative.tags?.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                    {perf && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">CTR</p>
                          <p className="text-xs font-mono font-semibold">{(perf.ctr || 0).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">CPA</p>
                          <p className="text-xs font-mono font-semibold">R${(perf.cpa || 0).toFixed(0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">ROAS</p>
                          <p className="text-xs font-mono font-semibold">{(perf.roas || 0).toFixed(1)}x</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="surface-glow">
          <CardContent className="py-16 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum criativo na biblioteca.</p>
            <Button className="mt-4" onClick={() => fileRef.current?.click()}>Upload de Criativo</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
