import { Link } from "@tanstack/react-router";
import { Clapperboard, Film, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">StoryReel</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard">
              <Film className="size-4" /> Videos
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/characters">
              <Users className="size-4" /> Characters
            </Link>
          </Button>
          <Button size="sm" className="mx-2" asChild>
            <Link to="/create">
              <Plus className="size-4" /> New video
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
