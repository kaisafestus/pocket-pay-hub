import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, formatPhone } from "@/lib/format";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BalanceCard() {
  const { user } = useAuth();
  const [shown, setShown] = useState(true);

  const { data } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [w, p] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("full_name, phone").eq("id", user!.id).maybeSingle(),
      ]);
      return { balance: Number(w.data?.balance ?? 0), profile: p.data };
    },
    refetchInterval: 5000,
  });

  return (
    <div className="rounded-3xl p-6 text-primary-foreground shadow-xl" style={{ background: "var(--gradient-primary)" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs opacity-80">M-PESA Balance</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">
            {shown ? formatKES(data?.balance ?? 0) : "•••••••"}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setShown((s) => !s)} className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
          {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </Button>
      </div>
      <div className="mt-5 text-xs opacity-90 flex justify-between">
        <span>{data?.profile?.full_name ?? "Customer"}</span>
        <span>{formatPhone(data?.profile?.phone ?? "")}</span>
      </div>
    </div>
  );
}