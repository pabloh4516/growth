"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { SyncProvider } from "./sync-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider>
        <AuthProvider>
          <SyncProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            theme="dark"
            toastOptions={{
              style: {
                background: "hsl(240 17% 6%)",
                border: "1px solid hsl(240 10% 18%)",
              },
            }}
          />
        </SyncProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryProvider>
  );
}
