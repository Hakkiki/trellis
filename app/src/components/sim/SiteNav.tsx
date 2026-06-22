import { Menu } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LOGO = `${BASE}/trellis-lockup-dark.svg`;
const GITHUB = "https://github.com/hakkiki/trellis";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

const links = [
  { href: `${BASE}/`, label: "Home" },
  { href: `${BASE}/simulator`, label: "Simulator" },
  { href: `${BASE}/blast-radius`, label: "Blast radius" },
  { href: `${BASE}/promotion`, label: "Promotion" },
  { href: `${BASE}/docs/the-case`, label: "Docs" },
];

function useActivePath() {
  const [path, setPath] = React.useState<string | null>(null);
  React.useEffect(() => setPath(window.location.pathname.replace(/\/$/, "")), []);
  return path;
}

function isActive(href: string, path: string | null) {
  if (path === null) return false;
  const h = href.replace(/\/$/, "");
  if (h === BASE) return path === BASE || path === `${BASE}`;
  return path === h || path.startsWith(`${h}/`);
}

export default function SiteNav() {
  const path = useActivePath();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-5">
        <a href={`${BASE}/`} className="flex items-center" aria-label="Trellis home">
          <img src={LOGO} alt="Trellis" className="h-7 w-auto" />
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                isActive(l.href, path)
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href={`${BASE}/simulator`}>Open simulator</a>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="GitHub">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              <GithubIcon className="size-4" />
            </a>
          </Button>

          {/* Mobile drawer */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="dark text-foreground w-72">
              <SheetHeader>
                <SheetTitle>
                  <img src={LOGO} alt="Trellis" className="h-7 w-auto" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-3">
                {links.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <a
                      href={l.href}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition",
                        isActive(l.href, path)
                          ? "text-foreground bg-accent"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                      )}
                    >
                      {l.label}
                    </a>
                  </SheetClose>
                ))}
                <a
                  href={GITHUB}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
                >
                  <GithubIcon className="size-4" /> GitHub
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
