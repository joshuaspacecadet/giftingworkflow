import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from '../types';
import { AirtableService } from '../services/airtable';
import { X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react';

interface ReviewContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onAdvance: (updatedContact: Contact) => void;
  creator: string;
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

const ReviewContactsModal: React.FC<ReviewContactsModalProps> = ({ isOpen, onClose, contacts, onAdvance, creator }) => {
  const [index, setIndex] = useState(0);
  const [sessionContacts, setSessionContacts] = useState<Contact[]>([]);
  const current = sessionContacts[index];
  const [saving, setSaving] = useState(false);
  const [hasApproved, setHasApproved] = useState(false);
  const [itemsSaved, setItemsSaved] = useState(false);
  const [confirmedNameCompany, setConfirmedNameCompany] = useState(false);
  const [hasRejected, setHasRejected] = useState(false);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  // items selection
  const [itemsMagic, setItemsMagic] = useState(false);
  const [itemsSfs, setItemsSfs] = useState(false);
  const [itemsGolden, setItemsGolden] = useState(false);

  // confirm name/company
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCompany, setEditCompany] = useState('');

  // right panel email/link/address
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [addr, setAddr] = useState({
    streetLine1: '',
    streetLine2: '',
    city: '',
    state: '',
    postCode: '',
    countryCode: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setSessionContacts(contacts);
    setIndex(0);
    setHasApproved(false);
    setItemsSaved(false);
    setConfirmedNameCompany(false);
    setHasRejected(false);
  }, [isOpen]);

  useEffect(() => {
    if (!current) return;
    // seed items from existing Draft Order Items
    const draft = (current.draftOrderItems || []);
    const wantsMagicCards = draft.includes('Magic Cards');
    setItemsMagic(wantsMagicCards);
    setItemsSfs(draft.includes('SFS Book'));
    setItemsGolden(draft.includes('Golden Record'));
    // seed name/company
    const parts = (current.name || '').trim().split(/\s+/);
    setEditFirstName(parts[0] || '');
    setEditLastName(parts.length > 1 ? parts[parts.length - 1] : '');
    setEditCompany(current.company || '');
    // seed address
    setAddr({
      streetLine1: current.streetLine1 || '',
      streetLine2: current.streetLine2 || '',
      city: current.city || '',
      state: current.state || '',
      postCode: current.postCode || '',
      countryCode: current.countryCode || '',
    });
    // initialize gates
    const hasInitialItems = draft.length > 0;
    // Only set hasApproved to true if we are *already past* the decision stage (i.e. in Fulfillment)
    // If we are in 'Gathering details', we still want to confirm items/details, but typically 'Gathering details' implies approved.
    // However, user requested: "It is not supposed to ask me to Confirm recipient details until I click approve."
    // So we reset hasApproved to false on open unless it's already fully processed (Fulfillment).
    // Actually, 'Gathering details' means they were approved and are picking items/details.
    // BUT, if the user wants the flow to "start over" visually for Review, we should be stricter.
    // The issue described is: "When the page first loads ... it asks ... to Confirm recipient details."
    // This likely happens because hasInitialItems is true (maybe defaults/saved).
    // We will force hasApproved to false initially unless specificStage is explicitly 'Fulfillment' or 'Gathering details'.
    
    // Wait, if they are in 'Review to receive gift', they shouldn't be approved yet.
    // So we should only set hasApproved=true if stage is NOT 'Review to receive gift'.
    setHasApproved(
      current.specificStage !== 'Review to receive gift' && (
        wantsMagicCards
          ? current.specificStage === 'Gathering details' || current.specificStage === 'Fulfillment'
          : (hasInitialItems || current.specificStage === 'Fulfillment')
      )
    );
    
    // Also reset confirmedNameCompany
    setConfirmedNameCompany(false);
    setHasRejected(rejectedIds.has(current.id));
  }, [current]);

  // freeze background scroll
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

  const titleText = useMemo(() => {
    const c = current;
    if (!c) return 'Review Recipient';
    const full = (c.name || '').trim();
    const parts = full.split(/\s+/);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const nameDisplay = [first, last].filter(Boolean).join(' ');
    return `Review Recipient: ${nameDisplay}${c.company ? `, ${c.company}` : ''}`;
  }, [current]);

  if (!isOpen) return null;
  if (!current) {
    return createPortal(
      <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-6" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Review Recipient</h3>
            <button className="text-slate-500" onClick={onClose}>×</button>
          </div>
          <div className="text-sm text-slate-600">No contacts to review.</div>
        </div>
      </div>,
      document.body
    );
  }

  const goNext = () => {
    if (index < sessionContacts.length - 1) {
      setIndex(index + 1);
      setHasApproved(false);
      setItemsSaved(false);
      setConfirmedNameCompany(false);
      setHasRejected(false);
    } else {
      onClose();
    }
  };
  const goPrev = () => {
    if (index > 0) {
      setIndex(index - 1);
      setHasApproved(false);
      setItemsSaved(false);
      setConfirmedNameCompany(false);
      // hasRejected will be recalculated from rejectedIds in useEffect on current change
    }
  };

  const firstName = (current.name || '').trim().split(/\s+/)[0] || '';
  const addressLink = current.confirmAddressUrl || '';
  const emailBody = `Hey ${firstName}, hope you're well. Real quick - I have a little something ready to ship to you. When you get a chance, can you fill out your address here: ${addressLink}

Excited for you to receive!

- ${creator}`;
  const mailto = `mailto:?subject=${encodeURIComponent('Address for Spacecadet gift')}&body=${encodeURIComponent(emailBody)}`;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(emailBody);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 1500);
    } catch {
      setCopiedEmail(false);
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

  const approve = () => {
    // Do not write to Airtable on approve; proceed to item selection
    setHasApproved(true);
    if (current) {
      // If previously marked rejected in this session, clear that marker
      setRejectedIds(prev => {
        const next = new Set(prev);
        next.delete(current.id);
        return next;
      });
      setHasRejected(false);
    }
  };
  const reject = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await AirtableService.updateContact(current.id, {
        specificStage: null as any,
        draftOrderItems: [] as any,
      } as any);
      if (updated) {
        onAdvance(updated);
        setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
      // Clear local selections and mark as rejected in this session
      setItemsMagic(false);
      setItemsSfs(false);
      setItemsGolden(false);
      setItemsSaved(false);
      setHasApproved(false);
      setRejectedIds(prev => {
        const next = new Set(prev);
        next.add(current.id);
        return next;
      });
      setHasRejected(true);
      goNext();
    } finally {
      setSaving(false);
    }
  };

  const saveItems = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const draft: string[] = [
        ...(itemsMagic ? ['Magic Cards'] : []),
        ...(itemsSfs ? ['SFS Book'] : []),
        ...(itemsGolden ? ['Golden Record'] : []),
      ];
      const nextStage = draft.includes('Magic Cards')
        ? 'Gathering details'
        : (draft.length > 0 ? 'Fulfillment' : null);
      const updated = await AirtableService.updateContact(current.id, {
        contactAddedBy: creator,
        draftOrderItems: draft,
        specificStage: nextStage as any,
      } as any);
      if (updated) {
        onAdvance(updated);
        setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
      setItemsSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const confirmNameCompany = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const fullName = [editFirstName, editLastName].filter(Boolean).join(' ').trim();
      const shouldUpdate =
        (fullName && fullName !== (current.name || '').trim()) ||
        (editCompany !== (current.company || ''));
      if (shouldUpdate) {
        const updated = await AirtableService.updateContact(current.id, {
          name: fullName || current.name,
          company: editCompany,
        });
        if (updated) {
          onAdvance(updated);
          setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        }
      }
      setConfirmedNameCompany(true);
    } finally {
      setSaving(false);
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
        setSessionContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
      // After saving address, go to next
      goNext();
    } finally {
      setSaving(false);
    }
  };

  const leftContent = (
    <div>
      {/* First met */}
      {!!current.firstMetDate && (
        <div className="mb-4 text-sm text-slate-700">
          You met {firstName} on {formatDate(current.firstMetDate)}.
        </div>
      )}

      {/* Decision */}
      <div className="mb-6">
        <div className="text-lg font-semibold mb-3">Would you like to send {firstName} a gift?</div>
        <div className="flex items-center gap-6">
          <button
            disabled={saving}
            onClick={approve}
            className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasApproved ? 'bg-green-500 ring-2 ring-green-600' : 'bg-green-200 hover:bg-green-300'}`}
            title="Approve"
          >
            <ThumbsUp className="h-8 w-8 text-green-700" />
          </button>
          <button
            disabled={saving}
            onClick={reject}
            className={`h-16 w-16 rounded-full flex items-center justify-center disabled:opacity-50 ${hasRejected ? 'bg-rose-500 ring-2 ring-rose-600' : 'bg-rose-200 hover:bg-rose-300'}`}
            title="Reject"
          >
            <ThumbsDown className="h-8 w-8 text-rose-700" />
          </button>
        </div>
      </div>

      {/* Items */}
      {/* Items (show only after approve) */}
      {hasApproved && (
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Select what to send</div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-blue-600" checked={itemsMagic} onChange={(e)=>setItemsMagic(e.target.checked)} disabled={saving} /> Magic Cards
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-blue-600" checked={itemsSfs} onChange={(e)=>setItemsSfs(e.target.checked)} disabled={saving} /> SFS Book
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-blue-600" checked={itemsGolden} onChange={(e)=>setItemsGolden(e.target.checked)} disabled={saving} /> Golden Record
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
            const disabled = saving || !isDirty;
            const label = saving
              ? ''
              : (!itemsSaved
                  ? (isDirty ? 'Save Items' : 'Select Items')
                  : (isDirty ? 'Save Items' : 'Saved'));
            return (
              <div className="mt-4 flex justify-end">
                <button
                  disabled={disabled}
                  onClick={saveItems}
                  className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-100`}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Confirm name/company */}
      {/* Confirm name/company (show only after items saved) */}
      {itemsSaved && (
        <div className="mb-2">
          <div className="text-sm font-medium mb-3">Confirm recipient details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
              <input type="text" disabled={saving} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editFirstName} onChange={(e)=>setEditFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
              <input type="text" disabled={saving} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editLastName} onChange={(e)=>setEditLastName(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
              <button
                type="button"
                disabled={saving || editCompany === 'Individual (No Company)'}
                onClick={() => setEditCompany('Individual (No Company)')}
                className={`text-[11px] underline ${editCompany === 'Individual (No Company)' ? 'text-slate-400' : 'text-black'}`}
                title='Use "Individual (No Company)"'
              >
                Use "Individual (No Company)"
              </button>
            </div>
            <input type="text" disabled={saving} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" value={editCompany} onChange={(e)=>setEditCompany(e.target.value)} />
          </div>
          {(() => {
            const savedName = (current.name || '').trim();
            const editedName = [editFirstName, editLastName].filter(Boolean).join(' ').trim();
            const savedCompany = current.company || '';
            const isDirtyNC = (editedName !== savedName) || (editCompany !== savedCompany);
            // Button should be enabled initially even if nothing changed.
            // After confirming, disable until something changes again.
            const disabled = saving || (confirmedNameCompany && !isDirtyNC);
            const label = saving
              ? ''
              : (confirmedNameCompany
                  ? (isDirtyNC ? 'Confirm Name + Company' : 'Saved')
                  : (isDirtyNC ? 'Confirm Name + Company' : 'Confirm Name + Company'));
            return (
              <div className="mt-4 flex justify-end">
                <button
                  disabled={disabled}
                  onClick={confirmNameCompany}
                  className={`px-4 py-2 text-sm rounded-md ${disabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-100`}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Summary of items */}
      {/* Removed summary of items */}
    </div>
  );

  const rightContent = (
    <div>
      {!confirmedNameCompany ? (
        <div className="text-sm text-slate-500">Complete the steps on the left to continue.</div>
      ) : (
        <>
          <div className="text-sm font-medium mb-2">Pre-drafted email</div>
          <div className="text-sm border border-slate-300 bg-white rounded-md p-3 whitespace-pre-wrap">
{emailBody}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={copyEmail} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
              <Copy className="h-3.5 w-3.5" /> {copiedEmail ? 'Copied!' : 'Copy email'}
            </button>
            <button onClick={copyLink} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
              <Link2 className="h-3.5 w-3.5" /> {copiedLink ? 'Copied!' : 'Copy link'}
            </button>
            <a href={mailto} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50">
              Open draft <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-6">
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
        </>
      )}
    </div>
  );

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
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

        <div className="px-6 pb-6 mt-5 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>{leftContent}</div>
          <div>{rightContent}</div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
};

export default ReviewContactsModal;


