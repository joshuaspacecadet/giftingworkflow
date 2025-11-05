import React, { useMemo, useState } from 'react';
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

const DesignReviewModal: React.FC<DesignReviewModalProps> = ({ isOpen, onClose, contacts, onAdvance }) => {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const current = contacts[index];

  const design = useMemo(() => {
    if (!current) return null;
    const files = current.designFiles || [];
    return files[0] || null;
  }, [current]);

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

  return (
    <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl p-6" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Design Review: {current.name}{current.company ? `, ${current.company}` : ''}</div>
          <button className="text-slate-500" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="border border-slate-200 rounded-lg p-3 flex items-center justify-center bg-slate-50">
              {design ? (
                design.type?.startsWith('image/') ? (
                  <img src={design.url} alt={design.filename} className="max-h-[420px] object-contain" />
                ) : (
                  <PdfThumbnail url={design.url} className="h-[420px]" />
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
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-3">Do you approve this design?</div>
            <div className="flex items-center gap-6 mb-4">
              <button disabled={saving} onClick={approve} className="h-16 w-16 rounded-full bg-green-200 flex items-center justify-center hover:bg-green-300 disabled:opacity-50">
                <ThumbsUp className="h-8 w-8 text-green-700" />
              </button>
              <button disabled={saving} onClick={() => { /* enable feedback first; action on Save Feedback */ }} className="h-16 w-16 rounded-full bg-rose-200 flex items-center justify-center hover:bg-rose-300 disabled:opacity-50">
                <ThumbsDown className="h-8 w-8 text-rose-700" />
              </button>
            </div>

            <div className="text-sm font-medium mb-2">Please provide feedback</div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full min-h-[160px] border border-slate-300 rounded-md p-3 text-sm disabled:bg-slate-50"
              placeholder="Feedback enabled after clicking Reject"
              disabled={saving}
            />
            <div className="mt-3 flex justify-end">
              <button disabled={saving || !feedback} onClick={reject} className="px-4 py-2 text-sm rounded-md bg-slate-900 text-white disabled:opacity-50">Save Feedback</button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">{index + 1} of {contacts.length}</div>
      </div>
    </div>
  );
};

export default DesignReviewModal;


