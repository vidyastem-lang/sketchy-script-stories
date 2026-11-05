import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { createGuestSession } from "@/lib/guest-auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Could not check your guest session: " + error.message);
    if (data.session) return;

    const tokens = await createGuestSession();
    const { error: sessionError } = await supabase.auth.setSession(tokens);
    if (sessionError)
      throw new Error("Could not start your guest session: " + sessionError.message);
  },
  component: () => <Outlet />,
});
