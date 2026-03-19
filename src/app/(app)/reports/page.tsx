"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/hooks/use-org";
import { useReports } from "@/lib/hooks/use-supabase-data";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusPill } from "@/components/shared/status-pill";
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
} from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

const REPORT_TYPES = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "custom", label: "Personalizado" },
];

const TYPE_LABELS: Record<string, string> = {
  daily: "Diario",
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
        <li key={i} className="ml-4 text-sm text-t3 list-disc">
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
      <p key={i} className="text-sm text-t3 leading-relaxed">
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

      toast.success("Relatorio gerado!", {
        description: `Relatorio ${TYPE_LABELS[reportType] || reportType} criado com sucesso.`,
      });

      if (data?.content) {
        setPreviewContent(data.content);
      }

      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (err: any) {
      toast.error("Erro ao gerar relatorio", {
        description: err?.message || "Tente novamente.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (report: any) => {
    if (!report.content) {
      toast.info("Sem conteudo para download");
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

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold text-t1">Relatorios</h1>
        <p className="text-sm text-t3 mt-0.5">Gere e visualize relatorios de marketing com IA</p>
      </div>

      {/* Generate Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerar Relatorio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-t3 uppercase tracking-wide font-medium">Tipo</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="bg-s2 border-input">
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

            {reportType === "custom" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Data Inicio</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-s2 border-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-t3 uppercase tracking-wide font-medium">Data Fim</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-s2 border-input"
                  />
                </div>
              </>
            )}

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
                {generating ? "Gerando..." : "Gerar Relatorio"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {previewContent && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Preview do Relatorio
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewContent(null)}
              >
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none">
              {renderMarkdown(previewContent)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Historico de Relatorios</CardTitle>
            <span className="text-sm text-t3">{reports?.length || 0} relatorios</span>
          </div>
        </CardHeader>
        <CardContent>
          {reports && reports.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Relatorio</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Tipo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border hidden md:table-cell">Periodo</th>
                    <th className="text-xs font-medium text-t3 text-left pb-3 uppercase tracking-wide border-b border-border">Data</th>
                    <th className="text-xs font-medium text-t3 text-right pb-3 uppercase tracking-wide border-b border-border">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report: any) => {
                    const isExpanded = expandedId === report.id;
                    return (
                      <>
                        <tr
                          key={report.id}
                          className="group cursor-pointer"
                          onClick={() => toggleExpand(report.id)}
                        >
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-medium text-t1">
                                Relatorio {TYPE_LABELS[report.type] || report.type?.replace(/_/g, " ")}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 border-b border-border group-hover:bg-s2 transition-colors px-1">
                            <StatusPill
                              variant={report.type === "daily" ? "active" : report.type === "weekly" ? "learning" : "review"}
                              label={TYPE_LABELS[report.type] || report.type}
                            />
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1 hidden md:table-cell">
                            {report.period_start && report.period_end ? (
                              <span className="text-sm text-t3">
                                {new Date(report.period_start).toLocaleDateString("pt-BR")} — {new Date(report.period_end).toLocaleDateString("pt-BR")}
                              </span>
                            ) : (
                              <span className="text-sm text-t3">—</span>
                            )}
                          </td>
                          <td className="py-2.5 border-b border-border text-base text-t2 group-hover:bg-s2 transition-colors px-1">
                            <span className="text-sm text-t3">
                              {report.created_at
                                ? new Date(report.created_at).toLocaleDateString("pt-BR", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                          </td>
                          <td className="py-2.5 border-b border-border text-right group-hover:bg-s2 transition-colors px-1">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(report);
                                }}
                                aria-label="Download relatorio"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-t3" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-t3" />
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && report.content && (
                          <tr key={`${report.id}-content`}>
                            <td colSpan={5} className="border-b border-border bg-s2/50">
                              <div className="p-4 max-h-96 overflow-y-auto">
                                {renderMarkdown(report.content)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="📄"
              title="Nenhum relatorio gerado"
              subtitle="Use o formulario acima para gerar seu primeiro relatorio com IA."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
