"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { useReports } from "@/lib/hooks/use-supabase-data";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Loader2,
  FileText,
  Download,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const supabase = createClient();

const REPORT_TYPES = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "custom", label: "Personalizado" },
];

const TYPE_LABELS: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  custom: "Personalizado",
};

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h3 key={i} className="text-base font-heading font-semibold mt-4 mb-2">
          {line.replace("### ", "")}
        </h3>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="text-lg font-heading font-bold mt-5 mb-2">
          {line.replace("## ", "")}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-xl font-heading font-bold mt-6 mb-3">
          {line.replace("# ", "")}
        </h1>
      );
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <li key={i} className="ml-4 text-sm text-muted-foreground list-disc">
          {line.replace(/^[-*]\s/, "")}
        </li>
      );
    }
    if (line.startsWith("**") && line.endsWith("**")) {
      return (
        <p key={i} className="text-sm font-semibold mt-2">
          {line.replace(/\*\*/g, "")}
        </p>
      );
    }
    if (line.trim() === "") {
      return <div key={i} className="h-2" />;
    }
    return (
      <p key={i} className="text-sm text-muted-foreground leading-relaxed">
        {line}
      </p>
    );
  });
}

export default function ReportsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { data: reports, isLoading } = useReports();
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!orgId) return;
    setGenerating(true);

    try {
      const body: Record<string, unknown> = {
        organizationId: orgId,
        reportType,
      };

      if (reportType === "custom" && dateFrom && dateTo) {
        body.dateFrom = dateFrom;
        body.dateTo = dateTo;
      }

      const { data, error } = await supabase.functions.invoke("ai-report", {
        body,
      });

      if (error) throw error;

      toast.success("Relatório gerado!", {
        description: `Relatório ${TYPE_LABELS[reportType] || reportType} criado com sucesso.`,
      });

      if (data?.content) {
        setPreviewContent(data.content);
      }

      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (err: any) {
      toast.error("Erro ao gerar relatório", {
        description: err?.message || "Tente novamente.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (report: any) => {
    if (!report.content) {
      toast.info("Sem conteúdo para download");
      return;
    }
    const blob = new Blob([report.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${report.type || "report"}-${new Date(report.created_at).toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Gere e visualize relatórios de marketing com inteligência artificial"
      />

      {/* Generate Report Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="surface-glow">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-base font-heading font-semibold">
                Gerar Relatório
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="report-type">Tipo de Relatório</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger id="report-type">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AnimatePresence>
                {reportType === "custom" && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="date-from">Data Início</Label>
                      <Input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: 0.05 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="date-to">Data Fim</Label>
                      <Input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <div>
                <Button
                  onClick={handleGenerate}
                  disabled={
                    generating ||
                    (reportType === "custom" && (!dateFrom || !dateTo))
                  }
                  className="w-full"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generating ? "Gerando..." : "Gerar Relatório"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Preview (shown after generation) */}
      <AnimatePresence>
        {previewContent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="surface-glow border-primary/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-heading font-semibold">
                      Preview do Relatório
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewContent(null)}
                  >
                    Fechar
                  </Button>
                </div>
                <div className="prose prose-invert max-w-none">
                  {renderMarkdown(previewContent)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-heading font-semibold">
            Histórico de Relatórios
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="space-y-3">
            {reports.map((report: any, idx: number) => {
              const isExpanded = expandedId === report.id;

              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <Card className="surface-glow hover:surface-glow-hover transition-all">
                    <CardContent className="p-0">
                      {/* Row */}
                      <div
                        className="p-4 flex items-center gap-4 cursor-pointer"
                        onClick={() => toggleExpand(report.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpand(report.id);
                          }
                        }}
                      >
                        <FileText className="h-5 w-5 text-primary shrink-0" />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            Relatório{" "}
                            {TYPE_LABELS[report.type] || report.type?.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {report.period_start &&
                              new Date(report.period_start).toLocaleDateString(
                                "pt-BR"
                              )}{" "}
                            {report.period_start && report.period_end && "—"}{" "}
                            {report.period_end &&
                              new Date(report.period_end).toLocaleDateString(
                                "pt-BR"
                              )}
                            {!report.period_start && report.created_at && (
                              <>
                                Gerado em{" "}
                                {new Date(report.created_at).toLocaleDateString(
                                  "pt-BR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </>
                            )}
                          </p>
                        </div>

                        <Badge variant="secondary" className="shrink-0">
                          {TYPE_LABELS[report.type] || report.type}
                        </Badge>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(report);
                            }}
                            aria-label="Download relatório"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Content */}
                      <AnimatePresence>
                        {isExpanded && report.content && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 border-t border-border/50">
                              <div className="mt-4 p-4 rounded-lg bg-background/50 max-h-96 overflow-y-auto">
                                {renderMarkdown(report.content)}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <Card className="surface-glow">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                Nenhum relatório gerado ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use o formulário acima para gerar seu primeiro relatório.
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
