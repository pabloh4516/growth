"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, Play, FileText, AlertTriangle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

const supabase = createClient();

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "file_name", header: "Arquivo", cell: ({ row }) => <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-t3" /><span className="font-medium">{row.original.file_name || "—"}</span></div> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "processed" ? "success" : row.original.status === "processing" ? "warning" : "secondary"}>{row.original.status === "processed" ? "Processado" : row.original.status === "processing" ? "Processando" : "Pendente"}</Badge> },
  { accessorKey: "total_rows", header: "Linhas", cell: ({ row }) => <span className="font-mono">{row.original.total_rows || 0}</span> },
  { accessorKey: "matched_rows", header: "Matched", cell: ({ row }) => <span className="font-mono text-success">{row.original.matched_rows || 0}</span> },
  {
    accessorKey: "match_rate",
    header: "Taxa Match",
    cell: ({ row }) => {
      const total = row.original.total_rows || 0;
      const matched = row.original.matched_rows || 0;
      const rate = total > 0 ? (matched / total) * 100 : 0;
      return <span className={`font-mono text-sm ${rate >= 80 ? "text-success" : rate >= 50 ? "text-warning" : "text-destructive"}`}>{rate.toFixed(0)}%</span>;
    },
  },
  { accessorKey: "created_at", header: "Data Upload", cell: ({ row }) => <span className="text-xs text-t3">{new Date(row.original.created_at).toLocaleDateString("pt-BR")}</span> },
];

export default function OfflineConversionsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: uploads, isLoading } = useQuery({
    queryKey: ["offline-uploads", orgId],
    queryFn: async () => { const { data } = await supabase.from("offline_uploads").select("*").eq("organization_id", orgId!).order("created_at", { ascending: false }); return data; },
    enabled: !!orgId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    setUploading(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(Boolean);
      const totalRows = Math.max(lines.length - 1, 0);

      // Upload file to storage
      const filePath = `${orgId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("offline-conversions").upload(filePath, file);

      // Create upload record
      const { data: uploadRecord, error } = await supabase.from("offline_uploads").insert({
        organization_id: orgId,
        file_name: file.name,
        file_path: filePath,
        total_rows: totalRows,
        matched_rows: 0,
        status: "pending",
      }).select().single();

      if (error) throw error;
      toast.success("Upload realizado!", { description: `${totalRows} linhas para processar. Clique "Processar" para iniciar.` });
      queryClient.invalidateQueries({ queryKey: ["offline-uploads"] });
    } catch (err: any) {
      toast.error("Erro no upload", { description: err?.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleProcess = async (uploadId: string) => {
    setProcessing(uploadId);
    try {
      const { data, error } = await supabase.functions.invoke("process-offline-conversions", {
        body: { uploadId },
      });
      if (error) throw error;
      toast.success("Processamento concluído!", { description: `${data?.matchedRows || 0} de ${data?.totalRows || 0} linhas vinculadas a campanhas.` });
      queryClient.invalidateQueries({ queryKey: ["offline-uploads"] });
    } catch (err: any) {
      toast.error("Erro ao processar", { description: err?.message });
    } finally {
      setProcessing(null);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const pendingUploads = uploads?.filter((u: any) => u.status === "pending") || [];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-t1">Conversões Offline</h1>
          <p className="text-sm text-t3">Upload e matching de conversões offline com campanhas</p>
        </div>
        <>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload CSV
          </Button>
        </>
      </div>

      {/* CSV format guide */}
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Formato esperado do CSV</p>
              <p className="text-xs text-t3 mt-1">
                Colunas: <code className="bg-muted px-1 rounded">email, revenue, date, order_id, utm_source, utm_campaign</code>
              </p>
              <p className="text-xs text-t3 mt-0.5">Separador: vírgula ou ponto-e-vírgula. Primeira linha = header.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending uploads that need processing */}
      {pendingUploads.length > 0 && (
        <Card className="border-warning/20">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Uploads pendentes de processamento</p>
            {pendingUploads.map((upload: any) => (
              <div key={upload.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-t3" />
                  <span className="text-sm">{upload.file_name}</span>
                  <span className="text-xs text-t3">{upload.total_rows} linhas</span>
                </div>
                <Button size="sm" onClick={() => handleProcess(upload.id)} disabled={processing === upload.id}>
                  {processing === upload.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                  Processar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <DataTable data={uploads || []} columns={columns} searchPlaceholder="Buscar uploads..." />
    </div>
  );
}
