import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Contact, SpecificStage } from '../types';
import { AirtableService } from '../services/airtable';
import PdfThumbnail from './PdfThumbnail';
import { X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Copy, ExternalLink, Link2, Loader2, Shuffle, Square } from 'lucide-react';

type BeastItemType = 'review' | 'address' | 'design';

interface BeastModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewRecipients: Contact[];
  addressRequests: Contact[];
  designs: Contact[];
  onAdvance: (updated: Contact) => void;
  creator: string;
}

interface AddressForm {
  streetLine1: string;
  streetLine2: string;
  city: string;
  state: string;
  postCode: string;
  countryCode: string;
}

const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString();
  } catch {
    return dateString;
  }
};

const BeastModeModal: React.FC<BeastModeModalProps> = ({
  isOpen,
  onClose,
  reviewRecipients,
  addressRequests,
  designs,
  onAdvance,
  creator,
}) => {
  const items = useMemo(() => {
    const list: Array<{ type: BeastItemType; contact: Contact }> = [];
    reviewRecipients.forEach(c => list.push({ type: 'review', contact: c }));
    addressRequests.forEach(c => list.push({ type: 'address', contact: c }));
    designs.forEach(c => list.push({ type: 'design', contact: c }));
    return list;
  }, [reviewRecipients, addressRequests, designs]);

  // Maintain a mutable queue to support shuffling
  const [queue, setQueue] = useState<Array<{ type: BeastItemType; contact: Contact }>>([]);
  const [hasBooted, setHasBooted] = useState(false);
  const [index, setIndex] = useState(0);
  const current = queue[index]?.contact;
  const currentType = queue[index]?.type;
  const total = queue.length;
  const [shuffleOn, setShuffleOn] = useState(false);

  // Initialize queue when opened or lists change
  useEffect(() => {
    if (!isOpen) {
      setQueue([]);
      setIndex(0);
      setHasBooted(false);
      return;
    }
    setQueue(items);
    setIndex(0);
    setHasBooted(true);
  }, [isOpen, items]);


  // Local state for Review Recipient step
  const [hasApprovedReview, setHasApprovedReview] = useState(false);
  const [itemsMagic, setItemsMagic] = useState(false);
  const [itemsSfs, setItemsSfs] = useState(false);
  const [itemsGolden, setItemsGolden] = useState(false);
  const [itemsSaved, setItemsSaved] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [confirmedNameCompany, setConfirmedNameCompany] = useState(false);

  // Local state for Address Requests + right-panel address in review flow
  const [addr, setAddr] = useState<AddressForm>({
    streetLine1: '',
    streetLine2: '',
    city: '',
    state: '',
    postCode: '',
    countryCode: '',
  });

  // Local state for Design Review step
  const [hasRejectedDesign, setHasRejectedDesign] = useState(false);
  const [hasApprovedDesign, setHasApprovedDesign] = useState(false);
  const [designFeedback, setDesignFeedback] = useState('');
  // Stopwatch
  const [startTs] = useState<number>(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isStopped, setIsStopped] = useState(false);
  const [stoppedElapsedMs, setStoppedElapsedMs] = useState(0);
  const handleFinish = useCallback(() => {
    if (isStopped) return;
    setStoppedElapsedMs(elapsedMs);
    setIsStopped(true);
  }, [elapsedMs, isStopped]);

  useEffect(() => {
    if (isOpen && hasBooted && total === 0) {
      handleFinish();
    }
  }, [isOpen, hasBooted, total, handleFinish]);
  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startTs), 50);
    return () => window.clearInterval(id);
  }, [startTs]);
  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const millis = ms % 1000;
    const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const three = (n: number) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`);
    const base = hrs > 0 ? `${hrs}:${two(mins)}:${two(secs)}` : `${two(mins)}:${two(secs)}`;
    return `${base}.${three(millis)}`;
  };
  const formatHuman = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const parts: string[] = [];
    if (hrs > 0) parts.push(`${hrs} ${hrs === 1 ? 'hour' : 'hours'}`);
    if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
    parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
    return parts.join(' ');
  };

  // Initialize per-item state on index change
  useEffect(() => {
    if (!current) return;
    // Review recipients initial
    const draft = (current.draftOrderItems || []);
    const wantsMagicCards = draft.includes('Magic Cards');
    setItemsMagic(wantsMagicCards);
    setItemsSfs(draft.includes('SFS Book'));
    setItemsGolden(draft.includes('Golden Record'));
    setItemsSaved(draft.length > 0);
    const parts = (current.name || '').trim().split(/\s+/);
    setEditFirstName(parts[0] || '');
    setEditLastName(parts.length > 1 ? parts[parts.length - 1] : '');
    setEditCompany(current.company || '');
    setHasApprovedReview(
      wantsMagicCards
        ? current.specificStage === 'Fulfillment'
        : (draft.length > 0 || current.specificStage === 'Fulfillment')
    );
    setConfirmedNameCompany(false);

    // Address initial
    setAddr({
      streetLine1: current.streetLine1 || '',
      streetLine2: current.streetLine2 || '',
      city: current.city || '',
      state: current.state || '',
      postCode: current.postCode || '',
      countryCode: current.countryCode || '',
    });

    // Design initial
    setHasRejectedDesign(current.specificStage === 'Design rejected');
    setHasApprovedDesign(current.specificStage === 'Fulfillment' || current.specificStage === 'Design approved');
    setDesignFeedback(current.latestDesignFeedback || '');
  }, [index, current]);

  // Freeze background scroll
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

  // Build the dynamic title BEFORE any early returns to keep hook order consistent
  const titleText = useMemo(() => {
    if (!current) return 'Beast Mode';
    const full = (current.name || '').trim();
    const parts = full.split(/\s+/);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const nameDisplay = [first, last].filter(Boolean).join(' ');
    const suffix = `${nameDisplay}${current.company ? `, ${current.company}` : ''}`;
    if (currentType === 'design') return `Design Review: ${suffix}`;
    if (currentType === 'address') return `Address Request: ${suffix}`;
    return `Review Recipient: ${suffix}`;
  }, [current, currentType]);

  if (!isOpen) return null;

  // Define completion overlay early so it can be used in the loading guard
  const renderCompletionOverlay = () => (
    <div className="fixed inset-0 z-[3002] bg-black/90 flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="text-center px-6">
        <div className="text-3xl md:text-4xl font-semibold text-slate-100 mb-2">You beast.</div>
        <div className="text-xl md:text-2xl text-[#FF5C00]">You completed in {formatHuman(stoppedElapsedMs || elapsedMs)}.</div>
        <div className="mt-6">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-[#27282B] bg-[#FF5C00] px-4 py-2 text-black font-semibold"
            title="Close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (!current) {
    return isStopped ? (
      renderCompletionOverlay()
    ) : (
      <div
        className="fixed inset-0 bg-black z-[3000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="flex flex-col items-center gap-3 text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <Loader2 className="h-6 w-6 animate-spin text-[#FF5C00]" />
          <div className="text-sm">Loading Beast Mode…</div>
        </div>
      </div>
    );
  }

  const firstName = (current.name || '').trim().split(/\s+/)[0] || '';
  const emailBody = `Hey ${firstName}, hope you're well. Real quick - I have a little something ready to ship to you. When you get a chance, can you fill out your address here: ${current.confirmAddressUrl || ''}\n\nExcited for you to receive!\n\n- ${creator}`;
  const mailto = `mailto:${current.email || ''}?subject=${encodeURIComponent('Address for Spacecadet gift')}&body=${encodeURIComponent(emailBody)}`;

  const goNext = () => {
    if (index < total - 1) {
      setIndex(index + 1);
    } else {
      handleFinish();
    }
  };
  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const shuffleRemaining = () => {
    setQueue(prev => {
      const head = prev.slice(0, index + 1); // keep items up to current (inclusive) in place
      const tail = prev.slice(index + 1);
      if (tail.length > 1) {
        for (let i = tail.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tail[i], tail[j]] = [tail[j], tail[i]];
        }
        // Ensure different first element if possible
        if (prev[index + 1] && tail[0] && (tail[0].contact.id === prev[index + 1].contact.id) && tail.length > 1) {
          [tail[0], tail[1]] = [tail[1], tail[0]];
        }
      }
      return [...head, ...tail];
    });
    setShuffleOn(true);
  };

  // Handlers shared or per-type
  const approveDesign = async () => {
    const updated = await AirtableService.updateContact(current.id, {
      specificStage: 'Fulfillment' as SpecificStage,
      latestDesignFeedback: '',
    } as any);
    if (updated) {
      onAdvance(updated);
      setHasApprovedDesign(true);
      setHasRejectedDesign(false);
      goNext();
    }
  };
  const rejectDesign = async () => {
    const updated = await AirtableService.updateContact(current.id, {
      specificStage: 'Design rejected' as SpecificStage,
      latestDesignFeedback: designFeedback || '',
    } as any);
    if (updated) {
      onAdvance(updated);
      goNext();
    }
  };

  const approveReview = () => {
    setHasApprovedReview(true);
  };
  const rejectReview = async () => {
    const updated = await AirtableService.updateContact(current.id, {
      specificStage: null as any,
      draftOrderItems: [] as any,
    } as any);
    if (updated) {
      onAdvance(updated);
      goNext();
    }
  };
  const saveItems = async () => {
    const draft: string[] = [
      ...(itemsMagic ? ['Magic Cards'] : []),
      ...(itemsSfs ? ['SFS Book'] : []),
      ...(itemsGolden ? ['Golden Record'] : []),
    ];
    const nextStage = draft.includes('Magic Cards')
      ? (draft.length > 0 ? 'Gathering details' : null)
      : (draft.length > 0 ? 'Fulfillment' : null);
    const updated = await AirtableService.updateContact(current.id, {
      contactAddedBy: creator,
      draftOrderItems: draft,
      specificStage: nextStage as any,
    } as any);
    if (updated) {
      onAdvance(updated);
      setItemsSaved(true);
    }
  };
  const confirmNameCompany = async () => {
    const fullName = [editFirstName, editLastName].filter(Boolean).join(' ').trim();
    const shouldUpdate =
      (fullName && fullName !== (current.name || '').trim()) ||
      (editCompany !== (current.company || ''));
    if (shouldUpdate) {
      const updated = await AirtableService.updateContact(current.id, {
        name: fullName || current.name,
        company: editCompany,
      });
      if (updated) onAdvance(updated);
    }
    setConfirmedNameCompany(true);
  };
  const saveAddress = async () => {
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
      goNext();
    }
  };

  // Per-type content
  const renderLeft = () => {
    if (currentType === 'design') {
      const file = (current.designFiles || [])[0];
      const isImage = file && ((file.type?.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(file.filename || file.url || ''));
      return (
        <div>
          <div className="rounded-lg flex items-center justify-center">
            {file ? (
              isImage ? (
                <img src={file.url} alt={file.filename} className="max-h-[540px] object-contain" />
              ) : (
                <PdfThumbnail url={file.url} className="h-[540px]" heightPx={540} />
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
      );
    }
    if (currentType === 'address') {
      const stage = current.specificStage as SpecificStage | undefined;
      const shouldHideDesignPreview = stage === 'In design' || stage === 'Design rejected';
      const file = shouldHideDesignPreview ? null : (current.designFiles || [])[0];
      const isImage = file && ((file.type?.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(file.filename || file.url || ''));
      return (
        <div>
          <div className="rounded-lg flex items-center justify-center">
            {file ? (
              isImage ? (
                <img src={file.url} alt={file.filename} className="max-h-[540px] object-contain" />
              ) : (
                <PdfThumbnail url={file.url} className="h-[540px]" heightPx={540} />
              )
            ) : (
              <div className="text-sm text-slate-500">
                {(() => {
                  const items = (current.draftOrderItems || []) as string[];
                  const hasMagicCards = Array.isArray(items) && items.includes('Magic Cards');
                  return hasMagicCards ? "Design pending" : "No design file";
                })()}
              </div>
            )}
          </div>
          <div className="mt-3 text-xs text-slate-500 text-center">
            Set to receive: {((current.draftOrderItems || []).length > 0 ? (current.draftOrderItems || []).join(', ') : '—')}
          </div>
        </div>
      );
    }
    // review
    return (
      <div>
        {!!current.firstMetDate && (
          <div className="mb-4 text-sm text-slate-700">
            You met {firstName} on {formatDate(current.firstMetDate)}.
          </div>
        )}
        <div className="mb-6">
          <div className="text-lg font-semibold mb-3">Would you like to send {firstName} a gift?</div>
          <div className="flex items-center gap-6">
            <button
              onClick={approveReview}
              className={`h-16 w-16 rounded-full flex items-center justify-center ${hasApprovedReview ? 'bg-green-500 ring-2 ring-green-600' : 'bg-green-200 hover:bg-green-300'}`}
              title="Approve"
            >
              <ThumbsUp className="h-8 w-8 text-green-700" />
            </button>
            <button
              onClick={rejectReview}
              className="h-16 w-16 rounded-full flex items-center justify-center bg-rose-200 hover:bg-rose-300"
              title="Reject"
            >
              <ThumbsDown className="h-8 w-8 text-rose-700" />
            </button>
          </div>
        </div>
        {hasApprovedReview && (
          <>
            <div className="mb-6">
              <div className="text-sm font-medium mb-2">Select what to send</div>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-blue-600" checked={itemsMagic} onChange={(e)=>setItemsMagic(e.target.checked)} /> Magic Cards
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-blue-600" checked={itemsSfs} onChange={(e)=>setItemsSfs(e.target.checked)} /> SFS Book
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-blue-600" checked={itemsGolden} onChange={(e)=>setItemsGolden(e.target.checked)} /> Golden Record
                </label>
              </div>
              {(() => {
                const selection: string[] = [
                  ...(itemsMagic ? ['Magic Cards'] : []),
                  ...(itemsSfs ? ['SFS Book'] : []),
                  ...(itemsGolden ? ['Golden Record'] : []),
                ];
                const saved: string[] = (current.draftOrderItems || []);
                const setEq = (a: string[], b: string[]) => a.length === b.length && a.every(v => b.includes(v));
                const isDirty = !setEq(selection, saved);
                const disabled = !isDirty;
                const label = !itemsSaved ? (isDirty ? 'Save Items' : 'Select Items') : (isDirty ? 'Save Items' : 'Saved');
                return (
                  <div className="mt-4 flex justify-end">
                    <button
                      disabled={disabled}
                      onClick={saveItems}
                      className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-100`}
                    >
                      {label}
                    </button>
                  </div>
                );
              })()}
            </div>
            {itemsSaved && (
              <div className="mb-2">
                <div className="text-sm font-medium mb-3">Confirm recipient details</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                    <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editFirstName} onChange={(e)=>setEditFirstName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                    <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editLastName} onChange={(e)=>setEditLastName(e.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
                    <button
                      type="button"
                      onClick={() => setEditCompany('Individual (No Company)')}
                      className={`text-[11px] underline ${editCompany === 'Individual (No Company)' ? 'text-slate-400' : 'text-black'}`}
                      title='Use "Individual (No Company)"'
                      disabled={editCompany === 'Individual (No Company)'}
                    >
                      Use "Individual (No Company)"
                    </button>
                  </div>
                  <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editCompany} onChange={(e)=>setEditCompany(e.target.value)} />
                </div>
                {(() => {
                  const savedName = (current.name || '').trim();
                  const editedName = [editFirstName, editLastName].filter(Boolean).join(' ').trim();
                  const savedCompany = current.company || '';
                  const isDirtyNC = (editedName !== savedName) || (editCompany !== savedCompany);
                  const disabled = (confirmedNameCompany && !isDirtyNC);
                  const label = confirmedNameCompany ? (isDirtyNC ? 'Confirm Name + Company' : 'Saved') : 'Confirm Name + Company';
                  return (
                    <div className="mt-4 flex justify-end">
                      <button
                        disabled={disabled}
                        onClick={confirmNameCompany}
                        className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-100`}
                      >
                        {label}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderRight = () => {
    if (currentType === 'design') {
      return (
        <div>
          <div className="text-lg font-semibold mb-4">Do you approve this design?</div>
          <div className="flex items-center gap-6 mb-4">
            <button onClick={approveDesign} className={`h-16 w-16 rounded-full flex items-center justify-center ${hasApprovedDesign ? 'bg-green-500 ring-2 ring-green-600' : 'bg-green-200 hover:bg-green-300'}`} title="Approve">
              <ThumbsUp className="h-8 w-8 text-green-700" />
            </button>
            <button onClick={() => { setHasRejectedDesign(true); setHasApprovedDesign(false); }} className={`h-16 w-16 rounded-full flex items-center justify-center ${hasRejectedDesign ? 'bg-rose-500 ring-2 ring-rose-600' : 'bg-rose-200 hover:bg-rose-300'}`} title="Reject">
              <ThumbsDown className="h-8 w-8 text-rose-700" />
            </button>
          </div>
          {hasRejectedDesign && (
            <div className="mt-6">
              <div className="text-sm font-medium mb-2">Required: provide feedback and click save to reject this design.</div>
              <textarea
                value={designFeedback}
                onChange={(e) => setDesignFeedback(e.target.value)}
                className="w-full min-h-[160px] border border-slate-300 rounded-md p-3 text-sm text-slate-900 bg-white"
                placeholder="Share why the design needs changes"
              />
              <div className="mt-3 flex justify-end">
                <button disabled={!designFeedback} onClick={rejectDesign} className="px-4 py-2 text-sm rounded-md bg-slate-900 text-white disabled:opacity-50">Save</button>
              </div>
            </div>
          )}
        </div>
      );
    }
    // Address or (Review after confirm) right content: email + address entry
    const canShowRight = currentType === 'address' || confirmedNameCompany;
    if (!canShowRight) return <div className="text-sm text-slate-500">Complete the steps on the left to continue.</div>;
    return (
        <div>
          <div className="text-sm font-medium mb-2">Pre-drafted email</div>
          <div className="text-sm border border-[#27282B] bg-[#151619] rounded-md p-3 whitespace-pre-wrap">
{emailBody}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => navigator.clipboard.writeText(emailBody)} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-[#27282B] bg-[#151619] hover:bg-[#1B1C20]">
            <Copy className="h-3.5 w-3.5" /> Copy email
          </button>
          <button onClick={() => navigator.clipboard.writeText(current.confirmAddressUrl || '')} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-[#27282B] bg-[#151619] hover:bg-[#1B1C20]">
            <Link2 className="h-3.5 w-3.5" /> Copy link
          </button>
          <a href={mailto} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-[#27282B] bg-[#151619] hover:bg-[#1B1C20]">
            Open draft <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-6">
            <div className="text-sm font-medium mb-2">Or fill in address yourself</div>
            <div className="grid grid-cols-1 gap-2">
              <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="Street Line 1" value={addr.streetLine1} onChange={e=>setAddr(a=>({...a, streetLine1: e.target.value}))} />
              <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="Street Line 2 (Apt, Suite, Floor, etc.)" value={addr.streetLine2} onChange={e=>setAddr(a=>({...a, streetLine2: e.target.value}))} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="City" value={addr.city} onChange={e=>setAddr(a=>({...a, city: e.target.value}))} />
                <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="State / Province" value={addr.state} onChange={e=>setAddr(a=>({...a, state: e.target.value}))} />
            </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="Postal Code" value={addr.postCode} onChange={e=>setAddr(a=>({...a, postCode: e.target.value}))} />
                <input className="px-3 py-2 text-sm border border-[#27282B] bg-[#111214] text-slate-100 rounded-md placeholder-slate-500" placeholder="Country" value={addr.countryCode} onChange={e=>setAddr(a=>({...a, countryCode: e.target.value}))} />
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
                const disabled = !isAddressDirty;
                return (
                  <button
                    disabled={disabled}
                    onClick={saveAddress}
                      className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-700 text-slate-400' : 'bg-white text-black hover:bg-slate-100'} disabled:opacity-100`}
                  >
                    Save Address
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#0B0B0C] text-slate-100 z-[3000] flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#27282B] bg-[#0F1012]" onClick={(e)=>e.stopPropagation()}>
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-24" />
          <div className="text-center flex-1">
            <div className="text-lg font-semibold">{titleText}</div>
            <div className="text-xs text-slate-400">{index + 1} of {total}</div>
          </div>
          <div className="w-24 flex items-center justify-end">
            <button className="text-slate-300 hover:text-white" onClick={onClose}><X className="h-5 w-5" /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="px-6 py-6">
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>{renderLeft()}</div>
            <div>{renderRight()}</div>
          </div>
        </div>
      </div>

      {/* Player-style controls */}
      <div className="px-6 py-4 border-t border-[#27282B] bg-[#0F1012]" onClick={(e)=>e.stopPropagation()}>
        <div className="w-full max-w-6xl mx-auto flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-full border border-[#27282B] bg-[#151619] px-4 py-2 text-slate-100 disabled:opacity-40"
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs">Back</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (shuffleOn) {
                // turn off shuffle mode label; keep current order
                setShuffleOn(false);
              } else {
                shuffleRemaining();
              }
            }}
            disabled={total - index <= 1}
            className={`inline-flex items-center justify-center rounded-full border border-[#27282B] ${shuffleOn ? 'bg-[#FF5C00] text-black' : 'bg-[#151619] text-slate-100'} w-8 h-8 disabled:opacity-40`}
            title="Shuffle remaining"
          >
            <Shuffle className="h-4 w-4" />
          </button>
          {/* Stopwatch readout */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#27282B] bg-[#151619] px-3 py-1.5">
            <span className="text-xs text-[#FF5C00] font-mono">⏱ {formatElapsed(elapsedMs)}</span>
          </div>
          {/* Stop (end) button styled like player control */}
          <button
            type="button"
            onClick={handleFinish}
            className="inline-flex items-center justify-center rounded-full border border-[#27282B] bg-[#FF5C00] w-8 h-8 text-black"
            title="Stop"
          >
            <Square className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={index >= total - 1}
            className="inline-flex items-center gap-2 rounded-full border border-[#27282B] bg-[#151619] px-4 py-2 text-slate-100 disabled:opacity-40"
            title="Next"
          >
            <span className="text-xs">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Completion overlay */}
      {isStopped && renderCompletionOverlay()}
    </div>
  );
};

export default BeastModeModal;


