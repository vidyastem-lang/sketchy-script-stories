import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Film, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { MODE_META, type VideoMode } from "@/lib/storyboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your videos — StoryReel" },
      { name: "description", content: "Your animated video projects in StoryReel." },
      { property: "og:title", content: "Your videos — StoryReel" },
      { property: "og:description", content: "Your animated video projects in StoryReel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

interface VideoRow {
  id: string;
  title: string;
  mode: VideoMode;
  status: string;
  resolution: string;
  updated_at: string;
  final_video_path: string | null;
}

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "secondary" | "default" | "outline" | "destructive" }
> = {
  draft: { label: "Draft", variant: "outline" },
  storyboard: { label: "Storyboard ready", variant: "secondary" },
  scenes: { label: "Generating scenes", variant: "secondary" },
  ready: { label: "Ready", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

function Dashboard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, mode, status, resolution, updated_at, final_video_path")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VideoRow[];
    },
  });

  const removeVideo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Video deleted");
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Your videos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick up a project or start something new.
            </p>
          </div>
          <Button className="glow-gold" asChild>
            <Link to="/create">New video</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : !data || data.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Film className="size-6" />
              </span>
              <h2 className="font-display text-xl font-bold">No videos yet</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Start with a story, script or a single sentence — StoryReel turns it into an
                animated video.
              </p>
              <Button className="mt-2" asChild>
                <Link to="/create">Create your first video</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((v) => {
              const status = STATUS_LABEL[v.status] ?? {
                label: "Unknown status",
                variant: "outline" as const,
              };
              return (
                <Card
                  key={v.id}
                  className="group relative overflow-hidden border-border/70 transition-colors hover:border-primary/50"
                >
                  <Link to="/video/$id" params={{ id: v.id }} className="block">
                    <div className="hero-radial film-grain relative flex h-32 items-center justify-center bg-secondary/40">
                      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <Clapperboard className="size-6" />
                      </span>
                    </div>
                    <CardContent className="pt-4">
                      <h3 className="line-clamp-1 font-semibold">{v.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{MODE_META[v.mode]?.label ?? v.mode}</Badge>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <span className="ml-auto">{v.resolution}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Updated {new Date(v.updated_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${v.title}`}
                        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{v.title}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the storyboard, generated art and audio. It cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => removeVideo.mutate(v.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
