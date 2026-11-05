import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clapperboard, Download, Mic, Palette, Play, Sparkles, Upload, Users, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroImg from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StoryReel — Turn Any Story into an Animated Video" },
      {
        name: "description",
        content:
          "StoryReel turns stories, scripts and one-line ideas into fully animated videos with consistent characters, voiceovers, music and one-click MP4 download.",
      },
      { property: "og:title", content: "StoryReel — Turn Any Story into an Animated Video" },
      {
        property: "og:description",
        content: "AI storyboards, character design, voiceovers, background music and MP4 export — all in one studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Upload,
    title: "Share your story",
    text: "A one-line idea, a full story or a finished script (TXT, DOCX or PDF).",
  },
  {
    icon: Users,
    title: "Review the storyboard",
    text: "AI breaks it into scenes, casts characters, writes narration and dialogue.",
  },
  {
    icon: Download,
    title: "Watch & download",
    text: "Animated scenes with voiceover, music and motion — exported as MP4.",
  },
];

const FEATURES = [
  { icon: Wand2, title: "AI storyboard", text: "Screenplay expansion, scene breakdown, emotions and pacing." },
  { icon: Palette, title: "Six art styles", text: "Storybook, anime, cartoon, 3D render, watercolor and comic." },
  { icon: Users, title: "Your characters", text: "Generate consistent characters or upload your own art." },
  { icon: Mic, title: "Voiced scenes", text: "Narrator + per-character voices, synced to every scene." },
  { icon: Clapperboard, title: "Animated motion", text: "Camera moves, crossfades and scene transitions built in." },
  { icon: Download, title: "MP4 export", text: "720p and 1080p files you can download and keep." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">StoryReel</span>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link to="/create">
              Start creating
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-radial film-grain relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <Badge variant="outline" className="mb-5 gap-1.5 border-primary/40 text-primary">
              <Sparkles className="size-3.5" /> AI animation studio
            </Badge>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Turn any story into a <span className="text-gradient">fully animated video</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Paste a story, script or one-line idea. StoryReel writes the screenplay, designs the cast, voices every
              scene and renders a finished MP4 — ready to download.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="glow-gold gap-2" asChild>
                <Link to="/create">
                  Create a video — no account needed <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Start generating videos right away — no account required.
            </p>
          </div>
          <div className="relative">
            <img
              src={heroImg}
              alt="An animated story scene produced with StoryReel"
              className="w-full rounded-2xl border border-border shadow-2xl"
            />
            <div className="absolute -bottom-5 left-6 flex items-center gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 backdrop-blur">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent/20 text-accent">
                <Play className="size-4" />
              </span>
              <div className="text-sm">
                <div className="font-semibold">Fully rendered MP4</div>
                <div className="text-muted-foreground">Voice, music, motion</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="border-border/70 bg-card">
              <CardContent className="pt-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-display text-sm font-bold text-muted-foreground">STEP {i + 1}</span>
                </div>
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-display text-3xl font-bold tracking-tight">Everything a mini animation studio does</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <f.icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Your first animated video is one prompt away
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Try it with something small — a bedtime story, a product pitch, a poem.
        </p>
        <Button size="lg" className="glow-gold mt-8 gap-2" asChild>
          <Link to="/auth" search={{ mode: "signup" }}>
            Start creating <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        StoryReel — AI Animated Video Studio
      </footer>
    </div>
  );
}
