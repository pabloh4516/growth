"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/lib/hooks/use-org";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

const supabase = createClient();

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = useOrgId();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      setStatus("error");
      toast.error("Código de autorização não encontrado");
      setTimeout(() => router.push("/integrations"), 2000);
      return;
    }

    const exchangeCode = async () => {
      try {
        const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const redirectUri = canonicalOrigin + "/connections/callback";

        const { data, error } = await supabase.functions.invoke("google-ads-oauth", {
          body: {
            action: "callback",
            organizationId: orgId,
            code,
            state,
            redirectUri,
          },
        });

        if (error) throw error;

        setStatus("success");
        toast.success("Google Ads conectado!", { description: `${data?.accounts?.length || 0} conta(s) vinculada(s)` });
        setTimeout(() => router.push("/integrations?success=google_ads_connected"), 1500);
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        setStatus("error");
        toast.error("Erro ao conectar Google Ads", { description: err?.message });
        setTimeout(() => router.push("/integrations?error=oauth_failed"), 2000);
      }
    };

    if (orgId) exchangeCode();
  }, [searchParams, orgId, router]);

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      {status === "loading" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Conectando Google Ads...</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="h-10 w-10 text-success" />
          <p className="text-sm font-medium">Google Ads conectado com sucesso!</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm font-medium">Erro na conexão</p>
        </>
      )}
    </div>
  );
}

export default function ConnectionsCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
