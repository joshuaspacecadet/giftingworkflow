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
  const [aspectRatio, setAspectRatio] = useState<number | null>(null); // width / height

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Dynamically import pdfjs from CDN to avoid bundling a large lib
        const pdfjs: any = await import(
          /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.mjs'
        );
        // Configure worker
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.mjs';

        const loadingTask = pdfjs.getDocument({ url });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Target canvas size: 100px tall thumbnail
        const targetHeight = 100; // px
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetHeight / viewport.height;
        const scaled = page.getViewport({ scale });

        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        setAspectRatio(scaled.width / scaled.height);

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
        className={`rounded-md border border-[#27282B] bg-[#141518] flex items-center justify-center ${className || 'h-[100px] w-20'}`}
        role="img"
        aria-label={alt || 'PDF'}
        title={alt || 'PDF'}
        style={{ height: 100, aspectRatio: aspectRatio || 0.7 }}
      >
        <span className="text-[10px] text-slate-300">PDF</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`rounded-md border border-[#27282B] bg-[#141518] ${className || 'h-[100px] w-auto'}`}
      role="img"
      aria-label={alt || 'PDF'}
      title={alt || 'PDF'}
      style={{ height: 100, aspectRatio: aspectRatio || undefined }}
    />
  );
};

export default PdfThumbnail;


