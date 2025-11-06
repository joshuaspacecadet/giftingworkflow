import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// Vite will turn this into a URL string for the worker
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerUrl as string;

interface PdfThumbnailProps {
  url: string;
  className?: string;
  alt?: string;
  heightPx?: number; // desired CSS height for the rendered thumbnail
}

const PdfThumbnail: React.FC<PdfThumbnailProps> = ({ url, className, alt, heightPx }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Fetch bytes to avoid CORS/XHR complications inside pdf.js
        const fetchUrl = url.includes('dl=') ? url : `${url}${url.includes('?') ? '&' : '?'}dl=1`;
        const res = await fetch(fetchUrl, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();

        const loadingTask = getDocument({
          data,
          disableFontFace: true,
          useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Cap DPR a bit for performance while keeping sharpness
        const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
        const targetCssHeight = typeof heightPx === 'number' ? heightPx : 100; // px
        const viewport1 = page.getViewport({ scale: 1 });
        const scale = (targetCssHeight * DPR) / viewport1.height;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.height = `${targetCssHeight}px`;
        canvas.style.width = `${Math.round(viewport.width / DPR)}px`;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Cache rendered image
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const key = `${url}|${targetCssHeight}`;
          (window as any).__pdfThumbCache = (window as any).__pdfThumbCache || new Map();
          (window as any).__pdfThumbCache.set(key, { dataUrl, w: canvas.width, h: canvas.height });
        } catch {}
      } catch (e) {
        console.warn('PDF thumbnail render failed:', e);
        if (!cancelled) setFailed(true);
      }
    };

    // Simple in-memory cache: reuse rendered thumbnail for same URL/height
    try {
      const key = `${url}|${typeof heightPx === 'number' ? heightPx : 100}`;
      const cache = (window as any).__pdfThumbCache as Map<string, { dataUrl: string; w: number; h: number }>;
      const cached = cache && cache.get(key);
      if (cached && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            canvas.width = cached.w;
            canvas.height = cached.h;
            canvas.style.height = `${typeof heightPx === 'number' ? heightPx : 100}px`;
            const ar = cached.w / cached.h;
            const cssW = Math.round((typeof heightPx === 'number' ? heightPx : 100) * ar);
            canvas.style.width = `${cssW}px`;
            ctx.drawImage(img, 0, 0);
          };
          img.src = cached.dataUrl;
          return () => { cancelled = true; };
        }
      }
    } catch {}

    load();
    return () => {
      cancelled = true;
    };
  }, [url, heightPx]);

  if (failed) {
    return (
      <div
        className={`rounded-md flex items-center justify-center ${className || ''}`}
        style={{ height: heightPx ?? 100, width: heightPx ? Math.round((heightPx * 0.7)) : 70 }}
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
      className={`rounded-md ${className || ''}`}
      style={{ height: heightPx ?? 100 }}
      role="img"
      aria-label={alt || 'PDF'}
      title={alt || 'PDF'}
    />
  );
};

export default PdfThumbnail;


