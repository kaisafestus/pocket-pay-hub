import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallCtx {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
}

const Ctx = createContext<InstallCtx>({ canInstall: false, isInstalled: false, promptInstall: async () => {} });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    setInstalled(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        canInstall: !!evt && !installed,
        isInstalled: installed,
        promptInstall: async () => {
          if (!evt) return;
          await evt.prompt();
          await evt.userChoice;
          setEvt(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useInstall = () => useContext(Ctx);