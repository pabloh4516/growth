"use client";

import { AdCard } from "@/components/shared/ad-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function TikTokAdsPage() {
  return (
    <div className="animate-fade-up">
      <Card>
        <CardContent className="pt-4">
          <EmptyState icon="🎬" title="Anúncios TikTok" subtitle="Cards com preview de vídeo aparecerão aqui após conectar sua conta" />
        </CardContent>
      </Card>
    </div>
  );
}
