"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

const supabase = createClient();

const columns: ColumnDef<any, any>[] = [
  { accessorKey: "file_name", header: "Arquivo", cell: ({ row }) => <span className="font-medium">{row.original.file_name || "—"}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "processed" ? "success" : "warning"}>{row.original.status}</Badge> },
  { accessorKey: "total_rows", header: "Linhas", cell: ({ row }) => <span className="font-mono">{row.original.total_rows || 0}</span> },
  { accessorKey: "matched_rows", header: "Matched", cell: ({ row }) => <span className="font-mono text-success">{row.original.matched_rows || 0}</span> },
  { accessorKey: "created_at", header: "Data Upload", cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString("pt-BR")}</span> },
];

export default function OfflineConversionsPage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

      const { error } = await supabase.from("offline_uploads").insert({
        organization_id: orgId,
        file_name: file.name,
        total_rows: totalRows,
        matched_rows: 0,
        status: "pending",
      });

      if (error) throw error;
      toast.success("Upload realizado!", { description: `${totalRows} linhas para processar.` });
      queryClient.invalidateQueries({ queryKey: ["offline-uploads"] });
    } catch (err: any) {
      toast.error("Erro no upload", { description: err?.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversões Offline"
        description="Upload e matching de conversões offline"
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload CSV
            </Button>
          </>
        }
      />
      <DataTable data={uploads || []} columns={columns} searchPlaceholder="Buscar uploads..." />
    </div>
  );
}
