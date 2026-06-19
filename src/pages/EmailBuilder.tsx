/**
 * EmailBuilder.tsx — dedicated "Email" page.
 *
 * Lets the user pick a hero image (from the Google Drive library, their
 * Supabase favorites, an upload, or a pasted URL) and then opens the existing
 * "Convert to Email HTML" modal — which already contains the deliverability
 * content checker. This page is a thin front-door: it does NOT re-implement the
 * email builder, it reuses EmailHtmlConversionModal.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Loader2, Upload, Link as LinkIcon, RefreshCw, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmailHtmlConversionModal } from '@/components/EmailHtmlConversionModal';
import { getAllStoredImages, batchStoreImages } from '@/lib/imageStore';

// ── Supabase (favorites) ─────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// A picker image — `url` is the hero source, `brand` is passed to the modal.
interface PickImage {
  id: string;
  url: string;
  brand?: string;
  provider: string;
}

// Per-brand badge colours (matches the Image Library page).
const BRAND_BADGE: Record<string, string> = {
  FortunePlay: 'bg-amber-500 text-white',
  PlayMojo:    'bg-rose-500 text-white',
  SpinJo:      'bg-purple-500 text-white',
  Roosterbet:  'bg-red-600 text-white',
  SpinsUp:     'bg-sky-500 text-white',
  LuckyVibe:   'bg-emerald-500 text-white',
  Lucky7even:  'bg-indigo-500 text-white',
  NovaDreams:  'bg-violet-500 text-white',
  Rollero:     'bg-orange-500 text-white',
};

/**
 * Pull the latest images from Google Drive into localStorage (dedup by URL),
 * exactly like the Image Library page does. Returns how many were newly added.
 */
async function syncFromDrive(): Promise<number> {
  try {
    const res = await fetch('/api/list-drive-images');
    if (!res.ok) return 0;
    const data = await res.json() as {
      files: Array<{
        id: string; public_url: string; provider: string;
        aspect_ratio: string; resolution: string; filename: string; created_at: string; brand?: string;
      }>;
    };
    const files = data.files;
    if (!Array.isArray(files) || files.length === 0) return 0;
    const existingUrls = new Set(getAllStoredImages().map(i => i.public_url));
    const newFiles = files.filter(f => f.public_url && !existingUrls.has(f.public_url));
    if (newFiles.length === 0) return 0;
    return batchStoreImages(newFiles.map(f => ({
      public_url:   f.public_url,
      provider:     (f.provider || 'chatgpt').toLowerCase(),
      aspect_ratio: f.aspect_ratio || '16:9',
      resolution:   f.resolution   || '1K',
      filename:     f.filename     || `image-${f.id}.png`,
      brand:        f.brand || undefined,
    })));
  } catch {
    return 0;
  }
}

/** Fetch favorites from Supabase `liked_images`. Non-fatal on failure. */
async function fetchFavorites(): Promise<PickImage[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/liked_images?select=*&order=created_at.desc`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
    );
    if (!res.ok) return [];
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : [])
      .filter((f: { img_url?: string }) => !!f.img_url)
      .map((f: { id: string; img_url: string; brand_name?: string }) => ({
        id:       `fav-${f.id}`,
        url:      f.img_url,
        brand:    f.brand_name || undefined,
        provider: 'favorite',
      }));
  } catch {
    return [];
  }
}

export default function EmailBuilder() {
  const [images, setImages]   = useState<PickImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');

  // The chosen hero — when set, the email modal opens.
  const [selected, setSelected] = useState<PickImage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Drive sync (best-effort) → read all stored → merge favorites.
      await syncFromDrive();
      const stored: PickImage[] = getAllStoredImages().map(i => ({
        id:       i.id,
        url:      i.public_url,
        brand:    i.brand,
        provider: i.provider,
      }));
      const favs = await fetchFavorites();
      // Dedup by URL (a favorite may also be in the Drive library).
      const seen = new Set<string>();
      const merged = [...stored, ...favs].filter(img => {
        if (!img.url || seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
      });
      setImages(merged);
    } catch {
      setError('Could not load your images. You can still paste an image URL or upload one below.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Upload a local file → read as a data URI → use as the hero.
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      if (url) setSelected({ id: `upload-${Date.now()}`, url, provider: 'upload' });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  const handleUseUrl = () => {
    const url = pasteUrl.trim();
    if (!url) return;
    setSelected({ id: `url-${Date.now()}`, url, provider: 'url' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg gradient-primary">
              <Mail className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Email Builder</h1>
              <p className="text-xs text-muted-foreground">Pick a hero image, then build a branded email with the deliverability checker.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Home
              </Button>
            </Link>
          </div>
        </div>

        {/* Use your own image */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 mb-5 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Use your own image</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
              <Upload className="w-3.5 h-3.5" /> Upload file
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="…or paste an image URL"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUseUrl(); }}
                className="h-9 text-sm"
              />
              <Button onClick={handleUseUrl} disabled={!pasteUrl.trim()} className="gap-1.5 h-9 shrink-0">
                <LinkIcon className="w-3.5 h-3.5" /> Use URL
              </Button>
            </div>
          </div>
        </div>

        {/* Library grid */}
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Your images {images.length > 0 && `(${images.length})`}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your images…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2.5">
            {error}
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <ImageOff className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No images found in your library yet.</p>
            <p className="text-xs">Generate images first, or upload / paste an image URL above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setSelected(img)}
                className="group relative rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {img.brand && (
                  <span className={`absolute top-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded ${BRAND_BADGE[img.brand] || 'bg-black/60 text-white'}`}>
                    {img.brand}
                  </span>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 text-white text-xs font-semibold">
                    <Mail className="w-3.5 h-3.5" /> Build email
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reuses the existing modal — already has the deliverability checker. */}
      {selected && (
        <EmailHtmlConversionModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          imageUrl={selected.url}
          brand={selected.brand}
        />
      )}
    </div>
  );
}
