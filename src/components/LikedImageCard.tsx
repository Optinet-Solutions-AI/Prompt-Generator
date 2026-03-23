import { useState } from 'react';
import { Heart, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabaseThumbnail } from '@/lib/imageUtils';

interface LikedImageCardProps {
  imgUrl: string;
  recordId: string;
  onView: () => void;
  onDownload: () => void;
  onUnlike: () => void;
}

export function LikedImageCard({ imgUrl, recordId, onView, onDownload, onUnlike }: LikedImageCardProps) {
  const [src, setSrc] = useState(() => supabaseThumbnail(imgUrl, 400));

  return (
    <div className="relative group w-full aspect-square rounded-xl overflow-hidden border border-border/60 shadow-sm">
      <img
        src={src}
        alt={recordId}
        className="w-full h-full object-cover cursor-pointer"
        loading="lazy"
        onClick={onView}
        onError={() => { if (src !== imgUrl) setSrc(imgUrl); }}
      />
      {/* Overlay buttons - always visible */}
      <div className="absolute top-2 left-2 flex gap-1.5 z-10">
        {/* Heart / Unlike button */}
        <button
          onClick={(e) => { e.stopPropagation(); onUnlike(); }}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all',
            'bg-red-500 hover:bg-red-600 hover:scale-105'
          )}
          title="Unlike / Remove from favorites"
        >
          <Heart className="w-4 h-4 text-white fill-white" />
        </button>
        
        {/* Download */}
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center shadow-md bg-primary hover:scale-110 transition-transform cursor-pointer"
          aria-label="Download image"
          title="Download"
        >
          <Download className="w-4 h-4 text-primary-foreground" />
        </button>
        
      </div>
    </div>
  );
}
