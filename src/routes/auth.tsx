import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/create" });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (typeof search.mode === "string" && ["signin", "signup", "forgot"].includes(search.mode)
      ? search.mode
      : "signin") as Mode,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — StoryReel" },
      { name: "description", content: "Sign in or create your StoryReel account to start making animated videos." },
      { property: "og:title", content: "Sign in — StoryReel" },
      { property: "og:description", content: "Sign in or create your StoryReel account to start making animated videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.75 12 .75 7.6.75 3.8 3.27 1.96 6.96l3.66 2.84C6.5 7.13 9 5.04 12 5.04z"
      />
      <path
        fill="#4285F4"
        d="M23.25 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.3c-.27 1.46-1.09 2.7-2.32 3.53l3.6 2.8c2.1-1.95 3.67-4.82 3.67-8.52z"
      />
      <path
        fill="#FBBC05"
        d="M5.62 14.2a6.9 6.9 0 0 1 0-4.4L1.96 6.96a11.26 11.26 0 0 0 0 10.08l3.66-2.84z"
      />
      <path
        fill="#34A853"
        d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.6-2.8c-1 .68-2.3 1.1-3.86 1.1-3 0-5.5-2.1-6.38-4.9l-3.66 2.83C3.8 20.72 7.6 23.25 12 23.25z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  // Already signed in (e.g. right after an OAuth round-trip) → go to dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function afterSession() {
    await navigate({ to: "/dashboard", replace: true });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await afterSession();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) {
          await afterSession();
        } else {
          setAwaitingConfirm(true);
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset link sent — check your inbox.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSocial(provider: "google" | "lovable") {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) {
        toast.error(result.error.message ?? "Sign-in failed");
        setBusy(false);
        return;
      }
      if (result.redirected) return; // browser is navigating to the provider
      await afterSession();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  const title =
    mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";

  return (
    <div className="hero-radial flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <a href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-5" />
          </span>
          <span className="font-display text-lg font-bold">StoryReel</span>
        </a>
        <Card className="border-border/80 bg-card/95 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-display text-2xl">{title}</CardTitle>
            <CardDescription>
              {mode === "signup"
                ? "Start turning stories into animated videos."
                : mode === "forgot"
                  ? "We'll email you a secure reset link."
                  : "Sign in to continue making videos."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {awaitingConfirm ? (
              <div className="space-y-3 text-center">
                <p className="font-medium">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign
                  in.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAwaitingConfirm(false);
                    setMode("signin");
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {mode !== "forgot" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" type="button" disabled={busy} onClick={() => handleSocial("google")}>
                        <GoogleIcon /> Google
                      </Button>
                      <Button variant="outline" type="button" disabled={busy} onClick={() => handleSocial("lovable")}>
                        Continue with Lovable
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or with email</span>
                      <Separator className="flex-1" />
                    </div>
                  </>
                )}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Display name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {mode !== "forgot" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full glow-gold" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                  </Button>
                </form>
                <div className="text-center text-sm text-muted-foreground">
                  {mode === "signin" && (
                    <>
                      No account?{" "}
                      <button className="text-primary underline-offset-4 hover:underline" onClick={() => setMode("signup")}>
                        Sign up
                      </button>{" "}
                      ·{" "}
                      <button className="underline-offset-4 hover:underline" onClick={() => setMode("forgot")}>
                        Forgot password?
                      </button>
                    </>
                  )}
                  {mode === "signup" && (
                    <>
                      Already registered?{" "}
                      <button className="text-primary underline-offset-4 hover:underline" onClick={() => setMode("signin")}>
                        Sign in
                      </button>
                    </>
                  )}
                  {mode === "forgot" && (
                    <button className="text-primary underline-offset-4 hover:underline" onClick={() => setMode("signin")}>
                      Back to sign in
                    </button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
