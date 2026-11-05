import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — StoryReel" },
      { name: "description", content: "Choose a new password for your StoryReel account." },
      { property: "og:title", content: "Set a new password — StoryReel" },
      { property: "og:description", content: "Choose a new password for your StoryReel account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isRecovery, setIsRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    setIsRecovery(hash.includes("type=recovery"));
    setChecked(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      await navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-radial flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <a href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-5" />
          </span>
          <span className="font-display text-lg font-bold">StoryReel</span>
        </a>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Set a new password</CardTitle>
            <CardDescription>
              {checked && !isRecovery
                ? "This reset link isn't active. Request a new one from the sign-in page."
                : "Choose a strong password for your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRecovery ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full glow-gold" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Update password
                </Button>
              </form>
            ) : (
              <Button
                className="w-full"
                onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
              >
                Back to sign in
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
