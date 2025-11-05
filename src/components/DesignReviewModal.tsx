import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from '../types';
import PdfThumbnail from './PdfThumbnail';
import { AirtableService } from '../services/airtable';
import { X, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const current = contacts[index];

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

  const goNext = () => {
    if (index < contacts.length - 1) {
      setFeedback('');
      setIndex(index + 1);
    } else {
      onClose();
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
      if (updated) onAdvance(updated);
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
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-20">
          <div className="text-lg font-semibold text-slate-900">{titleText}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div
              className="border border-slate-200 rounded-lg p-3 flex items-center justify-center bg-slate-50 cursor-zoom-in"
              onClick={() => design && setIsPreviewOpen(true)}
              title={design ? 'Click to preview larger' : undefined}
            >
              {design ? (
                design.type?.startsWith('image/') ? (
                  <img src={design.url} alt={design.filename} className="max-h-[640px] object-contain" />
                ) : (
                  <PdfThumbnail url={design.url} className="h-[640px]" heightPx={640} />
                )
              ) : (
                <div className="text-sm text-slate-500">No design file</div>
              )}
            </div>
            {design && (
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <div className="font-medium">
                  <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={design.url} target="_blank" rel="noreferrer">
                    {design.filename} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>Uploaded {formatDateTime(current.latestDesignDate)}</div>
                {typeof design.size === 'number' && (
                  <div>Size {formatFileSize(design.size)}</div>
                )}
                <button type="button" className="text-blue-600 hover:underline" onClick={() => setIsPreviewOpen(true)}>Preview</button>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-3">Do you approve this design?</div>
            <div className="flex items-center gap-6 mb-4">
              <button disabled={saving} onClick={approve} className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasRejected ? 'bg-green-100' : 'bg-green-200 hover:bg-green-300'}`}>
                <ThumbsUp className="h-8 w-8 text-green-700" />
              </button>
              <button disabled={saving} onClick={() => setHasRejected(true)} className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasRejected ? 'bg-rose-300' : 'bg-rose-200 hover:bg-rose-300'}`}>
                <ThumbsDown className="h-8 w-8 text-rose-700" />
              </button>
            </div>

            <div className="text-sm font-medium mb-2">Please provide feedback</div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className={`w-full min-h-[160px] border border-slate-300 rounded-md p-3 text-sm ${hasRejected ? 'text-slate-900 bg-white' : 'text-slate-500 bg-slate-50'} disabled:bg-slate-50`}
              placeholder="Feedback enabled after clicking Reject"
              disabled={!hasRejected || saving}
            />
            <div className="mt-3 flex justify-end">
              <button disabled={saving || !hasRejected || !feedback} onClick={reject} className="px-4 py-2 text-sm rounded-md bg-slate-900 text-white disabled:opacity-50">Save Feedback</button>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 text-xs text-slate-500">{index + 1} of {contacts.length}</div>

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


