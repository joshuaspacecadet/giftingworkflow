import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from '../types';
import PdfThumbnail from './PdfThumbnail';
import { AirtableService } from '../services/airtable';
import { X, ThumbsUp, ThumbsDown, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerUrl as string;

interface DesignReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[]; // list of contacts to review
  onAdvance: (updatedContact: Contact) => void; // update parent cache and advance
}

const formatDateTime = (dateString?: string) => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toLocaleString();
  } catch {
    return dateString;
  }
};

const formatFileSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const DesignReviewModal: React.FC<DesignReviewModalProps> = ({ isOpen, onClose, contacts, onAdvance }) => {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasRejected, setHasRejected] = useState(false);
  const [hasApproved, setHasApproved] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  // Snapshot the list at open time so cards remain in-session even after approval/rejection
  const [sessionContacts, setSessionContacts] = useState<Contact[]>([]);
  const current = sessionContacts[index];

  const design = useMemo(() => {
    if (!current) return null;
    const files = current.designFiles || [];
    return files[0] || null;
  }, [current]);

  // Build the title text BEFORE any early returns so hooks are consistent
  const titleText = useMemo(() => {
    const c = current;
    if (!c) return 'Design Review';
    const full = (c.name || '').trim();
    if (!full) return 'Design Review';
    const parts = full.split(/\s+/);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const nameDisplay = [first, last].filter(Boolean).join(' ');
    return `Design Review: ${nameDisplay}${c.company ? `, ${c.company}` : ''}`;
  }, [current]);

  // Take a snapshot of incoming contacts when opening the modal
  useEffect(() => {
    if (isOpen) {
      setSessionContacts(contacts);
      setIndex(0);
    }
  }, [isOpen]);

  // Preload thumbnails for all designs to make navigation instant
  useEffect(() => {
    if (!isOpen) return;
    const files = contacts
      .map(c => (c.designFiles || [])[0])
      .filter(Boolean) as any[];
    if (files.length === 0) return;
    let cancelled = false;
    const height = 540; // match modal preview height

    const preloadPdf = async (url: string) => {
      try {
        const key = `${url}|${height}`;
        const cache = (window as any).__pdfThumbCache as Map<string, { dataUrl: string; w: number; h: number }>;
        if (cache && cache.get(key)) return; // already cached
        const fetchUrl = url.includes('dl=') ? url : `${url}${url.includes('?') ? '&' : '?'}dl=1`;
        const res = await fetch(fetchUrl, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        const loadingTask = getDocument({ data, disableFontFace: true, useSystemFonts: true });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
        const viewport1 = page.getViewport({ scale: 1 });
        const scale = (height * DPR) / viewport1.height;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        try {
          const dataUrl = canvas.toDataURL('image/png');
          (window as any).__pdfThumbCache = (window as any).__pdfThumbCache || new Map();
          (window as any).__pdfThumbCache.set(key, { dataUrl, w: canvas.width, h: canvas.height });
        } catch {}
      } catch {}
    };

    const preloadImage = async (url: string) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
      } catch {}
    };

    (async () => {
      setIsPreloading(true);
      setPreloadProgress(0);
      let done = 0;
      for (const f of files) {
        if (cancelled) break;
        const isPdf = (f.type && /pdf/i.test(f.type)) || /\.pdf(\?|$)/i.test(f.filename || f.url);
        if (isPdf) {
          await preloadPdf(f.url);
        } else {
          await preloadImage(f.url);
        }
        done += 1;
        setPreloadProgress(Math.round((done / files.length) * 100));
      }
      if (!cancelled) setIsPreloading(false);
    })();

    return () => { cancelled = true; };
  }, [isOpen, contacts]);

  // Initialize local UI state from the current contact so edits persist when navigating
  useEffect(() => {
    if (!current) return;
    setHasRejected(current.specificStage === 'Design rejected');
    setHasApproved(current.specificStage === 'Design approved');
    setFeedback(current.latestDesignFeedback || '');
  }, [current]);

  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (!current) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-6" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Design Review</h3>
            <button className="text-slate-500" onClick={onClose}>×</button>
          </div>
          <div className="text-sm text-slate-600">No designs to review.</div>
        </div>
      </div>
    );
  }

  // (titleText already computed above)


  const saveIfDirty = async () => {
    if (!current) return;
    // If user has chosen to reject and provided feedback, persist if changed
    if (hasRejected && feedback) {
      if (current.specificStage !== 'Design rejected' || (current.latestDesignFeedback || '') !== feedback) {
        setSaving(true);
        try {
          const updated = await AirtableService.updateContact(current.id, {
            specificStage: 'Design rejected' as any,
            latestDesignFeedback: feedback,
          } as any);
          if (updated) {
            onAdvance(updated);
            // Update session snapshot so edits are reflected when navigating back
            setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
          }
        } finally {
          setSaving(false);
        }
      }
    }
  };

  const goNext = async () => {
    await saveIfDirty();
    if (index < sessionContacts.length - 1) {
      setFeedback('');
      setHasRejected(false);
      setIndex(index + 1);
    } else {
      onClose();
    }
  };
  const goPrev = async () => {
    await saveIfDirty();
    if (index > 0) {
      setFeedback('');
      setHasRejected(false);
      setIndex(index - 1);
    }
  };

  const approve = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await AirtableService.updateContact(current.id, {
        specificStage: 'Design approved' as any,
        latestDesignFeedback: '',
      } as any);
      if (updated) {
        onAdvance(updated);
        setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        setHasApproved(true);
        setHasRejected(false);
      }
      goNext();
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await AirtableService.updateContact(current.id, {
        specificStage: 'Design rejected' as any,
        latestDesignFeedback: feedback || '',
      } as any);
      if (updated) onAdvance(updated);
      goNext();
    } finally {
      setSaving(false);
    }
  };

  const isPdf = !!(design && ((design.type && /pdf/i.test(design.type)) || /\.pdf(\?|$)/i.test(design.filename || design.url)));

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        {!isPreloading && (
          <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-20">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0 || saving}
              className="inline-flex items-center justify-center h-7 w-7 rounded border border-slate-300 text-slate-600 disabled:opacity-40"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-lg font-semibold text-slate-900">{titleText}</div>
              <div className="text-xs text-slate-500">{index + 1} of {sessionContacts.length}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goNext}
                disabled={index >= contacts.length - 1 || saving}
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-slate-300 text-slate-600 disabled:opacity-40"
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button className="text-slate-500 hover:text-slate-700" onClick={onClose}><X className="h-5 w-5" /></button>
            </div>
          </div>
        )}

        {isPreloading ? (
          <div className="px-6 py-36 text-center">
            <div className="text-2xl font-bold mb-3">Entering the design review portal…</div>
            <div className="text-slate-600 text-base mb-6">Summoning high‑res previews ({preloadProgress}%)</div>
            <div className="mx-auto w-80 h-3 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#FF5C00] transition-all" style={{ width: `${preloadProgress}%` }} />
            </div>
          </div>
        ) : (
        <div className="px-6 pb-6 mt-5 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div
              className="rounded-lg flex items-center justify-center cursor-zoom-in"
              onClick={() => design && setIsPreviewOpen(true)}
              title={design ? 'Click to preview larger' : undefined}
            >
              {design ? (
                design.type?.startsWith('image/') ? (
                  <img src={design.url} alt={design.filename} className="max-h-[540px] object-contain" />
                ) : (
                  <PdfThumbnail url={design.url} className="h-[540px]" heightPx={540} />
                )
              ) : (
                <div className="text-sm text-slate-500">No design file</div>
              )}
            </div>
            {/* Show selected Draft Order Items below the preview */}
            <div className="mt-3 text-xs text-slate-500 text-center">
              Set to receive: {((current.draftOrderItems || []).length > 0 ? (current.draftOrderItems || []).join(', ') : '—')}
            </div>
          </div>

          <div>
            <div className="text-lg font-semibold mb-4">Do you approve this design?</div>
            <div className="flex items-center gap-6 mb-4">
              <button disabled={saving} onClick={approve} className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasApproved ? 'bg-green-500 ring-2 ring-green-600' : (hasRejected ? 'bg-green-100' : 'bg-green-200 hover:bg-green-300')}`} title="Approve">
                <ThumbsUp className="h-8 w-8 text-green-700" />
              </button>
              <button
                disabled={saving}
                onClick={() => { setHasRejected(true); setHasApproved(false); }}
                className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasRejected ? 'bg-rose-500 ring-2 ring-rose-600' : 'bg-rose-200 hover:bg-rose-300'}`}
                title="Reject"
              >
                <ThumbsDown className="h-8 w-8 text-rose-700" />
              </button>
            </div>
            {hasRejected && (
              <>
                <div className="mt-6 text-sm font-medium mb-2">Required: provide feedback and click save to reject this design.</div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full min-h-[160px] border border-slate-300 rounded-md p-3 text-sm text-slate-900 bg-white disabled:bg-slate-50"
                  placeholder="Share why the design needs changes"
                  disabled={saving}
                />
                <div className="mt-3 flex justify-end">
                  <button disabled={saving || !feedback} onClick={reject} className="px-4 py-2 text-sm rounded-md bg-slate-900 text-white disabled:opacity-50">Save</button>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* Moved pager above approval section */}

        {isPreviewOpen && design && (
          <div className="fixed inset-0 bg-black/80 z-[3100] flex items-center justify-center p-4" onClick={() => setIsPreviewOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-[90vw] max-h-[90vh] p-3" onClick={(e)=>e.stopPropagation()}>
              <div className="flex justify-end mb-2"><button className="text-slate-500" onClick={() => setIsPreviewOpen(false)}><X className="h-5 w-5" /></button></div>
              {design.type?.startsWith('image/') ? (
                <img src={design.url} alt={design.filename} className="max-h-[80vh] max-w-[85vw] object-contain" />
              ) : isPdf ? (
                <iframe
                  src={design.url}
                  title={design.filename || 'Design PDF'}
                  className="w-[85vw] h-[80vh] rounded border border-slate-200"
                />
              ) : (
                <PdfThumbnail url={design.url} className="h-[80vh]" />
              )}
              <div className="mt-2 text-right text-xs">
                <a href={design.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open in new tab</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(modal, document.body);
};

export default DesignReviewModal;


