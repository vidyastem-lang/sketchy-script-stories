import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return;

    // Let visitors enter the studio without creating an email/password account.
    // Supabase still gives each guest an isolated user ID for existing RLS rules.
    await supabase.auth.signInAnonymously();
  },
  component: () => <Outlet />,
});
