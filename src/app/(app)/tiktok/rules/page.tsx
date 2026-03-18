"use client";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function TikTokRulesPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex justify-end">
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Nova regra</Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <EmptyState icon="⚙️" title="Regras Automáticas TikTok" subtitle="Crie regras para otimizar suas campanhas TikTok automaticamente" />
        </CardContent>
      </Card>
    </div>
  );
}
