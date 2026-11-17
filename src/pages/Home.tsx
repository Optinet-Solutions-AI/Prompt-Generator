// The start page.
//
//   Good evening, John                         [Continue where you left off]
//   ┌──────────── Custom prompt ───────────┐ ┌─ Sports banner ─┐ ┌─ Video ─┐
//   └───────────────────────────────────────┘ └─────────────────┘ └─────────┘
//   Your latest images                                     Open My images
//   [img] [img] [img] [img] [img] [img]
//   Libraries (My images, My videos, Shared with me)   Tools (Email checker)
//
// "Your latest images" comes from the copy of your library saved in this
// browser, so Home loads nothing from the internet and opens instantly.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { firstName } from '@/lib/auth-api';
import { peekImages, type StoredImage } from '@/lib/imageStore';
import { SCREENS, GROUP_LABELS, LAST_SCREEN_KEY, continueTarget, greetingFor, type ScreenId, type ScreenInfo } from '@/lib/nav/screens';
import { SCREEN_ICONS } from '@/components/layout/screen-icons';

// How many of your newest images Home shows.
const LATEST_COUNT = 6;

// Reads the remembered screen. Browser storage can be blocked, so never let it crash the page.
function readLastScreen(): string | null {
  try {
    return localStorage.getItem(LAST_SCREEN_KEY);
  } catch {
    return null;
  }
}

const screen = (id: ScreenId) => SCREENS.find(s => s.id === id) as ScreenInfo;

// The small round arrow in the corner of each "make something" tile.
function GoChip({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`grid place-items-center h-9 w-9 rounded-full transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
        dark ? 'bg-white text-[#17142E]' : 'border border-border text-foreground/70 group-hover:border-primary/40 group-hover:text-primary'
      }`}
      aria-hidden="true"
    >
      <ArrowUpRight className="h-4 w-4" />
    </span>
  );
}

// The big dark tile for the main tool. The faint frame corners and spark on the
// right are the logo's shapes: the frame is the banner a prompt turns into.
function CustomTile() {
  const s = screen('custom');
  const Icon = SCREEN_ICONS.custom;
  return (
    <Link
      to={s.path}
      className="group relative overflow-hidden rounded-3xl bg-[#17142E] text-white p-6 sm:p-7 min-h-[200px] sm:min-h-[220px] flex flex-col justify-between sm:col-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" aria-hidden="true" />
      <span className="pointer-events-none absolute right-24 -bottom-28 h-64 w-64 rounded-full bg-indigo-500/30 blur-3xl" aria-hidden="true" />
      <svg
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 h-40 w-40 text-white/[0.13] hidden sm:block transition-transform duration-500 group-hover:scale-105"
        viewBox="0 0 64 64" fill="none" aria-hidden="true"
      >
        <path d="M10 22V14a4 4 0 0 1 4-4h8M54 42v8a4 4 0 0 1-4 4h-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M29 20c1.1 7.6 3.9 10.4 11.5 11.5C32.9 32.6 30.1 35.4 29 43c-1.1-7.6-3.9-10.4-11.5-11.5C25.1 30.4 27.9 27.6 29 20z" fill="currentColor" />
      </svg>

      <span className="relative grid place-items-center h-11 w-11 rounded-2xl bg-white/10 ring-1 ring-white/15">
        <Icon className="h-5 w-5" />
      </span>
      <div className="relative mt-6 sm:mt-8 flex items-end justify-between gap-4">
        <div className="max-w-sm">
          <p className="font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-tight">{s.label}</p>
          <p className="mt-1.5 text-white/70">{s.blurb}</p>
        </div>
        <GoChip dark />
      </div>
    </Link>
  );
}

// A smaller white tile (Sports banner, Video) with a coloured icon.
function ToolTile({ id, chip }: { id: ScreenId; chip: string }) {
  const s = screen(id);
  const Icon = SCREEN_ICONS[id];
  return (
    <Link
      to={s.path}
      className="group rounded-3xl border border-border bg-card p-6 min-h-[168px] sm:min-h-[220px] flex flex-col justify-between transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className={`grid place-items-center h-11 w-11 rounded-2xl ${chip}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="mt-6 sm:mt-8 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold tracking-tight leading-tight">{s.label}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">{s.blurb}</p>
        </div>
        <GoChip />
      </div>
    </Link>
  );
}

// One picture in "Your latest images". Opens My images.
function LatestImage({ image }: { image: StoredImage }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      to={screen('images').path}
      className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={image.brand ? `${image.brand} image — open My images` : 'Open My images'}
    >
      {broken ? (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground/50"><Images className="h-6 w-6" /></span>
      ) : (
        <img
          src={image.public_url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      {image.brand && (
        <span className="absolute left-2 bottom-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[11px] font-medium text-white">
          {image.brand}
        </span>
      )}
    </Link>
  );
}

// A quiet list of shortcuts (Libraries, Tools) under the pictures.
function ShortcutList({ group }: { group: 'libraries' | 'tools' }) {
  return (
    // min-w-0: lets the long descriptions shorten with "…" instead of widening the page on a phone.
    <section className="min-w-0">
      <h2 className="font-display text-lg font-bold tracking-tight mb-3">{GROUP_LABELS[group]}</h2>
      <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {SCREENS.filter(s => s.group === group).map(s => {
          const Icon = SCREEN_ICONS[s.id];
          return (
            <li key={s.id}>
              <Link to={s.path} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/60">
                <span className="grid place-items-center h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-sm text-muted-foreground truncate">{s.blurb}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const greeting = greetingFor(new Date().getHours());
  const heading = user ? `${greeting}, ${firstName(user)}` : greeting;
  const resume = continueTarget(readLastScreen());
  const ResumeIcon = resume ? SCREEN_ICONS[resume.id] : null;
  // Read once when Home opens (Home is opened fresh each visit).
  const [latest] = useState(() => peekImages({ kind: 'mine' }, LATEST_COUNT));

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[2rem] sm:text-[2.75rem] font-bold tracking-tight leading-[1.05]">{heading}</h1>
          <p className="mt-2 text-muted-foreground">Start something new, or carry on where you left off.</p>
        </div>
        {resume && ResumeIcon && (
          <Link
            to={resume.path}
            className="group flex items-center gap-3 self-start sm:self-auto rounded-2xl border border-border bg-card pl-2.5 pr-4 py-2.5 shadow-sm hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid place-items-center h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary">
              <ResumeIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Continue where you left off</span>
              <span className="block font-medium">{resume.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ml-1 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>

      <section aria-label={GROUP_LABELS.create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CustomTile />
        <ToolTile id="sports" chip="bg-amber-100 text-amber-700" />
        <ToolTile id="video" chip="bg-rose-100 text-rose-600" />
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="font-display text-xl font-bold tracking-tight">Your latest images</h2>
          {latest.length > 0 && (
            <Link to={screen('images').path} className="text-sm font-medium text-primary hover:underline underline-offset-4">
              Open My images
            </Link>
          )}
        </div>
        {latest.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {latest.map(img => <LatestImage key={img.id} image={img} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium">Your newest images will show up here.</p>
              <p className="text-sm text-muted-foreground mt-1">Make one, or open My images to load the ones you already have.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button asChild variant="outline"><Link to={screen('images').path}>Open My images</Link></Button>
              <Button asChild><Link to={screen('custom').path}>Make an image</Link></Button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <ShortcutList group="libraries" />
        <ShortcutList group="tools" />
      </div>
    </div>
  );
}
