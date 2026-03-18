"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { usePeriodStore } from "@/lib/hooks/use-period";
import { useOrgId } from "@/lib/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, LogOut, User, Settings, Building2, RefreshCw } from "lucide-react";

const supabase = createClient();

const PERIODS = [
  { label: "Hoje", value: "hoje" },
  { label: "7d", value: "7d" },
  { label: "15d", value: "15d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
] as const;

function useLastSyncTime() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["last-sync", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("last_sync_at")
        .eq("organization_id", orgId!)
        .eq("status", "connected")
        .order("last_sync_at", { ascending: false })
        .limit(1);

      if (!data || data.length === 0 || !data[0].last_sync_at) return null;
      return data[0].last_sync_at;
    },
    enabled: !!orgId,
    refetchInterval: 30 * 1000,
  });
}

function formatTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, currentOrg, signOut } = useAuth();
  const router = useRouter();
  const { period, setPeriod } = usePeriodStore();
  const { data: lastSync } = useLastSyncTime();

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      {/* Mobile menu */}
      <button onClick={onMenuToggle} className="lg:hidden text-muted-foreground hover:text-foreground">
        <Menu className="h-5 w-5" />
      </button>

      {/* Workspace */}
      <div className="hidden sm:flex items-center gap-2">
        <div className="h-7 w-7 rounded bg-primary/20 flex items-center justify-center">
          <Building2 className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium truncate max-w-[140px]">
          {currentOrg?.name || "Workspace"}
        </span>
      </div>

      {/* Period selector */}
      <div className="hidden md:flex items-center gap-1 ml-4 bg-secondary rounded-lg p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Sync indicator */}
      {lastSync && (
        <div className="hidden md:flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>Sync: {formatTimeSince(lastSync)}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{profile?.name || "Usuário"}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <User className="mr-2 h-4 w-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
