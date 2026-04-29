import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2, Home, History, Store, Wallet, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import messagesIcon from "@/assets/messages-icon.png";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  type Tab = { to: string; label: string; icon?: typeof Home; image?: string };
  const tabs: Tab[] = [
    { to: "/app", label: "Home", icon: Home },
    { to: "/app/statement", label: "Statement", icon: History },
    { to: "/app/messages", label: "Messages", image: messagesIcon },
    ...(roles.includes("merchant") ? [{ to: "/app/merchant", label: "Merchant", icon: Store } as Tab] : []),
    ...(roles.includes("agent") ? [{ to: "/app/agent", label: "Agent", icon: Wallet } as Tab] : []),
    { to: "/app/account", label: "Account", icon: User },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <Outlet />

      <nav className="fixed bottom-0 inset-x-0 bg-card border-t z-30">
        <div className="mx-auto max-w-md grid grid-cols-5">
          {tabs.slice(0, 5).map((t) => {
            const active = path === t.to || (t.to !== "/app" && path.startsWith(t.to));
            const exact = t.to === "/app" && path === "/app";
            const isActive = exact || (t.to !== "/app" && active);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.image ? (
                  <img src={t.image} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 object-contain" />
                ) : t.icon ? (
                  <t.icon className="h-5 w-5" />
                ) : null}
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => signOut()}
        className="fixed top-4 right-4 z-40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        title="Sign out"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  );
}