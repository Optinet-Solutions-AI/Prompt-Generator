/**
 * VideoLibrary — every UGC video saved to the Video Drive folder.
 *
 * Separate from the Image Library. Shows MY videos (My Drive / Prompt
 * Generator / Videos), a colleague's library they shared with me, or the team
 * archive from before accounts. Favorites (liked_videos) are per person, so
 * the heart only appears on my own videos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clapperboard, Download, Heart, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BRANDS } from '@/types/prompt';
import { videoApi, type LibraryVideo } from '@/lib/video-api';
import { VIDEO_MODELS } from '@/lib/ugc-video';

/** 'seedance_2_5' → 'Seedance 2.5'; '' → '' (older videos didn't record a model). */
const modelLabel = (id: string) => VIDEO_MODELS.find(m => m.id === id)?.label || id;
import { LibrarySourcePicker, ownerParam, sourceLabel, type LibrarySource } from '@/components/auth/LibrarySourcePicker';
import { ItemShareDialog } from '@/components/auth/ItemShareDialog';

export default function VideoLibrary({ onBack }: { onBack?: () => void }) {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('All');
  const [model, setModel] = useState('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [source, setSource] = useState<LibrarySource>({ kind: 'mine' });
  const isMine = source.kind === 'mine';
  // The video whose "Share" window is open (null = closed)
  const [sharing, setSharing] = useState<LibraryVideo | null>(null);
  // Big libraries: render 30 cards at a time ("Show more" adds the next 30)
  const PAGE = 30;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => { setVisible(PAGE); }, [source, brand, model, favoritesOnly]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setVideos((await videoApi.list(ownerParam(source))).files); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load videos'); }
    finally { setLoading(false); }
  }, [source]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => videos.filter(v =>
    (brand === 'All' || v.brand === brand) &&
    (model === 'All' || v.model === model) &&
    (!favoritesOnly || v.liked)), [videos, brand, model, favoritesOnly]);

  // Counts respect the OTHER filter, so "Roosterbet (2)" means 2 with the chosen model.
  const countFor = (b: string) => videos.filter(v => (b === 'All' || v.brand === b) && (model === 'All' || v.model === model)).length;
  const countModel = (m: string) => videos.filter(v => (m === 'All' || v.model === m) && (brand === 'All' || v.brand === brand)).length;
  const hasUnknownModel = videos.some(v => !v.model);
  // Our brands first, then any custom businesses that have videos (e.g. "Dr Demajo").
  const brandChips = ['All', ...BRANDS, ...[...new Set(videos.map(v => v.brand).filter(b => b && !(BRANDS as readonly string[]).includes(b)))].sort()];

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
        <LibrarySourcePicker value={source} onChange={s => { setSource(s); setBrand('All'); setModel('All'); setFavoritesOnly(false); }} />
        <div className="ml-auto flex gap-2">
          {isMine && <Button variant={favoritesOnly ? 'default' : 'outline'} size="sm" onClick={() => setFavoritesOnly(f => !f)} aria-label="Favorites" title="Favorites">
            <Heart className={`w-4 h-4 sm:mr-1 ${favoritesOnly ? 'fill-current' : ''}`} /><span className="hidden sm:inline">Favorites</span>
          </Button>}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh">
            <RefreshCw className={`w-4 h-4 sm:mr-1 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Model filter */}
      <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]">
        <span className="shrink-0 text-xs font-medium text-muted-foreground mr-1">Model:</span>
        {[{ id: 'All', label: 'All models' }, ...VIDEO_MODELS, ...(hasUnknownModel ? [{ id: '', label: 'Not recorded' }] : [])].map(m => (
          <button key={m.id || 'unknown'} type="button" onClick={() => setModel(m.id)}
            className={[
              'shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              model === m.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground',
            ].join(' ')}>
            {m.label} <span className="opacity-70">({countModel(m.id)})</span>
          </button>
        ))}
      </div>

      {/* Brand filter */}
      <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]">
        <span className="shrink-0 text-xs font-medium text-muted-foreground mr-1">Brand:</span>
        {brandChips.map(b => (
          <button key={b} type="button" onClick={() => setBrand(b)}
            className={[
              'shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
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
            ? (isMine ? 'No videos yet — generate one in the Video tab.'
              : source.kind === 'items' ? 'Nothing shared with you one by one yet. When a colleague clicks Share on one of their videos, it shows up here.'
              : `No videos in ${sourceLabel(source)} yet.`)
            : 'No videos match these filters.'}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && shown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
          {shown.slice(0, visible).map(v => (
            <div key={v.id} className="group rounded-xl border border-border bg-card overflow-hidden flex flex-col">
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
              <div className="p-2.5 flex flex-col gap-1 flex-1">
                <span className="text-xs font-semibold text-foreground truncate">{v.brand || 'No brand'}</span>
                {v.shared_by && <p className="text-[11px] text-primary truncate">Shared by {v.shared_by}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {[modelLabel(v.model), v.aspect_ratio, v.duration && `${v.duration}s`, new Date(v.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
                </p>
                {v.prompt && (
                  <div className="hidden sm:block">
                    <p className="text-[11px] text-muted-foreground line-clamp-2" title={v.prompt}>{v.prompt}</p>
                  </div>
                )}
                {/* Actions — clear labelled buttons, pinned to the bottom so every card lines up */}
                <div className="flex items-center gap-1.5 pt-1.5 mt-auto">
                  {isMine && (
                    <button type="button" onClick={() => setSharing(v)} title="Share this video with someone"
                      className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-10 px-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 active:scale-[0.98] transition">
                      <Share2 className="w-4 h-4 shrink-0" /><span className="truncate">Share</span>
                    </button>
                  )}
                  <a href={v.download_url} download={v.name} aria-label="Download" title="Download"
                    className={`inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors ${isMine ? 'w-10 shrink-0' : 'flex-1 px-2'}`}>
                    <Download className="w-4 h-4 shrink-0" />{!isMine && <span>Download</span>}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && shown.length > visible && (
        <div className="flex flex-col items-center gap-1 pt-6">
          <Button variant="outline" onClick={() => setVisible(n => n + PAGE)}>Show more</Button>
          <span className="text-xs text-muted-foreground">Showing {visible} of {shown.length}</span>
        </div>
      )}
      {sharing && (
        <ItemShareDialog open onOpenChange={o => { if (!o) setSharing(null); }} kind="video" fileId={sharing.id}
          previewUrl={sharing.video_url} title={sharing.brand || sharing.name} />
      )}
    </div>
  );
}
