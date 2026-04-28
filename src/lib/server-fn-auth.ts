import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Please sign in again to continue.");
    }

    return next({
      headers: { Authorization: `Bearer ${token}` },
    });
  },
);