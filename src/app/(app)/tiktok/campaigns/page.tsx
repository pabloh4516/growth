"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function TikTokCampaignsPage() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todas (0)</TabsTrigger>
            <TabsTrigger value="conversion">Conversão</TabsTrigger>
            <TabsTrigger value="traffic">Tráfego</TabsTrigger>
            <TabsTrigger value="awareness">Awareness</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Nova campanha</Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <EmptyState icon="📱" title="Campanhas TikTok" subtitle="Conecte sua conta TikTok Ads para gerenciar campanhas aqui" />
        </CardContent>
      </Card>
    </div>
  );
}
