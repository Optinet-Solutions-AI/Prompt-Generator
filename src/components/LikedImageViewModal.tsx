import { useEffect, useCallback } from 'react';
import { X, Download, FileCode, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HtmlConversionModal } from './HtmlConversionModal';
import { EmailHtmlConversionModal } from './EmailHtmlConversionModal';
import { useState } from 'react';

interface LikedImageViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imgUrl: string;
  recordId: string;
}

export function LikedImageViewModal({ isOpen, onClose, imgUrl, recordId }: LikedImageViewModalProps) {
  const [showHtmlModal, setShowHtmlModal] = useState(false);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  const handleDownload = async () => {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = recordId || `liked-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(imgUrl, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 animate-fade-in"
        style={{ zIndex: 1000 }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full size image view"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl shadow-2xl flex flex-col max-w-[90vw] w-[700px] max-h-[90vh] animate-scale-in"
        style={{ zIndex: 1001 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-base">Generated Image</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto p-5 flex items-center justify-center bg-muted/30">
          <img
            src={imgUrl}
            alt={recordId}
            className="max-w-full max-h-[60vh] object-contain rounded-lg"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowHtmlModal(true)}
          >
            <FileCode className="w-4 h-4" />
            Convert to HTML
          </Button>
          <Button
            className="gap-2 gradient-primary"
            onClick={handleDownload}
          >
            <Download className="w-4 h-4" />
            Download Image
          </Button>
        </div>
      </div>

      {/* HTML Conversion Modal */}
      <HtmlConversionModal
        isOpen={showHtmlModal}
        onClose={() => setShowHtmlModal(false)}
        imageUrl={imgUrl}
      />
    </>
  );
}
