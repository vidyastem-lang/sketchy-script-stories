import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCharacterArt } from "@/lib/ai.functions";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ANIMATION_STYLES } from "@/lib/storyboard";

export const Route = createFileRoute("/_authenticated/characters")({
  head: () => ({
    meta: [
      { title: "Character library — StoryReel" },
      { name: "description", content: "Manage the cast of characters available to your StoryReel videos." },
      { property: "og:title", content: "Character library — StoryReel" },
      { property: "og:description", content: "Manage the cast of characters available to your StoryReel videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharactersPage,
});

interface CharacterRow {
  id: string;
  name: string;
  description: string;
  image_path: string | null;
  source: string;
}

function CharactersPage() {
  const queryClient = useQueryClient();
  const artFn = useServerFn(generateCharacterArt);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("storybook");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["characters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CharacterRow[];
    },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["characters"] });
  }

  async function addCharacter(generateArt: boolean) {
    if (!name.trim()) {
      toast.error("Give the character a name");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("characters")
        .insert({
          user_id: userData.user?.id,
          name: name.trim(),
          description: description.trim(),
          source: generateArt ? "generated" : "uploaded",
        })
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error("Could not save character");
      if (generateArt) {
        await artFn({ data: { characterId: created.id, style } });
      }
      setName("");
      setDescription("");
      toast.success("Character added");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add character");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(characterId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const path = `${userData.user?.id}/${characterId}.png`;
        const { error } = await supabase.storage
          .from("character-images")
          .upload(path, file, { contentType: file.type, upsert: true });
        if (error) throw error;
        await supabase.from("characters").update({ image_path: path, source: "uploaded" }).eq("id", characterId);
        toast.success("Artwork uploaded");
        invalidate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    };
    input.click();
  }

  async function redoArt(characterId: string) {
    try {
      await artFn({ data: { characterId, style } });
      toast.success("Artwork generated");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
  }

  const remove = useMutation({
    mutationFn: async (c: CharacterRow) => {
      const { error } = await supabase.from("characters").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Character removed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Character library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your cast travels between videos — storyboard characters with matching names reuse these entries.
        </p>

        {/* Add */}
        <Card className="mt-8 border-border/70">
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="char-name">Name</Label>
                <Input id="char-name" placeholder="e.g. Mimi the fox" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Art style (for generated art)</Label>
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="char-desc">Who they are</Label>
                <Textarea
                  id="char-desc"
                  rows={2}
                  placeholder="Personality, role in stories, appearance details…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="glow-gold" disabled={busy} onClick={() => addCharacter(true)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Add & generate art
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => addCharacter(false)}>
                <Plus className="size-4" /> Add without art
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Library */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data ?? []).map((c) => (
              <Card key={c.id} className="group border-border/70">
                <CardContent className="pt-4">
                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-secondary">
                    {c.image_path ? (
                      <CharacterThumb path={c.image_path} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Wand2 className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <h3 className="font-semibold">{c.name}</h3>
                    <Badgeish source={c.source} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => uploadImage(c.id)}>
                      Upload
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => redoArt(c.id)}>
                      {c.image_path ? "Redo" : "Generate"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="ml-auto" aria-label={`Remove ${c.name}`}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The character leaves your library. Existing videos keep their scenes.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => remove.mutate(c)}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Badgeish({ source }: { source: string }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {source}
    </span>
  );
}

function CharacterThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  if (url === null) {
    void supabase.storage.from("character-images").createSignedUrl(path, 60 * 60 * 24).then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-secondary" />;
}
