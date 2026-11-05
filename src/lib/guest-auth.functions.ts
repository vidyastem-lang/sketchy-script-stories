import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createGuestAuthFetch(publishableKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // Supabase's new publishable keys are opaque; send them as apikey, not bearer tokens.
    if (
      (publishableKey.startsWith("sb_publishable_") || publishableKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${publishableKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", publishableKey);
    return fetch(input, { ...init, headers });
  };
}

/** Create a server-provisioned guest user and return only that user's Supabase session. */
export const createGuestSession = createServerFn({ method: "POST" }).handler(async () => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const missing = [
    ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
    ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length) {
    throw new Error(`Guest session provisioning requires server secret(s): ${missing.join(", ")}`);
  }

  // This module reads SUPABASE_SERVICE_ROLE_KEY only on the server; never import it into client code.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const guestId = crypto.randomUUID();
  const email = `guest-${guestId}@guest.storyreel.invalid`;
  const password = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}!`;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { guest_session: true },
  });
  if (createError || !created.user) {
    throw new Error(`Could not provision a guest user: ${createError?.message ?? "No user returned"}`);
  }

  const authClient = createClient<Database>(supabaseUrl!, publishableKey!, {
    global: { fetch: createGuestAuthFetch(publishableKey!) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new Error(`Could not start the guest session: ${signInError?.message ?? "No session returned"}`);
  }

  return {
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  };
});
