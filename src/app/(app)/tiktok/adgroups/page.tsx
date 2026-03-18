"use client";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function TikTokAdGroupsPage() {
  return (
    <div className="animate-fade-up">
      <Card>
        <CardContent className="pt-4">
          <EmptyState icon="👥" title="Grupos de Anúncio TikTok" subtitle="Gerencie públicos e segmentações dos seus grupos de anúncio" />
        </CardContent>
      </Card>
    </div>
  );
}
