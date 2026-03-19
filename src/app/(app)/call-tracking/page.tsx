"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

export default function CallTrackingPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Call Tracking</h1>
        <p className="text-sm text-t3">Rastreie e qualifique ligacoes de campanhas</p>
      </div>

      <Card>
        <CardContent>
          <EmptyState
            icon="\ud83d\udcde"
            title="Call Tracking"
            subtitle="Rastreamento e qualificacao de ligacoes originadas por campanhas. Configure seu provedor de telefonia via webhook para comecar."
          />
        </CardContent>
      </Card>
    </div>
  );
}
