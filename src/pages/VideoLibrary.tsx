/**
 * VideoLibrary — every UGC video saved to the Video Drive folder.
 *
 * Separate from the Image Library. Shows MY videos (My Drive / Prompt
 * Generator / Videos), a colleague's library they shared with me, or the team
 * archive from before accounts. Favorites (liked_videos) are per person, so
 * the heart only appears on my own videos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clapperboard, Download, Heart, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BRANDS } from '@/types/prompt';
import { videoApi, type LibraryVideo } from '@/lib/video-api';
import { LibrarySourcePicker, ownerParam, sourceLabel, type LibrarySource } from '@/components/auth/LibrarySourcePicker';

export default function VideoLibrary({ onBack }: { onBack?: () => void }) {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [source, setSource] = useState<LibrarySource>({ kind: 'mine' });
  const isMine = source.kind === 'mine';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setVideos((await videoApi.list(ownerParam(source))).files); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load videos'); }
    finally { setLoading(false); }
  }, [source]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => videos.filter(v =>
    (brand === 'All' || v.brand === brand) && (!favoritesOnly || v.liked)), [videos, brand, favoritesOnly]);

  const countFor = (b: string) => videos.filter(v => b === 'All' || v.brand === b).length;

  const toggleLike = async (v: LibraryVideo) => {
    // Optimistic: flip the heart now, undo if the server says no.
    setVideos(list => list.map(x => x.id === v.id ? { ...x, liked: !v.liked } : x));
    try { if (v.liked) await videoApi.unlike(v.id); else await videoApi.like(v); }
    catch (e) {
      setVideos(list => list.map(x => x.id === v.id ? { ...x, liked: v.liked } : x));
      toast.error(e instanceof Error ? e.message : 'Could not update favorites');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        )}
        <div className="flex items-center gap-2">
          <Clapperboard className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Video Library</h2>
          {!loading && <span className="text-sm text-muted-foreground">{videos.length} videos</span>}
        </div>
        <LibrarySourcePicker value={source} onChange={s => { setSource(s); setBrand('All'); setFavoritesOnly(false); }} />
        <div className="ml-auto flex gap-2">
          {isMine && <Button variant={favoritesOnly ? 'default' : 'outline'} size="sm" onClick={() => setFavoritesOnly(f => !f)}>
            <Heart className={`w-4 h-4 mr-1 ${favoritesOnly ? 'fill-current' : ''}`} />Favorites
          </Button>}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      {/* Brand filter */}
      <div className="flex flex-wrap gap-2">
        {['All', ...BRANDS].map(b => (
          <button key={b} type="button" onClick={() => setBrand(b)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              brand === b ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground',
            ].join(' ')}>
            {b} <span className="opacity-70">({countFor(b)})</span>
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />Loading videos from Google Drive…
        </div>
      )}
      {!loading && error && (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          <p className="font-medium">Couldn't load the Video Library</p>
          <p className="mt-1">{error}</p>
        </div>
      )}
      {!loading && !error && shown.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Clapperboard className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {videos.length === 0
            ? (isMine ? 'No videos yet — generate one in the Video tab.' : `No videos in ${sourceLabel(source)} yet.`)
            : 'No videos match these filters.'}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && shown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {shown.map(v => (
            <div key={v.id} className="group rounded-xl border border-border bg-card overflow-hidden">
              <div className="relative bg-black aspect-[9/16]">
                <video src={v.video_url} poster={v.thumbnail_url || undefined} controls preload="metadata" playsInline
                  className="absolute inset-0 w-full h-full object-contain" />
                {isMine && (
                  <button type="button" onClick={() => toggleLike(v)} aria-label="Favorite"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70">
                    <Heart className={`w-4 h-4 ${v.liked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                  </button>
                )}
              </div>
              <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground truncate">{v.brand || 'No brand'}</span>
                  <a href={v.download_url} download={v.name} className="text-muted-foreground hover:text-foreground" aria-label="Download">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {[v.aspect_ratio, v.duration && `${v.duration}s`, new Date(v.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
                </p>
                {v.prompt && <p className="text-[11px] text-muted-foreground line-clamp-2" title={v.prompt}>{v.prompt}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
