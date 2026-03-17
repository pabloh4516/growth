"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Mail, MessageCircle, Zap, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

const supabase = createClient();

const AUTOMATION_CARDS = [
  {
    id: "email",
    title: "Email Sequences",
    description: "Crie sequências de email automatizadas com triggers e múltiplas etapas",
    icon: Mail,
    href: "/automations/email",
    color: "text-primary",
    bgColor: "bg-primary/10",
    table: "email_sequences",
    stepsRelation: "email_sequence_steps",
  },
  {
    id: "whatsapp",
    title: "WhatsApp Templates",
    description: "Gerencie templates de mensagens para WhatsApp Business API",
    icon: MessageCircle,
    href: "/automations/whatsapp",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    table: "whatsapp_templates",
    stepsRelation: null,
  },
  {
    id: "rules",
    title: "Rules Engine",
    description: "Configure regras automáticas com condições e ações personalizadas",
    icon: Zap,
    href: "/automations/rules",
    color: "text-warning",
    bgColor: "bg-warning/10",
    table: "automation_rules",
    stepsRelation: null,
  },
] as const;

export default function AutomationsPage() {
  const orgId = useOrgId();

  const { data: sequences, isLoading: loadingSeq } = useQuery({
    queryKey: ["email-sequences", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_sequences")
        .select("id, status")
        .eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: templates, isLoading: loadingTpl } = useQuery({
    queryKey: ["whatsapp-templates-summary", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("id, status")
        .eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ["automation-rules-summary", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("automation_rules")
        .select("id, status")
        .eq("organization_id", orgId!);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const isLoading = loadingSeq || loadingTpl || loadingRules;

  const getCounts = (cardId: string) => {
    let items: any[] = [];
    if (cardId === "email") items = sequences ?? [];
    else if (cardId === "whatsapp") items = templates ?? [];
    else items = rules ?? [];

    return {
      total: items.length,
      active: items.filter((i) => i.status === "active" || i.status === "approved").length,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Email sequences, WhatsApp templates e regras automáticas"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {AUTOMATION_CARDS.map((card, idx) => {
          const Icon = card.icon;
          const counts = getCounts(card.id);

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link href={card.href}>
                <Card className="surface-glow hover:surface-glow-hover transition-all cursor-pointer group h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn("p-3 rounded-xl", card.bgColor)}>
                        <Icon className={cn("h-6 w-6", card.color)} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                    </div>

                    <h3 className="text-lg font-heading font-semibold mb-1">
                      {card.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 flex-1">
                      {card.description}
                    </p>

                    <div className="flex items-center gap-3 pt-3 border-t border-border">
                      <Badge variant="secondary" className="text-xs">
                        {counts.total} {counts.total === 1 ? "item" : "itens"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          counts.active > 0 && "bg-success/10 text-success"
                        )}
                      >
                        {counts.active} {counts.active === 1 ? "ativo" : "ativos"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
