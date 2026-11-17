// "Shared with me" — one place that lists every library you can open besides your own:
//
//   [Individual items]  [Team archive]               ← two cards
//   Colleagues' libraries
//   [picture preview]  [picture preview]  …          ← one card per colleague
//   Everyone (admins only): search + a list
//
// Each card links to the Images and Videos libraries for that source.
// A colleague's card shows up to 3 of their images if their library was opened
// before in this browser (nothing extra is loaded); otherwise their initials.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, firstName, type Person } from '@/lib/auth-api';
import type { LibrarySource } from '@/components/auth/LibrarySourcePicker';
import { filterPeople, libraryPath } from '@/lib/nav/library-address';
import { peekImages } from '@/lib/imageStore';
import { SCREEN_ICONS } from '@/components/layout/screen-icons';

// Soft colours for people's initials (and the panel behind them). The same
// person always gets the same one. Written out in full so Tailwind keeps them.
const TINTS = [
  { avatar: 'bg-indigo-100 text-indigo-700', panel: 'bg-indigo-50' },
  { avatar: 'bg-amber-100 text-amber-800', panel: 'bg-amber-50' },
  { avatar: 'bg-rose-100 text-rose-700', panel: 'bg-rose-50' },
  { avatar: 'bg-emerald-100 text-emerald-700', panel: 'bg-emerald-50' },
  { avatar: 'bg-sky-100 text-sky-700', panel: 'bg-sky-50' },
  { avatar: 'bg-violet-100 text-violet-700', panel: 'bg-violet-50' },
];
function tintFor(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[n % TINTS.length];
}

const displayName = (p: Person) => p.name || p.email || 'Someone';
const initialsOf = (p: Person) =>
  displayName(p).split(/[\s@.]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

// Round photo, or coloured initials when the person has no photo.
function Avatar({ person, size = 'sm' }: { person: Person; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-8 h-8 text-xs';
  return person.avatar_url
    ? <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" className={`${box} rounded-full shrink-0 object-cover`} />
    : <span className={`${box} ${tintFor(person.id).avatar} rounded-full shrink-0 grid place-items-center font-semibold`} aria-hidden="true">{initialsOf(person)}</span>;
}

// The "Images" and "Videos" links for one source.
function OpenLinks({ source }: { source: LibrarySource }) {
  const ImagesIcon = SCREEN_ICONS.images;
  const VideosIcon = SCREEN_ICONS.videos;
  const cls = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div className="flex gap-2 shrink-0">
      <Link to={libraryPath('images', source)} className={cls}><ImagesIcon className="h-4 w-4" />Images</Link>
      <Link to={libraryPath('videos', source)} className={cls}><VideosIcon className="h-4 w-4" />Videos</Link>
    </div>
  );
}

// A card for a library that isn't one person's: Individual items, Team archive.
function SourceCard({ source, title, hint, icon, chip }: {
  source: LibrarySource; title: string; hint: string; icon: React.ReactNode; chip: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className={`grid place-items-center h-11 w-11 shrink-0 rounded-2xl ${chip}`}>{icon}</span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold tracking-tight leading-tight">{title}</p>
          <p className="text-sm text-muted-foreground mt-1">{hint}</p>
        </div>
      </div>
      <OpenLinks source={source} />
    </div>
  );
}

// The preview strip fills its width whether there are 1, 2 or 3 pictures.
const PREVIEW_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

// One preview picture; a broken link turns into a plain grey tile.
function PreviewImage({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  return broken
    ? <span className="bg-muted" />
    : <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />;
}

// One colleague who shared their whole library with me.
function PersonCard({ person }: { person: Person }) {
  const [preview] = useState(() => peekImages({ kind: 'shared', ownerId: person.id }, 3));
  const source: LibrarySource = { kind: 'shared', ownerId: person.id, name: firstName(person) };
  return (
    <div className="rounded-3xl border border-border bg-card overflow-hidden flex flex-col">
      {preview.length > 0 ? (
        <div className={`grid ${PREVIEW_COLS[preview.length]} gap-0.5 h-28 bg-muted`}>
          {preview.map(img => <PreviewImage key={img.id} url={img.public_url} />)}
        </div>
      ) : (
        <div className={`h-28 grid place-items-center ${tintFor(person.id).panel}`}>
          <Avatar person={person} size="lg" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-4 flex-1 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {preview.length > 0 && <Avatar person={person} />}
          <div className="min-w-0">
            <p className="font-medium truncate">{displayName(person)}</p>
            <p className="text-sm text-muted-foreground truncate">Shared their whole library</p>
          </div>
        </div>
        <OpenLinks source={source} />
      </div>
    </div>
  );
}

// One row in the admin "Everyone" list.
function PersonRow({ person }: { person: Person }) {
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar person={person} />
        <div className="min-w-0">
          <p className="font-medium truncate">{displayName(person)}</p>
          {person.name && person.email && <p className="text-sm text-muted-foreground truncate">{person.email}</p>}
        </div>
      </div>
      <OpenLinks source={{ kind: 'shared', ownerId: person.id, name: firstName(person) }} />
    </li>
  );
}

export default function SharedWithMe() {
  const [sharedWithMe, setSharedWithMe] = useState<Person[]>([]);
  const [everyone, setEveryone] = useState<Person[]>([]);   // admins only
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await authApi.shares();
      setSharedWithMe(r.shared_with_me);
      setEveryone(r.everyone || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load what is shared with you');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sectionTitle = 'font-display text-xl font-bold tracking-tight';
  const people = filterPeople(everyone, query);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-10">
      <header>
        <h1 className="font-display text-[2rem] sm:text-[2.75rem] font-bold tracking-tight leading-[1.05]">Shared with me</h1>
        <p className="mt-2 text-muted-foreground">Libraries and single items your colleagues have opened up to you.</p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-2xl border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          <p className="font-medium">Couldn't load what is shared with you</p>
          <p className="mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <SourceCard source={{ kind: 'items' }} title="Individual items"
              hint="Single images and videos colleagues shared with you"
              icon={<Share2 className="w-5 h-5" />} chip="bg-primary/10 text-primary" />
            <SourceCard source={{ kind: 'archive' }} title="Team archive" hint="Everything made before accounts"
              icon={<Archive className="w-5 h-5" />} chip="bg-slate-100 text-slate-700" />
          </div>

          <section className="space-y-4">
            <h2 className={sectionTitle}>
              Colleagues' libraries
              {sharedWithMe.length > 0 && <span className="ml-2 align-middle text-sm font-sans font-medium text-muted-foreground">{sharedWithMe.length}</span>}
            </h2>
            {sharedWithMe.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                Nobody has shared their whole library with you yet. To share yours: avatar menu (top right) → Share my library…
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sharedWithMe.map(p => <PersonCard key={p.id} person={p} />)}
              </div>
            )}
          </section>

          {everyone.length > 0 && (
            <section className="space-y-4">
              <div>
                <h2 className={sectionTitle}>Everyone</h2>
                <p className="text-sm text-muted-foreground mt-1">As an admin you can open anyone's library.</p>
              </div>
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search people" className="max-w-md bg-card" />
              {people.length === 0
                ? <p className="text-sm text-muted-foreground">Nobody matches that search.</p>
                : (
                  <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
                    {people.map(p => <PersonRow key={p.id} person={p} />)}
                  </ul>
                )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
