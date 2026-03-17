"use client";

import { useState, useMemo } from "react";
import { useInsights, useAIDecisions } from "@/lib/hooks/use-supabase-data";
import { useOrgId } from "@/lib/hooks/use-org";
import { triggerAIAnalysis, executeAIDecision } from "@/lib/services/edge-functions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Loader2,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Pause,
  Play,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Lightbulb,
  ShieldCheck,
  History,
  AlertTriangle,
  AlertCircle,
  Info,
  Eye,
  Check,
  X,
  Zap,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ─── Types ──────────────────────────────────────────────
interface Insight {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  status: "new" | "acknowledged" | "resolved";
  suggested_action: string | null;
  created_at: string;
  module?: string;
}

interface AIDecision {
  id: string;
  decision_type: string;
  reasoning: string;
  confidence: number;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "executed" | "rejected" | "failed" | "rolled_back";
  created_at: string;
  executed_at: string | null;
  campaigns?: { id: string; name: string } | null;
  parameters?: Record<string, unknown>;
}

// ─── Constants ──────────────────────────────────────────
const DECISION_TYPE_CONFIG: Record<string, { label: string; icon: typeof Pause; color: string }> = {
  pause_campaign: { label: "Pausar Campanha", icon: Pause, color: "text-warning" },
  activate_campaign: { label: "Ativar Campanha", icon: Play, color: "text-success" },
  increase_budget: { label: "Aumentar Budget", icon: TrendingUp, color: "text-success" },
  decrease_budget: { label: "Reduzir Budget", icon: TrendingDown, color: "text-destructive" },
  add_negative_keyword: { label: "Adicionar Negativa", icon: MinusCircle, color: "text-info" },
  adjust_bid: { label: "Ajustar Lance", icon: TrendingUp, color: "text-primary" },
  create_ad_variation: { label: "Criar Variação", icon: Sparkles, color: "text-primary" },
};

const SEVERITY_CONFIG = {
  info: { icon: Info, color: "text-info", bg: "bg-info/10", border: "border-info/20", badgeVariant: "info" as const },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20", badgeVariant: "warning" as const },
  critical: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", badgeVariant: "destructive" as const },
};

