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
}

const PdfThumbnail: React.FC<PdfThumbnailProps> = ({ url, className, alt }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Fetch bytes to avoid CORS/XHR complications inside pdf.js
        const fetchUrl = url.includes('dl=') ? url : `${url}${url.includes('?') ? '&' : '?'}dl=1`;
        const res = await fetch(fetchUrl, { mode: 'cors' });
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

        const DPR = Math.max(window.devicePixelRatio || 1, 1);
        const targetCssHeight = 100; // px
        const viewport1 = page.getViewport({ scale: 1 });
        const scale = (targetCssHeight * DPR) / viewport1.height;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.height = `${targetCssHeight}px`;
        canvas.style.width = `${Math.round(viewport.width / DPR)}px`;

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        console.warn('PDF thumbnail render failed:', e);
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
        className={`rounded-md border border-[#27282B] bg-[#141518] flex items-center justify-center ${className || ''}`}
        style={{ height: 100, width: 70 }}
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
      className={`rounded-md border border-[#27282B] bg-[#141518] ${className || ''}`}
      style={{ height: 100 }}
      role="img"
      aria-label={alt || 'PDF'}
      title={alt || 'PDF'}
    />
  );
};

export default PdfThumbnail;


