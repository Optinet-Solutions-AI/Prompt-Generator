import { useEffect, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface Props {
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  async function onDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (!src || downloading) return;
    setDownloading(true);
    try {
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
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12"
      onClick={onClose}
      style={{
        background:
          'radial-gradient(80% 60% at 50% 50%, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.96) 80%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'ax-fade-in 240ms ease-out',
      }}
    >
      {/* Toolbar */}
      <div className="absolute top-5 right-5 flex gap-2 ax-fade-up" style={{ animationDelay: '120ms' }}>
        <button
          onClick={onDownload}
          disabled={downloading}
          className="rounded-full bg-white/8 backdrop-blur-md border border-white/10 p-2.5 text-white hover:bg-[rgba(212,178,106,0.2)] hover:border-[var(--ax-gold)] hover:text-[var(--ax-gold-bright)] disabled:opacity-50 transition-colors"
          aria-label="Download image"
        >
          {downloading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Download className="h-5 w-5" />}
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-white/8 backdrop-blur-md border border-white/10 p-2.5 text-white hover:bg-white/15 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Framed image */}
      <div
        className="relative max-h-full max-w-full ax-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="ax-image-corner tl" style={{ width: 34, height: 34, opacity: 0.85 }} aria-hidden />
        <span className="ax-image-corner tr" style={{ width: 34, height: 34, opacity: 0.85 }} aria-hidden />
        <span className="ax-image-corner bl" style={{ width: 34, height: 34, opacity: 0.85 }} aria-hidden />
        <span className="ax-image-corner br" style={{ width: 34, height: 34, opacity: 0.85 }} aria-hidden />
        <img
          src={src}
          alt={alt}
          className="max-h-[88vh] max-w-[92vw] rounded-md"
          style={{ boxShadow: '0 32px 80px -20px rgba(0,0,0,0.8), 0 0 60px -20px rgba(212,178,106,0.25)' }}
        />
      </div>

      <style>{`@keyframes ax-fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
