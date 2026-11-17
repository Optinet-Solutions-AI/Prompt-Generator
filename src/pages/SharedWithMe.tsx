// "Shared with me" — one place that lists every library you can open besides your own:
// single items shared one by one, whole libraries colleagues shared, the team archive,
// and (admins only) everyone. Each row links to the Images and Videos libraries.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Loader2, Share2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, firstName, type Person } from '@/lib/auth-api';
import type { LibrarySource } from '@/components/auth/LibrarySourcePicker';
import { filterPeople, libraryPath } from '@/lib/nav/library-address';

// One row: an icon or avatar, a name, and the two links.
function SourceRow({ source, title, hint, icon }: {
  source: LibrarySource; title: string; hint?: string; icon: React.ReactNode;
}) {
  const linkClass = 'px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors';
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Link to={libraryPath('images', source)} className={linkClass}>Images</Link>
      <Link to={libraryPath('videos', source)} className={linkClass}>Videos</Link>
    </div>
  );
}

// Round photo, or a people icon when the person has no photo.
function Avatar({ person }: { person: Person }) {
  return person.avatar_url
    ? <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full shrink-0" />
    : <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-muted-foreground" /></span>;
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

  const sectionTitle = 'text-xs font-semibold tracking-wider text-muted-foreground';
  const people = filterPeople(everyone, query);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-8">
      <h1 className="text-2xl sm:text-3xl font-semibold">Shared with me</h1>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          <p className="font-medium">Couldn't load what is shared with you</p>
          <p className="mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="space-y-3">
            <h2 className={sectionTitle}>Shared with you one by one</h2>
            <SourceRow source={{ kind: 'items' }} title="Individual items"
              hint="Single images and videos colleagues shared with you"
              icon={<Share2 className="w-5 h-5 text-primary shrink-0" />} />
          </section>

          <section className="space-y-3">
            <h2 className={sectionTitle}>Whole libraries</h2>
            {sharedWithMe.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody has shared their whole library with you yet. To share yours: avatar menu (top right) → Share my library…
              </p>
            ) : sharedWithMe.map(p => (
              <SourceRow key={p.id} source={{ kind: 'shared', ownerId: p.id, name: firstName(p) }}
                title={p.name || p.email || 'Someone'} icon={<Avatar person={p} />} />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className={sectionTitle}>Team archive</h2>
            <SourceRow source={{ kind: 'archive' }} title="Team archive" hint="Everything made before accounts"
              icon={<Archive className="w-5 h-5 text-primary shrink-0" />} />
          </section>

          {everyone.length > 0 && (
            <section className="space-y-3">
              <h2 className={sectionTitle}>Everyone (admin)</h2>
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search people" />
              {people.length === 0 && <p className="text-sm text-muted-foreground">Nobody matches that search.</p>}
              {people.map(p => (
                <SourceRow key={p.id} source={{ kind: 'shared', ownerId: p.id, name: firstName(p) }}
                  title={p.name || p.email || 'Someone'} hint={p.name ? p.email || undefined : undefined} icon={<Avatar person={p} />} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
