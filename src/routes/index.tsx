import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({ component: Splash });

function Splash() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: "var(--gradient-hero)" }}>
        <div className="text-center text-primary-foreground">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-primary-foreground/15 backdrop-blur grid place-items-center text-2xl font-extrabold tracking-tight">M</div>
          <p className="mt-5 text-sm opacity-80 flex items-center gap-2 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting M-PESA…
          </p>
        </div>
      </div>
    );
  }
  return <Navigate to={user ? "/app" : "/auth"} replace />;
}