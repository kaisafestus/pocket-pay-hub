import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AppHeader({ title, subtitle, back = "/app", right }: { title: string; subtitle?: string; back?: string; right?: ReactNode }) {
  return (
    <div className="text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto max-w-md px-5 pt-5 pb-10 flex items-center gap-3">
        <Link to={back} className="h-9 w-9 rounded-full grid place-items-center bg-primary-foreground/15 hover:bg-primary-foreground/25">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="text-xs opacity-80">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}