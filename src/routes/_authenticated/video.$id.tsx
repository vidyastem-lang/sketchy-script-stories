import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Save,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateCharacterArt,
  generateSceneArt,
  generateSceneVoiceover,
  generateStoryboard,
  pollSceneAnimation,
  startSceneAnimation,
} from "@/lib/ai.functions";
import { ANIMATION_STYLES, VOICES, type Mood } from "@/lib/storyboard";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      {
        name: "description",
        content: "Review and render your animated video in the StoryReel studio.",
      },
      { property: "og:title", content: "Video studio — StoryReel" },
      {
        property: "og:description",
        content: "Review and render your animated video in the StoryReel studio.",
      },
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
  image_prompt: string;
  dialogues: {
    character: string;
    line: string;
    emotion?: string | undefined;
    audio_path?: string | null | undefined;
  }[];
  image_path: string | null;
  audio_path: string | null;
  emotion: string | null;
}

const editorDialoguesSchema = z.array(
  z.object({
    character: z.string(),
    line: z.string(),
    emotion: z.string().optional(),
    audio_path: z.string().nullable().optional(),
  }),
);

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

async function getStorageSignedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  if (error) {
    console.error(`Could not create a signed URL for ${bucket}/${path}:`, error);
    return null;
  }
  return data.signedUrl;
}

function describeExportError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; name?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim())
      return candidate.message.trim();
    if (typeof candidate.name === "string" && candidate.name.trim()) return candidate.name.trim();
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Some browser error objects are not serializable; use the safe fallback below.
    }
  }
  return "The renderer returned no error details. Check the browser console and try again.";
}

