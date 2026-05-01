import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth";
import { PwaProvider } from "@/lib/pwa";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

// Install at module load (before React mounts) so stray Response rejections
// from server-fn auth middleware never reach the error overlay / blank screen.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason instanceof Response) e.preventDefault();
  });
  window.addEventListener("error", (e) => {
    if (e.error instanceof Response || (e.message && e.message.includes("[object Response]"))) {
      e.preventDefault();
    }
  });
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { title: "M-PESA" },
      { name: "description", content: "M-PESA mobile money — send, pay, withdraw." },
      { name: "theme-color", content: "#0b6b3a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "M-PESA" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", href: "/icon-192.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } }));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isPreview =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    if (!("serviceWorker" in navigator) || isPreview || inIframe) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);


  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <PwaProvider>
            <Outlet />
            <Toaster richColors position="top-center" />
          </PwaProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
