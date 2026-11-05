import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateStoryboard } from "@/lib/ai.functions";
import { extractScriptText } from "@/lib/script-parse";
import {
  ANIMATION_STYLES,
  LANGUAGES,
  MODE_META,
  sceneCountFor,
  type VideoMode,
} from "@/lib/storyboard";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "New video — StoryReel" },
      { name: "description", content: "Create a new animated video from a story, script or prompt." },
      { property: "og:title", content: "New video — StoryReel" },
      { property: "og:description", content: "Create a new animated video from a story, script or prompt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const storyboardFn = useServerFn(generateStoryboard);
  const [mode, setMode] = useState<VideoMode>("story");
  const [content, setContent] = useState("");
  const [style, setStyle] = useState("storybook");
  const [language, setLanguage] = useState("English");
  const [duration, setDuration] = useState(60);
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [bgm, setBgm] = useState(true);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    try {
      const text = await extractScriptText(file);
      if (!text.trim()) throw new Error("No readable text found in that file");
      setContent(text);
      toast.success("Script loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (content.trim().length < 12) {
      toast.error("Give the AI a little more to work with — at least a sentence.");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { data: video, error } = await supabase
        .from("videos")
        .insert({
          user_id: userData.user.id,
          title: content.trim().split("\n")[0].slice(0, 60) || "Untitled video",
          mode,
          source_text: content.trim(),
          style,
          language,
          target_duration_sec: duration,
          resolution,
          bgm_enabled: bgm,
          status: "draft",
        })
        .select("id")
        .single();
      if (error || !video) throw error ?? new Error("Could not create the video");

      await storyboardFn({ data: { videoId: video.id } });
      await navigate({ to: "/video/$id", params: { id: video.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Storyboard generation failed");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Create a new video</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The AI writes the screenplay, casts characters and breaks everything into scenes.
        </p>

        {/* Mode */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {(Object.keys(MODE_META) as VideoMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                mode === m ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="font-display font-bold">{MODE_META[m].label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{MODE_META[m].blurb}</div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="content">{mode === "prompt" ? "Your prompt" : mode === "script" ? "Script" : "Your story"}</Label>
            {mode === "script" && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.docx,.pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button variant="outline" size="sm" disabled={parsing} onClick={() => fileInput.current?.click()}>
                  {parsing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                  Upload TXT / DOCX / PDF
                </Button>
              </>
            )}
          </div>
          <Textarea
            id="content"
            rows={mode === "script" ? 12 : 6}
            placeholder={
              mode === "prompt"
                ? "e.g. A shy robot learns to dance at a village festival"
                : mode === "script"
                  ? "Paste your screenplay here, or upload a file above…"
                  : "e.g. A little girl visits a magical forest and meets a talking elephant…"
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {/* Settings */}
        <Card className="mt-8 border-border/70">
          <CardContent className="grid gap-6 pt-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Animation style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANIMATION_STYLES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Target duration · <span className="text-primary">{duration}s</span> (~{sceneCountFor(duration)} scenes)
              </Label>
              <Slider min={30} max={180} step={15} value={[duration]} onValueChange={([v]) => setDuration(v)} />
            </div>
            <div className="flex items-end gap-6">
              <div className="space-y-1.5">
                <Label>Resolution</Label>
                <Select value={resolution} onValueChange={(v) => setResolution(v as "720p" | "1080p")}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="bgm" checked={bgm} onCheckedChange={setBgm} />
                <Label htmlFor="bgm">Background music</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button size="lg" className="glow-gold mt-8 w-full gap-2" disabled={busy} onClick={handleSubmit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Writing the storyboard…" : "Generate storyboard"}
        </Button>
        {busy && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            This usually takes 20–60 seconds. You'll land in the studio when it's done.
          </p>
        )}
      </main>
    </div>
  );
}