function Studio() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const storyboardFn = useServerFn(generateStoryboard);
  const characterArtFn = useServerFn(generateCharacterArt);
  const sceneArtFn = useServerFn(generateSceneArt);
  const voiceoverFn = useServerFn(generateSceneVoiceover);
  const startAnimationFn = useServerFn(startSceneAnimation);
  const pollAnimationFn = useServerFn(pollSceneAnimation);

  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const videoQ = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").eq("id", id).single();
      if (error) throw error;
      return data as VideoRow;
    },
  });

  const finalVideoPath = videoQ.data?.final_video_path ?? null;
  const downloadFileName = `${videoQ.data?.title.trim().replace(/[^\w-]+/g, "_") || "storyreel-video"}.mp4`;
  const savedPlaybackUrlQ = useQuery({
    queryKey: ["final-video-playback-url", id, finalVideoPath],
    enabled: finalVideoPath !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (!finalVideoPath) throw new Error("This video has not been saved yet.");
      const { data, error } = await supabase.storage
        .from("final-videos")
        .createSignedUrl(finalVideoPath, 60 * 60 * 24);
      if (error) throw new Error("Could not load the saved video: " + error.message);
      return data.signedUrl;
    },
  });
  const savedDownloadUrlQ = useQuery({
    queryKey: ["final-video-download-url", id, finalVideoPath, downloadFileName],
    enabled: finalVideoPath !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (!finalVideoPath) throw new Error("This video has not been saved yet.");
      const { data, error } = await supabase.storage
        .from("final-videos")
        .createSignedUrl(finalVideoPath, 60 * 60 * 24, { download: downloadFileName });
      if (error) throw new Error("Could not prepare the MP4 download: " + error.message);
      return data.signedUrl;
    },
  });

  const scenesQ = useQuery({
    queryKey: ["scenes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenes")
        .select("*")
        .eq("video_id", id)
        .order("scene_index");
      if (error) throw error;
      return data.map((s): SceneRow => ({
        ...s,
        dialogues: editorDialoguesSchema.parse(s.dialogues ?? []),
      }));
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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["scenes", id] });
    void queryClient.invalidateQueries({ queryKey: ["cast", id] });
    void queryClient.invalidateQueries({ queryKey: ["video", id] });
  }

  async function runStep(key: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusyStep(key);
    try {
      await fn();
      setVideoUrl(null);
      invalidate();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Step failed");
      return false;
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
    let failed = 0;
    for (const c of cast) {
      if (c.characters && !c.characters.image_path) {
        if (
          !(await runStep(`char-${c.character_id}`, () =>
            characterArtFn({
              data: { characterId: c.character_id, style: videoQ.data?.style ?? "storybook" },
            }),
          ))
        )
          failed++;
      }
    }
    for (const s of scenes) {
      if (!(await runStep(`scene-${s.id}`, () => sceneArtFn({ data: { sceneId: s.id } }))))
        failed++;
    }
    if (failed)
      toast.error(
        `Art generation finished with ${failed} failed item${failed === 1 ? "" : "s"}. Retry those items.`,
      );
    else toast.success("All scene art generated");
  }

  async function generateAllVoice() {
    let failed = 0;
    for (const s of scenesQ.data ?? []) {
      if (!(await runStep(`voice-${s.id}`, () => voiceoverFn({ data: { sceneId: s.id } }))))
        failed++;
    }
    if (failed)
      toast.error(
        `Voiceover generation finished with ${failed} failed scene${failed === 1 ? "" : "s"}. Retry those scenes.`,
      );
    else toast.success("All TTS previews generated");
  }

  async function composeAndExport() {
    const video = videoQ.data;
    let scenes = scenesQ.data ?? [];
    if (!video || scenes.length === 0) return;
    setProgress({ ratio: 0.01, label: "Preparing" });
    try {
      const basicMode = scenes.every((scene) => scene.image_prompt === "NO_AI_FALLBACK");
      const scenesWithoutArt = basicMode ? [] : scenes.filter((scene) => !scene.image_path);
      if (scenesWithoutArt.length > 0) {
        setVideoUrl(null);
        const imagePaths = new Map<string, string>();
        for (const [index, scene] of scenesWithoutArt.entries()) {
          setProgress({
            ratio: (0.1 * (index + 1)) / scenesWithoutArt.length,
            label: `Generating scene art ${index + 1} of ${scenesWithoutArt.length}`,
          });
          const generated = await sceneArtFn({ data: { sceneId: scene.id } });
          if (!generated.image_path)
            throw new Error(
              `Scene ${scene.scene_index + 1} art was not saved. Try exporting again.`,
            );
          imagePaths.set(scene.id, generated.image_path);
          invalidate();
        }
        scenes = scenes.map((scene) => ({
          ...scene,
          image_path: imagePaths.get(scene.id) ?? scene.image_path,
        }));
      }

      setVideoUrl(null);
      const animatedPaths = new Map<string, string>();
      const pending: {
        sceneId: string;
        sceneIndex: number;
        jobId: string;
        fingerprint: string;
      }[] = [];

      for (const [index, scene] of (basicMode ? [] : scenes).entries()) {
        setProgress({
          ratio: 0.1 + (0.08 * index) / scenes.length,
          label: `Preparing animation ${index + 1} of ${scenes.length}`,
        });
        const started = await startAnimationFn({ data: { videoId: video.id, sceneId: scene.id } });
        if (started.status === "completed") {
          animatedPaths.set(scene.id, started.videoPath);
        } else {
          pending.push({
            sceneId: scene.id,
            sceneIndex: scene.scene_index,
            jobId: started.jobId,
            fingerprint: started.fingerprint,
          });
        }
      }

      const animationDeadline = Date.now() + 30 * 60 * 1000;
      while (pending.length > 0) {
        if (Date.now() >= animationDeadline) {
          throw new Error(
            "Scene animation is still processing. Click Animate & Export again to resume the saved jobs.",
          );
        }
        await new Promise((resolve) => window.setTimeout(resolve, 8000));
        const results = await Promise.all(
          pending.map(async (job) => ({
            job,
            result: await pollAnimationFn({
              data: {
                videoId: video.id,
                sceneId: job.sceneId,
                jobId: job.jobId,
                fingerprint: job.fingerprint,
              },
            }),
          })),
        );
        for (const { job, result: animation } of results) {
          if (animation.status === "completed") animatedPaths.set(job.sceneId, animation.videoPath);
        }
        const completedJobs = animatedPaths.size;
        const inFlightProgress = results.reduce(
          (sum, item) =>
            sum +
            (item.result.status === "completed"
              ? 100
              : Math.min(99, Math.max(0, item.result.progress))),
          0,
        );
        const fraction = (completedJobs + inFlightProgress / 100) / scenes.length;
        setProgress({
          ratio: 0.1 + 0.58 * Math.min(1, fraction),
          label: `Animating characters · ${completedJobs} of ${scenes.length} scenes ready`,
        });
        for (let i = pending.length - 1; i >= 0; i--) {
          if (animatedPaths.has(pending[i]!.sceneId)) pending.splice(i, 1);
        }
      }

      const { composeVideo } = await import("@/lib/video/compose");
      const inputs: ComposeSceneInput[] = scenes.map((s) => ({
        sceneIndex: s.scene_index,
        imagePath: s.image_path,
        heading: s.heading ?? `Scene ${s.scene_index + 1}`,
        description: s.description,
        videoPath: animatedPaths.get(s.id) ?? null,
        clipPaths: [],
      }));
      const result = await composeVideo(supabase, video.id, inputs, {
        resolution: video.resolution,
        bgmEnabled: video.bgm_enabled,
        mood: video.mood ?? "warm",
        onProgress: (ratio, label) => setProgress({ ratio: 0.68 + ratio * 0.32, label }),
      });
      setVideoUrl(URL.createObjectURL(result.blob));
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user)
        throw new Error("Your session expired. Refresh the page and try exporting again.");
      const path = `${userData.user.id}/${video.id}/final-${video.resolution}-${Date.now()}.mp4`;
      const { error } = await supabase.storage
        .from("final-videos")
        .upload(path, result.blob, { contentType: "video/mp4", upsert: false });
      if (error) throw new Error("Could not save the video: " + error.message);
      const { error: updateError } = await supabase
        .from("videos")
        .update({ status: "ready", final_video_path: path })
        .eq("id", video.id);
      if (updateError)
        throw new Error(
          "The MP4 was uploaded, but its library status could not be updated: " +
            updateError.message,
        );
      toast.success("Video rendered and saved to your library");
      invalidate();
    } catch (err) {
      invalidate();
      console.error("Video export failed:", err);
      const message = describeExportError(err);
      toast.error(message.length > 500 ? `${message.slice(0, 497)}…` : message);
    } finally {
      setProgress(null);
    }
  }

  const saveScene = useMutation({
    mutationFn: async ({ sceneId, narration }: { sceneId: string; narration: string }) => {
      const { error } = await supabase
        .from("scenes")
        .update({ narration, audio_path: null })
        .eq("id", sceneId);
      if (error) throw new Error("Could not save narration: " + error.message);
      const { error: videoError } = await supabase
        .from("videos")
        .update({ status: "scenes", final_video_path: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (videoError)
        throw new Error(
          "Narration was saved, but the video status could not be updated: " + videoError.message,
        );
    },
    onSuccess: () => {
      setVideoUrl(null);
      toast.success("Narration saved. Veo will use this text for the scene's generated speech.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const setVoice = useMutation({
    mutationFn: async ({
      characterId,
      characterName,
      voiceId,
    }: {
      characterId: string;
      characterName: string;
      voiceId: string;
    }) => {
      const staleScenes = (scenesQ.data ?? []).filter((scene) =>
        scene.dialogues.some((dialogue) => dialogue.character === characterName),
      );
      for (const scene of staleScenes) {
        const dialogues = scene.dialogues.map((dialogue) =>
          dialogue.character === characterName ? { ...dialogue, audio_path: null } : dialogue,
        );
        const { error: sceneError } = await supabase
          .from("scenes")
          .update({ dialogues })
          .eq("id", scene.id);
        if (sceneError)
          throw new Error(
            "Could not invalidate audio for the changed voice: " + sceneError.message,
          );
      }
      const { error } = await supabase
        .from("video_characters")
        .update({ voice_id: voiceId })
        .eq("video_id", id)
        .eq("character_id", characterId);
      if (error) throw error;
      const { error: videoError } = await supabase
        .from("videos")
        .update({ status: "scenes", final_video_path: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (videoError)
        throw new Error(
          "Voice was updated, but the video status could not be updated: " + videoError.message,
        );
    },
    onSuccess: () => {
      setVideoUrl(null);
      toast.success("Voice preference saved. Veo-generated export voices are created separately.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the voice"),
  });

  const video = videoQ.data;
  const scenes = scenesQ.data ?? [];
  const basicMode =
    scenes.length > 0 && scenes.every((scene) => scene.image_prompt === "NO_AI_FALLBACK");
  const cast = castQ.data ?? [];
  const playbackUrl = videoUrl ?? savedPlaybackUrlQ.data;
  const downloadUrl = videoUrl ?? savedDownloadUrlQ.data;

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
        ) : videoQ.isError ? (
          <p role="alert" className="py-24 text-center text-destructive">
            Could not load this video:{" "}
            {videoQ.error instanceof Error ? videoQ.error.message : "Please try again."}
          </p>
        ) : !video ? (
          <p className="py-24 text-center text-muted-foreground">Video not found.</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">{video.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="capitalize">
                    {video.status}
                  </Badge>
                  <span>
                    {ANIMATION_STYLES.find((s) => s.id === video.style)?.label ?? video.style}
                  </span>
                  <span>· {video.language}</span>
                  <span>· {video.resolution}</span>
                  <span>· {video.bgm_enabled ? "music on" : "no music"}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!basicMode && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={regenStoryboard.isPending}>
                        {regenStoryboard.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        Rewrite storyboard
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rewrite the storyboard?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The AI regenerates every scene, narration and dialogue. Current scene text
                          is replaced; generated art and audio for old scenes is detached.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => regenStoryboard.mutate()}>
                          Rewrite
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {!basicMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyStep !== null}
                    onClick={generateAllArt}
                  >
                    <ImageIcon className="size-4" /> Generate all art
                  </Button>
                )}
                {!basicMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyStep !== null}
                    onClick={generateAllVoice}
                  >
                    <Mic className="size-4" /> Generate TTS previews
                  </Button>
                )}
                <Button
                  size="sm"
                  className="glow-gold"
                  disabled={progress !== null || scenes.length === 0}
                  onClick={composeAndExport}
                >
                  <Play className="size-4" />{" "}
                  {basicMode ? "Render basic video" : "Animate & export"}
                </Button>
              </div>
            </div>

            {progress && (
              <Card className="mt-6 border-primary/40">
                <CardContent className="pt-5">
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{progress.label}…</span>
                    <span className="text-muted-foreground">
                      {Math.round(progress.ratio * 100)}%
                    </span>
                  </div>
                  <Progress value={progress.ratio * 100} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Rendering happens in your browser — keep this tab open.
                  </p>
                </CardContent>
              </Card>
            )}

            {(videoUrl || video.final_video_path) && (
              <Card className="mt-6 border-primary/50 glow-gold">
                <CardContent className="pt-5">
                  {playbackUrl ? (
                    <video
                      src={playbackUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full rounded-lg"
                    />
                  ) : savedPlaybackUrlQ.isError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {savedPlaybackUrlQ.error.message}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading saved video…
                    </div>
                  )}
                  {downloadUrl ? (
                    <Button className="mt-3" asChild>
                      <a href={downloadUrl} download={downloadFileName}>
                        <Download className="size-4" /> Download MP4 ({video.resolution})
                      </a>
                    </Button>
                  ) : savedDownloadUrlQ.isError ? (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {savedDownloadUrlQ.error.message}
                    </p>
                  ) : null}
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
                            <CharacterImage path={c.characters.image_path} />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <Wand2 className="size-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold">{c.characters.name}</div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {c.characters.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Select
                          value={c.voice_id}
                          onValueChange={(v) =>
                            setVoice.mutate({
                              characterId: c.character_id,
                              characterName: c.characters?.name ?? "",
                              voiceId: v,
                            })
                          }
                        >
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
                          onClick={() =>
                            runStep(`char-${c.character_id}`, () =>
                              characterArtFn({
                                data: { characterId: c.character_id, style: video.style },
                              }),
                            )
                          }
                        >
                          {busyStep === `char-${c.character_id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Wand2 className="size-3" />
                          )}
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
                  basicMode={basicMode}
                  busyStep={busyStep}
                  onArt={() =>
                    runStep(`scene-${s.id}`, () => sceneArtFn({ data: { sceneId: s.id } }))
                  }
                  onVoice={() =>
                    runStep(`voice-${s.id}`, () => voiceoverFn({ data: { sceneId: s.id } }))
                  }
                  onSaveNarration={(narration) => saveScene.mutate({ sceneId: s.id, narration })}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CharacterImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    void getStorageSignedUrl("character-images", path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : url === undefined ? (
    <div className="h-full w-full animate-pulse bg-secondary" />
  ) : (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Preview unavailable
    </div>
  );
}

function SceneCard({
  scene,
  basicMode,
  busyStep,
  onArt,
  onVoice,
  onSaveNarration,
}: {
  scene: SceneRow;
  basicMode: boolean;
  busyStep: string | null;
  onArt: () => void;
  onVoice: () => void;
  onSaveNarration: (narration: string) => void;
}) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [narration, setNarration] = useState(scene.narration);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    if (!scene.image_path) return;
    void getStorageSignedUrl("scene-assets", scene.image_path).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [scene.image_path]);

  return (
    <Card className="border-border/70">
      <CardContent className="pt-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-secondary sm:w-64">
            {scene.image_path && url ? (
              <img src={url} alt={scene.heading ?? ""} className="h-full w-full object-cover" />
            ) : scene.image_path && url === undefined ? (
              <div className="h-full w-full animate-pulse bg-secondary" />
            ) : scene.image_path ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Preview unavailable
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No art yet
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Scene {scene.scene_index + 1}
                </div>
                <h3 className="font-semibold">{scene.heading}</h3>
              </div>
              {!basicMode && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" disabled={busyStep !== null} onClick={onArt}>
                    {busyStep === `scene-${scene.id}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ImageIcon className="size-3" />
                    )}
                    {scene.image_path ? "Redo art" : "Art"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyStep !== null}
                    onClick={onVoice}
                  >
                    {busyStep === `voice-${scene.id}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Mic className="size-3" />
                    )}
                    {scene.audio_path || scene.dialogues.some((d) => d.audio_path)
                      ? "Redo preview"
                      : "Voice preview"}
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{scene.description}</p>

            <div className="mt-3">
              {editing ? (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        onSaveNarration(narration);
                        setEditing(false);
                      }}
                    >
                      <Save className="size-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNarration(scene.narration);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 rounded-md bg-secondary/60 px-3 py-2 text-sm italic">
                    {scene.narration ? (
                      `“${scene.narration}”`
                    ) : (
                      <span className="not-italic text-muted-foreground">No narration</span>
                    )}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(true)}
                    aria-label="Edit narration"
                  >
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
                      {d.line}{" "}
                      {d.emotion && (
                        <span className="text-xs text-muted-foreground">({d.emotion})</span>
                      )}
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
