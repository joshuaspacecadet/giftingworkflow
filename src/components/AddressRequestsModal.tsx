import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from '../types';
import PdfThumbnail from './PdfThumbnail';
import { AirtableService } from '../services/airtable';
import { X, ChevronLeft, ChevronRight, Copy, ExternalLink, Link2 } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerUrl as string;

interface AddressRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onAdvance: (updatedContact: Contact) => void;
  signerName: string; // Wiz, John, Daniel
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

const AddressRequestsModal: React.FC<AddressRequestsModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onAdvance,
  signerName,
}) => {
  const [index, setIndex] = useState(0);
  const [sessionContacts, setSessionContacts] = useState<Contact[]>([]);
  const current = sessionContacts[index];
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [addr, setAddr] = useState({
    streetLine1: '',
    streetLine2: '',
    city: '',
    state: '',
    postCode: '',
    countryCode: '',
  });
  const [saving, setSaving] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);

  const design = useMemo(() => {
    if (!current) return null;
    // Hide design if not set to receive Magic Cards
    const items = (current as any).draftOrderItems as string[] | undefined;
    const hasMagicCards = Array.isArray(items) && items.includes('Magic Cards');
    if (!hasMagicCards) return null;
    const files = current.designFiles || [];
    return files[0] || null;
  }, [current]);

  // Build the title text BEFORE any early returns so hook order stays consistent
  const titleText = useMemo(() => {
    const c = current;
    if (!c) return 'Address Request';
    const full = (c.name || '').trim();
    if (!full) return 'Address Request';
    const parts = full.split(/\s+/);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const nameDisplay = [first, last].filter(Boolean).join(' ');
    return `Address Request: ${nameDisplay}${c.company ? `, ${c.company}` : ''}`;
  }, [current]);

  useEffect(() => {
    if (!isOpen) return;
    // Snapshot the contacts only when opening the modal to keep lineup stable during the session
    setSessionContacts(contacts);
    setIndex(0);
  }, [isOpen]);

  // Preload previews (images/pdfs) for faster navigation, show portal loader
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Use incoming contacts for preload; we snapshot separately for session list
    const files = contacts
      .map(c => {
        const items = (c as any).draftOrderItems as string[] | undefined;
        const hasMagicCards = Array.isArray(items) && items.includes('Magic Cards');
        if (!hasMagicCards) return null;
        return (c.designFiles || [])[0] || null;
      })
      .filter(Boolean) as Array<{ url: string; type?: string; filename?: string }>;

    if (files.length === 0) {
      setIsPreloading(false);
      setPreloadProgress(0);
      return;
    }

    const height = 540;

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
        await new Promise<void>((resolve) => {
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

  useEffect(() => {
    if (!current) return;
    setAddr({
      streetLine1: current.streetLine1 || '',
      streetLine2: current.streetLine2 || '',
      city: current.city || '',
      state: current.state || '',
      postCode: current.postCode || '',
      countryCode: current.countryCode || '',
    });
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
    return createPortal(
      <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-6" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Address Requests</h3>
            <button className="text-slate-500" onClick={onClose}>×</button>
          </div>
          <div className="text-sm text-slate-600">No contacts to request addresses from.</div>
        </div>
      </div>,
      document.body
    );
  }

  const goNext = () => {
    if (index < sessionContacts.length - 1) {
      setIndex(index + 1);
      setCopied(false);
    } else {
      onClose();
    }
  };
  const goPrev = () => {
    if (index > 0) {
      setIndex(index - 1);
      setCopied(false);
    }
  };

  const firstName = (current.name || '').trim().split(/\s+/)[0] || '';
  const addressLink = current.confirmAddressUrl || '';
  const emailBody = `Hey ${firstName}, hope you're well. Real quick - I have a little something ready to ship to you. When you get a chance, can you fill out your address here: ${addressLink}

Excited for you to receive!

- ${signerName}`;
  const mailto = `mailto:?subject=${encodeURIComponent('Address for Spacecadet gift')}&body=${encodeURIComponent(emailBody)}`;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(emailBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(addressLink || '');
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch {
      setCopiedLink(false);
    }
  };

  const saveAddress = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await AirtableService.updateContact(current.id, {
        streetLine1: addr.streetLine1,
        streetLine2: addr.streetLine2,
        city: addr.city,
        state: addr.state,
        postCode: addr.postCode,
        countryCode: addr.countryCode,
      });
      if (updated) {
        onAdvance(updated);
        setSessionContacts(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        // After saving, advance to the next contact (lineup stays stable until modal closes)
        goNext();
      }
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        {!isPreloading && (
          <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-20">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-slate-300 text-slate-600 disabled:opacity-40"
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="text-xs text-slate-600 disabled:opacity-40"
                title="Previous"
              >
                Back
              </button>
            </div>
            <div className="flex-1 text-center">
              <div className="text-lg font-semibold text-slate-900">{titleText}</div>
              <div className="text-xs text-slate-500">{index + 1} of {sessionContacts.length}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goNext}
                disabled={index >= sessionContacts.length - 1}
                className="text-xs text-slate-600 disabled:opacity-40"
                title="Next"
              >
                Next
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index >= sessionContacts.length - 1}
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
            <div className="text-2xl font-bold mb-3">Entering the address request portal…</div>
            <div className="text-slate-600 text-base mb-6">Warming up previews ({preloadProgress}%)</div>
            <div className="mx-auto w-80 h-3 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#FF5C00] transition-all" style={{ width: `${preloadProgress}%` }} />
            </div>
          </div>
        ) : (
        <div className="px-6 pb-6 mt-5 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="rounded-lg flex items-center justify-center">
              {design ? (
                design.type?.startsWith('image/') ? (
                  <img src={design.url} alt={design.filename} className="max-h-[540px] object-contain" />
                ) : (
                  <PdfThumbnail url={design.url} className="h-[540px]" heightPx={540} />
                )
              ) : (
                <div className="text-sm text-slate-500">
                  {(() => {
                    const items = (current.draftOrderItems || []) as string[];
                    const hasMagicCards = Array.isArray(items) && items.includes('Magic Cards');
                    return hasMagicCards ? "Design pending" : "No design file needed for order";
                  })()}
                </div>
              )}
            </div>
            <div className="mt-3 text-xs text-slate-500 text-center">
              Set to receive: {((current.draftOrderItems || []).length > 0 ? (current.draftOrderItems || []).join(', ') : '—')}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Pre-drafted email</div>
              <div className="text-sm border border-slate-300 bg-white rounded-md p-3 whitespace-pre-wrap">
{emailBody}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={copyEmail} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy email'}
                </button>
                <button onClick={copyLink} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
                  <Link2 className="h-3.5 w-3.5" /> {copiedLink ? 'Copied!' : 'Copy link'}
                </button>
                <a href={mailto} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
                  Open draft <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="mt-2">
              <div className="text-sm font-medium mb-2">Or fill in address yourself</div>
              <div className="grid grid-cols-1 gap-2">
                <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="Street Line 1" value={addr.streetLine1} onChange={e=>setAddr(a=>({...a, streetLine1: e.target.value}))} />
                <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="Street Line 2 (Apt, Suite, Floor, etc.)" value={addr.streetLine2} onChange={e=>setAddr(a=>({...a, streetLine2: e.target.value}))} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="City" value={addr.city} onChange={e=>setAddr(a=>({...a, city: e.target.value}))} />
                  <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="State / Province" value={addr.state} onChange={e=>setAddr(a=>({...a, state: e.target.value}))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="Postal Code" value={addr.postCode} onChange={e=>setAddr(a=>({...a, postCode: e.target.value}))} />
                  <input className="px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="Country" value={addr.countryCode} onChange={e=>setAddr(a=>({...a, countryCode: e.target.value}))} />
                </div>
                <div className="flex justify-end mt-2">
                  {(() => {
                    const isAddressDirty =
                      (addr.streetLine1 || '') !== (current.streetLine1 || '') ||
                      (addr.streetLine2 || '') !== (current.streetLine2 || '') ||
                      (addr.city || '') !== (current.city || '') ||
                      (addr.state || '') !== (current.state || '') ||
                      (addr.postCode || '') !== (current.postCode || '') ||
                      (addr.countryCode || '') !== (current.countryCode || '');
                    const disabled = saving || !isAddressDirty;
                    return (
                      <button
                        disabled={disabled}
                        onClick={saveAddress}
                        className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-100`}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Address'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default AddressRequestsModal;


