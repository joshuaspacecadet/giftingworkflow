import React, { useEffect, useRef, useState } from 'react';

interface PdfThumbnailProps {
  url: string;
  className?: string;
  alt?: string;
}

// Lightweight PDF first-page thumbnail using pdfjs-dist via CDN.
// Falls back to a simple badge if rendering fails.
const PdfThumbnail: React.FC<PdfThumbnailProps> = ({ url, className, alt }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Dynamically import pdfjs from CDN to avoid bundling a large lib
        const pdfjs: any = await import(
          /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs'
        );
        // Configure worker
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

        const loadingTask = pdfjs.getDocument({ url });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Target canvas size similar to image thumbnails
        const targetWidth = 48; // px
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);

        await page.render({ canvasContext: context, viewport: scaled }).promise;
      } catch (e) {
        console.warn('PDF thumbnail render failed', e);
        if (!cancelled) setFailed(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <div
        className={`rounded-md border border-[#27282B] bg-[#141518] flex items-center justify-center ${className || 'h-16 w-12'}`}
        role="img"
        aria-label={alt || 'PDF'}
        title={alt || 'PDF'}
      >
        <span className="text-[10px] text-slate-300">PDF</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`rounded-md border border-[#27282B] bg-[#141518] ${className || 'h-16 w-12'}`}
      role="img"
      aria-label={alt || 'PDF'}
      title={alt || 'PDF'}
    />
  );
};

export default PdfThumbnail;


