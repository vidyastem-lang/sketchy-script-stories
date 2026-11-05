import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ImageIcon, Loader2, Mic, Play, RefreshCw, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCharacterArt, generateSceneArt, generateSceneVoiceover } from "@/lib/ai.functions";
import { ANIMATION_STYLES, VOICES, type Mood } from "@/lib/storyboard";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ComposeSceneInput } from "@/lib/video/compose";

export const Route = createFileRoute("/_authenticated/video/$id")({
  head: () => ({
    meta: [
      { title: "Video studio — StoryReel" },
      { name: "description", content: "Review and render your animated video in the StoryReel studio." },
      { property: "og:title", content: "Video studio — StoryReel" },
      { property: "og:description", content: "Review and render your animated video in the StoryReel studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

interface SceneRow {
  id: string;
  scene_index: number;
  heading: string | null;
  description: string;
  narration: string;
  dialogues: { character: string; line: string; emotion?: string; audio_path?: string | null }[];
  image_path: string | null;
  audio_path: string | null;
  emotion: string | null;
}

interface VideoRow {
  id: string;
  title: string;
  status: string;
  style: string;
  language: string;
  resolution: "720p" | "1080p";
  bgm_enabled: boolean;
  mood?: Mood;
  final_video_path: string | null;
  source_text: string;
}

interface CastRow {
  character_id: string;
  voice_id: string;
  characters: { id: string; name: string; description: string; image_path: string | null } | null;
}

function Studio() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const storyboardFn = useServerFn(generateStoryboard);
  const characterArtFn = useServerFn(generateCharacterArt);
  const sceneArtFn = useServerFn(generateSceneArt);
  const voiceoverFn = useServerFn(generateSceneVoiceover);

  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const videoQ = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").eq("id", id).single();
      if (error) throw error;
      return data as VideoRow;
    },
  });

  const scenesQ = useQuery({
    queryKey: ["scenes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("scenes").select("*").eq("video_id", id).order("scene_index");
      if (error) throw error;
      return (data as SceneRow[]).map((s) => ({ ...s, dialogues: (s.dialogues ?? []) as SceneRow["dialogues"] }));
    },
  });

  const castQ = useQuery({
    queryKey: ["cast", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_characters")
        .select("character_id, voice_id, characters(id, name, description, image_path)")
        .eq("video_id", id);
      if (error) throw error;
      return data as unknown as CastRow[];
    },
  });

  const imageUrl = useMutation({
    mutationFn: async ({ bucket, path }: { bucket: string; path: string }) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
      return data?.signedUrl ?? null;
    },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["scenes", id] });
    void queryClient.invalidateQueries({ queryKey: ["cast", id] });
    void queryClient.invalidateQueries({ queryKey: ["video", id] });
  }

  async function runStep(key: string, fn: () => Promise<unknown>) {
    setBusyStep(key);
    try {
      await fn();
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Step failed");
    } finally {
      setBusyStep(null);
    }
  }

  const regenStoryboard = useMutation({
    mutationFn: async () => {
      await storyboardFn({ data: { videoId: id, replace: true } });
    },
    onSuccess: () => {
      toast.success("Storyboard rewritten");
      invalidate();
      setVideoUrl(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Storyboard failed"),
  });

  async function generateAllArt() {
    const scenes = scenesQ.data ?? [];
    const cast = castQ.data ?? [];
    for (const c of cast) {
      if (c.characters && !c.characters.image_path) {
        await runStep(`char-${c.character_id}`, () => characterArtFn({ data: { characterId: c.character_id, style: videoQ.data?.style ?? "storybook" } }));
      }
    }
    for (const s of scenes) {
      await runStep(`scene-${s.id}`, () => sceneArtFn({ data: { sceneId: s.id } }));
    }
    toast.success("All scene art generated");
  }

  async function generateAllVoice() {
    for (const s of scenesQ.data ?? []) {
      await runStep(`voice-${s.id}`, () => voiceoverFn({ data: { sceneId: s.id } }));
    }
    toast.success("All voiceover generated");
  }

  async function composeAndExport() {
    const video = videoQ.data;
    const scenes = scenesQ.data ?? [];
    if (!video || scenes.length === 0) return;
    setProgress({ ratio: 0.01, label: "Preparing" });
    try {
      const { composeVideo } = await import("@/lib/video/compose");
      const inputs: ComposeSceneInput[] = scenes.map((s) => ({
        sceneIndex: s.scene_index,
        imagePath: s.image_path,
        clipPaths: [s.audio_path, ...s.dialogues.map((d) => d.audio_path ?? null)].filter((p): p is string => Boolean(p)),
      }));
      const result = await composeVideo(supabase, video.id, inputs, {
        resolution: video.resolution,
        bgmEnabled: video.bgm_enabled,
        mood: video.mood ?? "warm",
        onProgress: (ratio, label) => setProgress({ ratio, label }),
      });
      const { data: userData } = await supabase.auth.getUser();
      const path = `${userData.user?.id}/${video.id}/final-${video.resolution}-${Date.now()}.mp4`;
      const { error } = await supabase.storage
        .from("final-videos")
        .upload(path, result.blob, { contentType: "video/mp4", upsert: false });
      if (error) throw new Error("Could not save the video: " + error.message);
      await supabase.from("videos").update({ status: "ready", final_video_path: path }).eq("id", video.id);
      setVideoUrl(URL.createObjectURL(result.blob));
      toast.success("Video rendered and saved to your library");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rendering failed");
    } finally {
      setProgress(null);
    }
  }

  const saveScene = useMutation({
    mutationFn: async ({ sceneId, narration }: { sceneId: string; narration: string }) => {
      const { error } = await supabase.from("scenes").update({ narration }).eq("id", sceneId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Narration saved");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const setVoice = useMutation({
    mutationFn: async ({ characterId, voiceId }: { characterId: string; voiceId: string }) => {
      const { error } = await supabase
        .from("video_characters")
        .update({ voice_id: voiceId })
        .eq("video_id", id)
        .eq("character_id", characterId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Voice updated");
      invalidate();
    },
  });

  const video = videoQ.data;
  const scenes = scenesQ.data ?? [];
  const cast = castQ.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" /> All videos
          </Link>
        </Button>

        {videoQ.isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !video ? (
          <p className="py-24 text-center text-muted-foreground">Video not found.</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">{video.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="capitalize">{video.status}</Badge>
                  <span>{ANIMATION_STYLES.find((s) => s.id === video.style)?.label ?? video.style}</span>
                  <span>· {video.language}</span>
                  <span>· {video.resolution}</span>
                  <span>· {video.bgm_enabled ? "music on" : "no music"}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={regenStoryboard.isPending}>
                      {regenStoryboard.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      Rewrite storyboard
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rewrite the storyboard?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The AI regenerates every scene, narration and dialogue. Current scene text is replaced; generated
                        art and audio for old scenes is detached.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => regenStoryboard.mutate()}>Rewrite</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" size="sm" disabled={busyStep !== null} onClick={generateAllArt}>
                  <ImageIcon className="size-4" /> Generate all art
                </Button>
                <Button variant="outline" size="sm" disabled={busyStep !== null} onClick={generateAllVoice}>
                  <Mic className="size-4" /> Generate all voices
                </Button>
                <Button size="sm" className="glow-gold" disabled={progress !== null || scenes.length === 0} onClick={composeAndExport}>
                  <Play className="size-4" /> Compose & export
                </Button>
              </div>
            </div>

            {progress && (
              <Card className="mt-6 border-primary/40">
                <CardContent className="pt-5">
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{progress.label}…</span>
                    <span className="text-muted-foreground">{Math.round(progress.ratio * 100)}%</span>
                  </div>
                  <Progress value={progress.ratio * 100} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Rendering happens in your browser — keep this tab open.
                  </p>
                </CardContent>
              </Card>
            )}

            {videoUrl && (
              <Card className="mt-6 border-primary/50 glow-gold">
                <CardContent className="pt-5">
                  <video src={videoUrl} controls className="w-full rounded-lg" />
                  <a href={videoUrl} download={`${video.title.replace(/[^\w-]+/g, "_")}.mp4`}>
                    <Button className="mt-3">
                      <Play className="size-4" /> Download MP4 ({video.resolution})
                    </Button>
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Characters */}
            <h2 className="font-display mt-10 text-xl font-bold">Cast</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cast.map((c) =>
                c.characters ? (
                  <Card key={c.character_id} className="border-border/70">
                    <CardContent className="pt-4">
                      <div className="flex gap-3">
                        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                          {c.characters.image_path ? (
                            <CharacterImage path={c.characters.image_path} fetchUrl={imageUrl.mutateAsync} />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <Wand2 className="size-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold">{c.characters.name}</div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{c.characters.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Select value={c.voice_id} onValueChange={(v) => setVoice.mutate({ characterId: c.character_id, voiceId: v })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VOICES.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyStep !== null}
                          onClick={() => runStep(`char-${c.character_id}`, () => characterArtFn({ data: { characterId: c.character_id, style: video.style } }))}
                        >
                          {busyStep === `char-${c.character_id}` ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                          {c.characters.image_path ? "Redo art" : "Generate art"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null,
              )}
            </div>

            {/* Scenes */}
            <h2 className="font-display mt-10 text-xl font-bold">Storyboard</h2>
            <div className="mt-4 space-y-4">
              {scenes.map((s) => (
                <SceneCard
                  key={s.id}
                  scene={s}
                  busyStep={busyStep}
                  onArt={() => runStep(`scene-${s.id}`, () => sceneArtFn({ data: { sceneId: s.id } }))}
                  onVoice={() => runStep(`voice-${s.id}`, () => voiceoverFn({ data: { sceneId: s.id } }))}
                  onSaveNarration={(narration) => saveScene.mutate({ sceneId: s.id, narration })}
                  fetchUrl={imageUrl.mutateAsync}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CharacterImage({ path, fetchUrl }: { path: string; fetchUrl: (args: { bucket: string; path: string }) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  if (url === null) {
    void fetchUrl({ bucket: "character-images", path }).then((u) => setUrl(u ?? ""));
  }
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-secondary" />;
}

function SceneCard({
  scene,
  busyStep,
  onArt,
  onVoice,
  onSaveNarration,
  fetchUrl,
}: {
  scene: SceneRow;
  busyStep: string | null;
  onArt: () => void;
  onVoice: () => void;
  onSaveNarration: (narration: string) => void;
  fetchUrl: (args: { bucket: string; path: string }) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [narration, setNarration] = useState(scene.narration);
  const [editing, setEditing] = useState(false);

  if (scene.image_path && url === undefined) {
    void fetchUrl({ bucket: "scene-assets", path: scene.image_path }).then((u) => setUrl(u ?? null));
  }

  return (
    <Card className="border-border/70">
      <CardContent className="pt-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-secondary sm:w-64">
            {scene.image_path && url ? (
              <img src={url} alt={scene.heading ?? ""} className="h-full w-full object-cover" />
            ) : scene.image_path ? (
              <div className="h-full w-full animate-pulse bg-secondary" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No art yet</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">Scene {scene.scene_index + 1}</div>
                <h3 className="font-semibold">{scene.heading}</h3>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" disabled={busyStep !== null} onClick={onArt}>
                  {busyStep === `scene-${scene.id}` ? <Loader2 className="size-3 animate-spin" /> : <ImageIcon className="size-3" />}
                  {scene.image_path ? "Redo art" : "Art"}
                </Button>
                <Button variant="outline" size="sm" disabled={busyStep !== null} onClick={onVoice}>
                  {busyStep === `voice-${scene.id}` ? <Loader2 className="size-3 animate-spin" /> : <Mic className="size-3" />}
                  {scene.audio_path || scene.dialogues.some((d) => d.audio_path) ? "Redo voice" : "Voice"}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{scene.description}</p>

            <div className="mt-3">
              {editing ? (
                <div className="space-y-2">
                  <Textarea rows={3} value={narration} onChange={(e) => setNarration(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { onSaveNarration(narration); setEditing(false); }}>
                      <Save className="size-3" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNarration(scene.narration); setEditing(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 rounded-md bg-secondary/60 px-3 py-2 text-sm italic">
                    {scene.narration ? `“${scene.narration}”` : <span className="not-italic text-muted-foreground">No narration</span>}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Edit narration">
                    <Save className="size-3" /> Edit
                  </Button>
                </div>
              )}
            </div>

            {scene.dialogues.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {scene.dialogues.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Label className="mt-0.5 shrink-0 text-xs text-accent">{d.character}</Label>
                    <span className="min-w-0 flex-1">
                      {d.line} {d.emotion && <span className="text-xs text-muted-foreground">({d.emotion})</span>}
                      {d.audio_path && <span className="ml-1 text-xs text-primary">♪</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
