"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

export default function OfflineConversionsPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Conversoes Offline</h1>
        <p className="text-sm text-t3">Upload e matching de conversoes offline com campanhas</p>
      </div>

      <Card>
        <CardContent>
          <EmptyState
            icon="\ud83d\udcc1"
            title="Conversoes Offline"
            subtitle="Faca upload de CSVs com conversoes offline para vincular automaticamente a campanhas do Google Ads. Em breve."
          />
        </CardContent>
      </Card>
    </div>
  );
}