const INSIGHT_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" }> = {
  new: { label: "Novo", variant: "default" },
  acknowledged: { label: "Visto", variant: "secondary" },
  resolved: { label: "Resolvido", variant: "success" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Baixa", color: "text-muted-foreground" },
  medium: { label: "Média", color: "text-info" },
  high: { label: "Alta", color: "text-warning" },
  critical: { label: "Crítica", color: "text-destructive" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; color: string; badgeVariant: "success" | "destructive" | "warning" | "secondary" }> = {
  pending: { label: "Pendente", icon: Clock, color: "text-warning", badgeVariant: "warning" },
  executed: { label: "Executado", icon: CheckCircle, color: "text-success", badgeVariant: "success" },
  rejected: { label: "Rejeitado", icon: XCircle, color: "text-destructive", badgeVariant: "destructive" },
  failed: { label: "Falhou", icon: XCircle, color: "text-destructive", badgeVariant: "destructive" },
  rolled_back: { label: "Revertido", icon: History, color: "text-muted-foreground", badgeVariant: "secondary" },
};

// ─── Helpers ────────────────────────────────────────────
function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatRelativeDate(date: string) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "agora mesmo";
  if (diffMins < 60) return `há ${diffMins}min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return formatDate(date);
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 0.8) return "bg-success";
  if (confidence >= 0.5) return "bg-warning";
  return "bg-destructive";
}

function getConfidenceTextColor(confidence: number) {
  if (confidence >= 0.8) return "text-success";
  if (confidence >= 0.5) return "text-warning";
  return "text-destructive";
}

// ─── Animation Variants ─────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ─── Sub-components ─────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${getConfidenceColor(confidence)}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className={`text-xs font-mono font-medium tabular-nums ${getConfidenceTextColor(confidence)}`}>
        {pct}%
      </span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Brain; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-sm font-heading font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </motion.div>
  );
}

// ─── Insight Card (Enhanced) ────────────────────────────
function InsightFeedCard({
  insight,
  index,
  onAcknowledge,
  onResolve,
  loading,
}: {
  insight: Insight;
  index: number;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  loading: string | null;
}) {
  const severity = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
  const statusCfg = INSIGHT_STATUS_CONFIG[insight.status] || INSIGHT_STATUS_CONFIG.new;
  const SeverityIcon = severity.icon;

  return (
    <motion.div variants={itemVariants}>
      <Card className={`surface-glow border ${severity.border} transition-all hover:shadow-md hover:shadow-primary/5`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`h-8 w-8 rounded-lg ${severity.bg} flex items-center justify-center shrink-0`}>
                <SeverityIcon className={`h-4 w-4 ${severity.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-heading font-semibold leading-snug">
                  {insight.title}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant={statusCfg.variant} className="text-[10px] px-1.5 py-0">
                    {statusCfg.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeDate(insight.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {insight.description && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {insight.description}
            </p>
          )}
          {insight.suggested_action && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/10">
              <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-primary/90 leading-relaxed">{insight.suggested_action}</p>
            </div>
          )}
        </CardContent>
        {insight.status !== "resolved" && (
          <CardFooter className="gap-2">
            {insight.status === "new" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onAcknowledge(insight.id)}
                disabled={loading === insight.id}
              >
                {loading === insight.id ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3 mr-1.5" />
                )}
                Marcar como visto
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-success hover:text-success"
              onClick={() => onResolve(insight.id)}
              disabled={loading === insight.id}
            >
              {loading === insight.id ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1.5" />
              )}
              Resolver
            </Button>
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
}

// ─── Decision Card ──────────────────────────────────────
function DecisionCard({
  decision,
  onApprove,
  onReject,
  executing,
  rejecting,
}: {
  decision: AIDecision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  executing: string | null;
  rejecting: string | null;
}) {
  const typeCfg = DECISION_TYPE_CONFIG[decision.decision_type] || {
    label: decision.decision_type?.replace(/_/g, " ") || "Ação",
    icon: Zap,
    color: "text-primary",
  };
  const priorityCfg = PRIORITY_CONFIG[decision.priority] || PRIORITY_CONFIG.medium;
  const TypeIcon = typeCfg.icon;
  const isExecuting = executing === decision.id;
  const isRejecting = rejecting === decision.id;
  const isDisabled = isExecuting || isRejecting;

  return (
    <motion.div variants={itemVariants}>
      <Card className="surface-glow transition-all hover:shadow-md hover:shadow-primary/5 border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <TypeIcon className={`h-4.5 w-4.5 ${typeCfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-heading font-semibold">{typeCfg.label}</CardTitle>
                {decision.campaigns?.name && (
                  <CardDescription className="text-xs mt-0.5 truncate">
                    {decision.campaigns.name}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityCfg.color} border-current/20`}>
                {priorityCfg.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeDate(decision.created_at)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3 space-y-3">
          {decision.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed">{decision.reasoning}</p>
          )}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">
              Confiança da IA
            </p>
            <ConfidenceBar confidence={decision.confidence} />
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            size="sm"
            className="h-8 text-xs bg-success/20 text-success hover:bg-success/30 border border-success/20 flex-1"
            onClick={() => onApprove(decision.id)}
            disabled={isDisabled}
          >
            {isExecuting ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3 w-3 mr-1.5" />
            )}
            Aprovar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 flex-1"
            onClick={() => onReject(decision.id)}
            disabled={isDisabled}
          >
            {isRejecting ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <X className="h-3 w-3 mr-1.5" />
            )}
            Rejeitar
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// ─── History Row ────────────────────────────────────────
function HistoryRow({ decision }: { decision: AIDecision }) {
  const typeCfg = DECISION_TYPE_CONFIG[decision.decision_type] || {
    label: decision.decision_type?.replace(/_/g, " ") || "Ação",
    icon: Zap,
    color: "text-primary",
  };
  const statusCfg = STATUS_CONFIG[decision.status] || STATUS_CONFIG.pending;
  const TypeIcon = typeCfg.icon;
  const StatusIcon = statusCfg.icon;

  return (
    <motion.tr
      variants={itemVariants}
      className="border-b border-border/40 hover:bg-accent/30 transition-colors"
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {formatDate(decision.executed_at || decision.created_at)}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <TypeIcon className={`h-3.5 w-3.5 ${typeCfg.color}`} />
          <span className="text-xs font-medium">{typeCfg.label}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-muted-foreground truncate block max-w-[200px]">
          {decision.campaigns?.name || "—"}
        </span>
      </td>
      <td className="py-3 px-4">
        <Badge variant={statusCfg.badgeVariant} className="text-[10px] px-1.5 py-0 gap-1">
          <StatusIcon className="h-2.5 w-2.5" />
          {statusCfg.label}
        </Badge>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-[300px]">
          {decision.reasoning || "—"}
        </span>
      </td>
    </motion.tr>
  );
}

// ─── Main Page Component ────────────────────────────────
export default function InsightsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { data: insights, isLoading: insightsLoading } = useInsights();
  const { data: decisions, isLoading: decisionsLoading } = useAIDecisions();

  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("insights");

  // Split decisions into pending vs history
  const pendingDecisions = useMemo(
    () => (decisions as AIDecision[] | null)?.filter((d) => d.status === "pending") ?? [],
    [decisions]
  );

  const historyDecisions = useMemo(
    () =>
      (decisions as AIDecision[] | null)?.filter((d) =>
        ["executed", "rejected", "failed", "rolled_back"].includes(d.status)
      ) ?? [],
    [decisions]
  );

  const pendingCount = pendingDecisions.length;

  // ─── Handlers ──────────────────────────────────────
  const handleAnalyze = async () => {
    if (!orgId) return;
    setAnalyzing(true);
    try {
      await triggerAIAnalysis(orgId);
      toast.success("Análise concluída!", {
        description: "Novos insights e decisões foram gerados.",
      });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["ai-decisions"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast.error("Erro na análise", { description: message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApproveDecision = async (decisionId: string) => {
    setExecuting(decisionId);
    try {
      await executeAIDecision(decisionId);
      toast.success("Decisão executada!", {
        description: "A ação foi aplicada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-decisions"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast.error("Erro ao executar", { description: message });
    } finally {
      setExecuting(null);
    }
  };

  const handleRejectDecision = async (decisionId: string) => {
    setRejecting(decisionId);
    try {
      const { error } = await supabase
        .from("ai_decisions")
        .update({ status: "rejected" })
        .eq("id", decisionId);
      if (error) throw error;
      toast.success("Decisão rejeitada", {
        description: "A decisão foi marcada como rejeitada.",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-decisions"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast.error("Erro ao rejeitar", { description: message });
    } finally {
      setRejecting(null);
    }
  };

  const handleAcknowledgeInsight = async (insightId: string) => {
    setInsightLoading(insightId);
    try {
      const { error } = await supabase
        .from("insights")
        .update({ status: "acknowledged" })
        .eq("id", insightId);
      if (error) throw error;
      toast.success("Insight marcado como visto");
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast.error("Erro ao atualizar", { description: message });
    } finally {
      setInsightLoading(null);
    }
  };

  const handleResolveInsight = async (insightId: string) => {
    setInsightLoading(insightId);
    try {
      const { error } = await supabase
        .from("insights")
        .update({ status: "resolved" })
        .eq("id", insightId);
      if (error) throw error;
      toast.success("Insight resolvido");
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tente novamente.";
      toast.error("Erro ao resolver", { description: message });
    } finally {
      setInsightLoading(null);
    }
  };

  // ─── Loading State ─────────────────────────────────
  const isLoading = insightsLoading || decisionsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <div className="relative">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <Loader2 className="h-12 w-12 animate-spin text-primary/30 absolute inset-0" />
        </div>
        <p className="text-sm text-muted-foreground">Carregando inteligência...</p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights & IA"
        description="Análises inteligentes, decisões autônomas e histórico de ações do motor de IA"
        actions={
          <Button onClick={handleAnalyze} disabled={analyzing} className="gap-2">
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analyzing ? "Analisando..." : "Rodar Análise"}
          </Button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="surface-glow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold tabular-nums">
                  {(insights as Insight[] | null)?.length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Insights ativos</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="surface-glow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold tabular-nums">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Decisões pendentes</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="surface-glow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold tabular-nums">
                  {historyDecisions.filter((d) => d.status === "executed").length}
                </p>
                <p className="text-xs text-muted-foreground">Executadas com sucesso</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="insights" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Insights Feed
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Decisões da IA
            {pendingCount > 0 && (
              <span className="ml-1 h-4.5 min-w-[18px] px-1 rounded-full bg-warning/20 text-warning text-[10px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Insights Feed ───────────────────── */}
        <TabsContent value="insights">
          {(insights as Insight[] | null) && (insights as Insight[]).length > 0 ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {(insights as Insight[]).map((insight, idx) => (
                <InsightFeedCard
                  key={insight.id}
                  insight={insight}
                  index={idx}
                  onAcknowledge={handleAcknowledgeInsight}
                  onResolve={handleResolveInsight}
                  loading={insightLoading}
                />
              ))}
            </motion.div>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhum insight disponível"
              description="Conecte suas contas do Google Ads e Utmify, depois rode uma análise para gerar insights inteligentes."
            />
          )}
        </TabsContent>

        {/* ─── Tab 2: AI Decisions ────────────────────── */}
        <TabsContent value="decisions">
          {pendingDecisions.length > 0 ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {pendingDecisions.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  onApprove={handleApproveDecision}
                  onReject={handleRejectDecision}
                  executing={executing}
                  rejecting={rejecting}
                />
              ))}
            </motion.div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhuma decisão pendente"
              description="A IA não tem decisões aguardando aprovação no momento. Rode uma análise para gerar novas recomendações."
            />
          )}
        </TabsContent>

        {/* ─── Tab 3: History ─────────────────────────── */}
        <TabsContent value="history">
          {historyDecisions.length > 0 ? (
            <Card className="surface-glow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2.5 px-4 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Data
                      </th>
                      <th className="py-2.5 px-4 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Tipo
                      </th>
                      <th className="py-2.5 px-4 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Campanha
                      </th>
                      <th className="py-2.5 px-4 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Status
                      </th>
                      <th className="py-2.5 px-4 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Raciocínio
                      </th>
                    </tr>
                  </thead>
                  <motion.tbody variants={containerVariants} initial="hidden" animate="show">
                    {historyDecisions.map((decision) => (
                      <HistoryRow key={decision.id} decision={decision} />
                    ))}
                  </motion.tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={History}
              title="Nenhum histórico disponível"
              description="Quando decisões forem executadas ou rejeitadas, elas aparecerão aqui com todos os detalhes."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
