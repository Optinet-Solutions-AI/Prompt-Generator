import { useEffect, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface Props {
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  // Esc closes the lightbox.
  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  async function onDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (!src || downloading) return;
    setDownloading(true);
    try {
      // The image is on googleusercontent.com (cross-origin). A plain
      // <a download> on a cross-origin URL is treated as navigation — the
      // browser opens it instead of downloading. Fetching as a blob lets us
      // hand the browser a same-origin Blob URL that downloads cleanly.
      const res = await fetch(src);
      if (!res.ok) throw new Error('Image fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `rocketspin-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the blob after the click is queued.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // Fallback: open in a new tab so the user can save manually.
      window.open(src, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  }

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-50"
          onClick={onDownload}
          disabled={downloading}
          aria-label="Download image"
        >
          {downloading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Download className="h-5 w-5" />}
        </button>
        <button
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
