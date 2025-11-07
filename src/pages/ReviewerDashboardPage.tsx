import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AirtableService } from '../services/airtable';
import { Contact, Project, SpecificStage } from '../types';
import { PREDEFINED_CONTACT_CREATORS } from '../config/airtable';
import { Loader2, FileText, Images, MapPin, Users as UsersIcon, Package, UserPlus, AlertTriangle } from 'lucide-react';
import PdfThumbnail from '../components/PdfThumbnail';
import DesignReviewModal from '../components/DesignReviewModal';
import AddressRequestsModal from '../components/AddressRequestsModal';
import ContactModal from '../components/ContactModal';

type NameParam = 'wiz' | 'john' | 'daniel';

const IN_DESIGN_STAGES: SpecificStage[] = [
  'Gathering details',
  'Drafting copy',
  'In design',
  'Design review',
  'Design approved',
];

const normalizeCreator = (raw?: string): string => {
  const n = (raw || '').toLowerCase() as NameParam;
  if (n === 'wiz') return 'Wiz';
  if (n === 'john') return 'John';
  if (n === 'daniel') return 'Daniel';
  return PREDEFINED_CONTACT_CREATORS[0] || 'Wiz';
};

const ReviewerDashboardPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const creator = normalizeCreator(name);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllGifts, setShowAllGifts] = useState(false);

  // Create Recipient modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>(undefined);
  const [confirmUnapproveId, setConfirmUnapproveId] = useState<string | null>(null);
  const [isDesignReviewOpen, setIsDesignReviewOpen] = useState(false);
  const [isAddressRequestsOpen, setIsAddressRequestsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddExistingOpen, setIsAddExistingOpen] = useState(false);
  const [allContactsDataset, setAllContactsDataset] = useState<Contact[]>([]);
  const [isLoadingAllContacts, setIsLoadingAllContacts] = useState(false);
  const [existingSearch, setExistingSearch] = useState('');
  const [selectedItemsByContact, setSelectedItemsByContact] = useState<Record<string, { magic: boolean; sfs: boolean; golden: boolean }>>({});
  const [filterNotMagic, setFilterNotMagic] = useState(false);
  const [filterNotSfs, setFilterNotSfs] = useState(false);
  const [filterNotGolden, setFilterNotGolden] = useState(false);
  const [visibleExistingCount, setVisibleExistingCount] = useState(50);
  const existingListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [allContacts, allProjects] = await Promise.all([
          AirtableService.getContacts(),
          AirtableService.getProjects(),
        ]);
        setContacts(allContacts);
        setProjects(allProjects);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      if (!isAddExistingOpen) return;
      setIsLoadingAllContacts(true);
      try {
        const all = await AirtableService.getContacts();
        const sorted = [...all].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAllContactsDataset(sorted);
        // Initialize checkbox states from existing Draft Order Items for approved contacts
        const initial: Record<string, { magic: boolean; sfs: boolean; golden: boolean }> = {};
        sorted.forEach((c) => {
          if (c.specificStage === 'Approved to receive gift') {
            const doi = ((c as any).draftOrderItems || []) as string[];
            initial[c.id] = {
              magic: doi.includes('Magic Cards'),
              sfs: doi.includes('SFS Book'),
              golden: doi.includes('Golden Record'),
            };
          }
        });
        setSelectedItemsByContact((prev) => ({ ...initial, ...prev }));
      } finally {
        setIsLoadingAllContacts(false);
      }
    };
    loadAll();
    if (isAddExistingOpen) setVisibleExistingCount(50);
  }, [isAddExistingOpen]);

  // Freeze background scroll while Add Existing modal is open
  useEffect(() => {
    if (!isAddExistingOpen) return;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
    };
  }, [isAddExistingOpen]);

  // Reset infinite list window when filters/search change
  useEffect(() => {
    setVisibleExistingCount(50);
  }, [existingSearch, filterNotMagic, filterNotSfs, filterNotGolden]);

  const handleExistingInfiniteScroll = useCallback(() => {
    const el = existingListRef.current;
    if (!el) return;
    const threshold = 120; // px before bottom to trigger
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      setVisibleExistingCount((prev) => prev + 50);
    }
  }, []);

  const filtered = useMemo(
    () => contacts.filter(c => (c.contactAddedBy || '').toLowerCase() === creator.toLowerCase()),
    [contacts, creator]
  );

  // Quick action datasets
  const designsReady = filtered.filter(c => c.specificStage === 'Design review');
  const designPreviewAttachments = useMemo(() => {
    const previews: { id?: string; url: string; filename?: string; type?: string }[] = [];
    for (const c of designsReady) {
      const files = (c.designFiles || []).filter(a => a && a.url);
      for (const f of files) {
        previews.push({ id: f.id, url: f.url, filename: f.filename, type: f.type });
        if (previews.length >= 3) break;
      }
      if (previews.length >= 3) break;
    }
    return previews;
  }, [designsReady]);
  const designApprovedMissingAddress = filtered.filter(
    c => c.specificStage === 'Fulfillment' && (!c.streetLine1 || !c.city || !c.countryCode)
  );
  const reviewToReceiveGift = filtered.filter(c => c.specificStage === 'Review to receive gift');

  // Pipeline datasets (toggle between creator-only vs all)
  const pipelineSource = showAllGifts ? contacts : filtered;
  const { approvedRecipients, inDesign, fulfillment } = useMemo(() => {
    const src = pipelineSource;
    return {
      approvedRecipients: src.filter(c => c.specificStage === 'Approved to receive gift'),
      inDesign: src.filter(c => !!c.specificStage && IN_DESIGN_STAGES.includes(c.specificStage)),
      fulfillment: src.filter(c => c.specificStage === 'Fulfillment' || c.specificStage === 'Shipped'),
    };
  }, [pipelineSource]);

  // Total count for header: only stages in design pipeline + Fulfillment (exclude empty)
  const pipelineCount = useMemo(() => {
    return pipelineSource.filter(
      (c) => !!c.specificStage && (IN_DESIGN_STAGES.includes(c.specificStage) || c.specificStage === 'Fulfillment')
    ).length;
  }, [pipelineSource]);

  const defaultProject = useMemo(
    () => projects.find(p => p.stage !== 'Project Complete') || projects[0],
    [projects]
  );

  const handleOpenAddExisting = () => {
    if (!defaultProject) return;
    window.location.href = `/project/${defaultProject.id}?modal=add-existing`;
  };

  const handleCreateSave = async (contactData: Partial<Contact>) => {
    setIsSaving(true);
    try {
      const draftOrderItems = ((contactData as any).draftOrderItems || []) as string[];
      // Compute next Specific Stage based on existing state: do not overwrite if already in pipeline (and not "Approved...")
      let specificStage: any = draftOrderItems.length > 0 ? ('Approved to receive gift' as any) : (null as any);
      let saved: Contact | null = null;
      if ((contactData as any).id) {
        // Update existing contact
        const existing = contacts.find((c) => c.id === (contactData as any).id);
        const allowStageChange = !existing?.specificStage || existing?.specificStage === 'Approved to receive gift';
        const updatePayload: any = {
          ...contactData,
          contactAddedBy: creator,
        };
        if (allowStageChange) {
          updatePayload.specificStage = specificStage;
        }
        saved = await AirtableService.updateContact((contactData as any).id, updatePayload);
      } else {
        // Create new contact
        saved = await AirtableService.createContact({
          ...contactData,
          contactAddedBy: creator,
          specificStage,
        } as any);
      }
      if (saved) {
        setContacts((prev) => {
          const exists = prev.some((c) => c.id === saved!.id);
          return exists ? prev.map((c) => (c.id === saved!.id ? saved! : c)) : [saved!, ...prev];
        });
        setIsCreateOpen(false);
        setEditingContact(undefined);
      }
      return saved;
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-slate-300">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white pb-24 md:pb-32">
      {/* Header */}
      <div className="max-w-[1200px] mx-auto px-6 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{creator}’s Gifting Dashboard</h1>
          <p className="text-sm text-slate-400">Your instant queue for reviews, address fixes, and shipments.</p>
        </div>
        <img src="/spacecadet-logo.png" alt="SPACECADET" className="h-5 opacity-90" />
      </div>

      {/* Quick Actions */}
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="bg-[#111214] rounded-2xl border border-[#27282B] p-6">
          <h2 className="text-sm text-slate-300 mb-4">Quick Actions</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Designs ready for review */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <Images className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="text-sm text-white">
                  <span className="font-semibold">{designsReady.length}</span> Magic Card designs ready for your review.
                </div>
              </div>
              {designPreviewAttachments.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  {designPreviewAttachments.map((a, idx) => {
                    const isImage = (a.type || '').startsWith('image/');
                    return isImage ? (
                      <img
                        key={a.id || `${a.url}-${idx}`}
                        src={a.url}
                        alt={a.filename || `Design ${idx + 1}`}
                        className="h-[100px] w-[70px] object-cover rounded-md border border-[#27282B] shadow-sm"
                      />
                    ) : (
                      <PdfThumbnail
                        key={a.id || `${a.url}-${idx}`}
                        url={a.url}
                        alt={a.filename || `Design ${idx + 1}`}
                        className="h-[100px] w-[70px] shadow-sm"
                      />
                    );
                  })}
                  {designsReady.length > designPreviewAttachments.length && (
                    <div className="h-[100px] w-[70px] rounded-md border border-[#27282B] bg-[#111214] flex items-center justify-center shadow-sm">
                      <div className="text-center leading-tight">
                        <div className="text-[13px] font-semibold text-slate-100">+{designsReady.length - designPreviewAttachments.length}</div>
                        <div className="text-[10px] text-slate-400">more</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-auto pt-3">
                <button onClick={() => setIsDesignReviewOpen(true)} className="text-xs bg-white text-black rounded-md px-3 py-1.5">Open review →</button>
              </div>
            </div>

            {/* Missing address */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="text-sm text-white">
                  <span className="font-semibold">{designApprovedMissingAddress.length}</span> gifts are set to ship, but have no address.
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 mt-2 flex-1">
                {designApprovedMissingAddress.slice(0, 5).map(c => (
                  <li key={c.id} className="flex items-center gap-2 truncate">
                    <span className="text-slate-500">•</span>
                    <span className="truncate">{`${c.name || 'Unnamed'}${c.company ? `, ${c.company}` : ''}`}</span>
                  </li>
                ))}
                {designApprovedMissingAddress.length > 5 && (
                  <li className="italic text-slate-500 pl-4">and {designApprovedMissingAddress.length - 5} more...</li>
                )}
              </ul>
              <div className="mt-auto pt-3">
                <button onClick={() => setIsAddressRequestsOpen(true)} className="text-xs bg-white text-black rounded-md px-3 py-1.5">Start address requests →</button>
              </div>
            </div>

            {/* Review to receive gift */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <UsersIcon className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="text-sm text-white">
                  <span className="font-semibold">{reviewToReceiveGift.length}</span> contacts you might want to gift.
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5 mt-2 flex-1">
                {reviewToReceiveGift.slice(0, 5).map(c => (
                  <li key={c.id} className="flex items-center gap-2 truncate">
                    <span className="text-slate-500">•</span>
                    <span className="truncate">{`${c.name || 'Unnamed'}${c.company ? `, ${c.company}` : ''}`}</span>
                  </li>
                ))}
                {reviewToReceiveGift.length > 5 && (
                  <li className="italic text-slate-500 pl-4">and {reviewToReceiveGift.length - 5} more...</li>
                )}
              </ul>
              <div className="mt-auto pt-3">
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Review contacts →</button>
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <button onClick={() => setIsAddExistingOpen(true)} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <Package className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm">Add recipient from a past shipment</div>
                  <div className="text-xs text-slate-400">Send the recipient something else.</div>
                </div>
              </div>
              <span className="text-slate-400">→</span>
            </button>

            <button onClick={() => setIsCreateOpen(true)} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm">Create a new recipient</div>
                  <div className="text-xs text-slate-400">Send a gift to someone new.</div>
                </div>
              </div>
              <span className="text-slate-400">→</span>
            </button>
          </div>

          {/* Beast mode */}
          <div className="mt-5 border border-[#FF5C00] rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/red-star.svg" alt="" className="h-7 w-7" />
              <div className="text-sm">Ready to tackle it all?</div>
            </div>
            <button className="text-xs bg-[#FF5C00] text-black font-semibold rounded-md px-3 py-1.5">Enter beast mode →</button>
          </div>
        </div>
      </div>

      {/* Production Pipeline */}
      <div className="max-w-[1200px] mx-auto px-6 mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-slate-300">Production Pipeline ({pipelineCount})</h3>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${!showAllGifts ? 'text-white' : 'text-slate-400'}`}>{creator}’s Gifts</span>
            <button
              type="button"
              aria-pressed={showAllGifts}
              onClick={() => setShowAllGifts(v => !v)}
              className={`relative inline-flex h-6 w-12 items-center rounded-full border border-[#3A3B3F] bg-[#1A1B1E] p-0.5`}
              title={showAllGifts ? 'Showing all gifts' : `Showing ${creator}’s gifts`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${showAllGifts ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <span className={`text-xs ${showAllGifts ? 'text-white' : 'text-slate-400'}`}>All Gifts</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Approved Recipients */}
          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-5 flex flex-col min-h-[240px]">
            <div className="text-[15px] font-semibold mb-1">Approved Recipients ({approvedRecipients.length})</div>
            <div className="text-xs text-slate-400 mb-3">Selected to receive a gift.</div>
            <ul className="text-xs text-slate-300 space-y-1.5 flex-1 overflow-auto pr-1">
              {approvedRecipients.length === 0 ? (
                <li className="italic text-slate-500">None yet</li>
              ) : (
                approvedRecipients.slice(0, 50).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 truncate relative">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500">•</span>
                      <button
                        type="button"
                        className="truncate hover:underline text-left"
                        onClick={() => { setEditingContact(c); setIsCreateOpen(true); }}
                        title="Edit recipient"
                      >
                        {c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}
                      </button>
                      {(!c.streetLine1 || !c.city || !c.countryCode) && (
                        <AlertTriangle className="ml-1 h-3 w-3 text-amber-400" title="Address needed" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-400 px-1"
                        aria-label="Remove from approved"
                        onClick={() => setConfirmUnapproveId(c.id)}
                      >
                        ×
                      </button>
                    </div>
                    {confirmUnapproveId === c.id && (
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-[#0F1012] border border-[#27282B] rounded-md px-2 py-1 text-[11px] text-slate-200 shadow-sm flex items-center gap-2">
                        <span>Really?</span>
                        <button
                          className="text-red-400 hover:text-red-300"
                          onClick={async () => {
                            try {
                              const updated = await AirtableService.updateContact(c.id, {
                                specificStage: null as any,
                                draftOrderItems: [] as any,
                              } as any);
                              if (updated) {
                                setContacts(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                                setAllContactsDataset(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                              }
                            } catch (e) { console.error('Unapprove failed', e); }
                            setConfirmUnapproveId(null);
                          }}
                        >Yes</button>
                        <button className="text-slate-400 hover:text-slate-200" onClick={() => setConfirmUnapproveId(null)}>No</button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* In Design */}
          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-5 flex flex-col min-h-[240px]">
            <div className="text-[15px] font-semibold mb-1">In Design ({inDesign.length})</div>
            <div className="text-xs text-slate-400 mb-3">Design in progress.</div>
            <ul className="text-xs text-slate-300 space-y-1.5 flex-1 overflow-auto pr-1">
              {inDesign.length === 0 ? (
                <li className="italic text-slate-500">None yet</li>
              ) : (
                inDesign.slice(0, 50).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 truncate relative">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500">•</span>
                      <button
                        type="button"
                        className="truncate hover:underline text-left"
                        onClick={() => { setEditingContact(c); setIsCreateOpen(true); }}
                        title="Edit recipient"
                      >
                        {c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}
                      </button>
                      {(!c.streetLine1 || !c.city || !c.countryCode) && (
                        <AlertTriangle className="ml-1 h-3 w-3 text-amber-400" title="Address needed" />
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-400 px-1"
                      aria-label="Remove from pipeline"
                      onClick={() => setConfirmUnapproveId(c.id)}
                    >
                      ×
                    </button>
                    {confirmUnapproveId === c.id && (
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-[#0F1012] border border-[#27282B] rounded-md px-2 py-1 text-[11px] text-slate-200 shadow-sm flex items-center gap-2">
                        <span>Really?</span>
                        <button
                          className="text-red-400 hover:text-red-300"
                          onClick={async () => {
                            try {
                              const updated = await AirtableService.updateContact(c.id, {
                                specificStage: null as any,
                                draftOrderItems: [] as any,
                              } as any);
                              if (updated) {
                                setContacts(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                                setAllContactsDataset(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                              }
                            } catch (e) { console.error('Unapprove failed', e); }
                            setConfirmUnapproveId(null);
                          }}
                        >Yes</button>
                        <button className="text-slate-400 hover:text-slate-200" onClick={() => setConfirmUnapproveId(null)}>No</button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Fulfillment */}
          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-5 flex flex-col min-h-[240px]">
            <div className="text-[15px] font-semibold mb-1">Fulfillment ({fulfillment.length})</div>
            <div className="text-xs text-slate-400 mb-3">Ready to go to the recipient.</div>
            <ul className="text-xs text-slate-300 space-y-1.5 flex-1 overflow-auto pr-1">
              {fulfillment.length === 0 ? (
                <li className="italic text-slate-500">None yet</li>
              ) : (
                fulfillment.slice(0, 50).map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2 truncate relative">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500">•</span>
                      <button
                        type="button"
                        className="truncate hover:underline text-left"
                        onClick={() => { setEditingContact(c); setIsCreateOpen(true); }}
                        title="Edit recipient"
                      >
                        {c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}
                      </button>
                      {(!c.streetLine1 || !c.city || !c.countryCode) && (
                        <AlertTriangle className="ml-1 h-3 w-3 text-amber-400" title="Address needed" />
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-400 px-1"
                      aria-label="Remove from pipeline"
                      onClick={() => setConfirmUnapproveId(c.id)}
                    >
                      ×
                    </button>
                    {confirmUnapproveId === c.id && (
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-[#0F1012] border border-[#27282B] rounded-md px-2 py-1 text-[11px] text-slate-200 shadow-sm flex items-center gap-2">
                        <span>Really?</span>
                        <button
                          className="text-red-400 hover:text-red-300"
                          onClick={async () => {
                            try {
                              const updated = await AirtableService.updateContact(c.id, {
                                specificStage: null as any,
                                draftOrderItems: [] as any,
                              } as any);
                              if (updated) {
                                setContacts(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                                setAllContactsDataset(prev => prev.map(pc => pc.id === c.id ? updated : pc));
                              }
                            } catch (e) { console.error('Unapprove failed', e); }
                            setConfirmUnapproveId(null);
                          }}
                        >Yes</button>
                        <button className="text-slate-400 hover:text-slate-200" onClick={() => setConfirmUnapproveId(null)}>No</button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Create Recipient Modal */}
      <ContactModal
        isOpen={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setEditingContact(undefined); }}
        onSave={handleCreateSave}
        isLoading={isSaving}
        availableCreators={PREDEFINED_CONTACT_CREATORS}
        lockedCreator={creator}
        contact={editingContact}
        lockCoreFields={editingContact ? (!!editingContact.specificStage && (IN_DESIGN_STAGES.includes(editingContact.specificStage as any) || editingContact.specificStage === 'Fulfillment')) : false}
      />

      {/* Design Review Modal */}
      <DesignReviewModal
        isOpen={isDesignReviewOpen}
        onClose={() => setIsDesignReviewOpen(false)}
        contacts={designsReady}
        onAdvance={(updated) => {
          setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        }}
      />

      {/* Address Requests Modal */}
      <AddressRequestsModal
        isOpen={isAddressRequestsOpen}
        onClose={() => setIsAddressRequestsOpen(false)}
        contacts={designApprovedMissingAddress}
        signerName={creator}
        onAdvance={(updated) => {
          setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        }}
      />

      {/* Add Existing Recipient Modal (dashboard) */}
      {isAddExistingOpen && (
        <div
          className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setIsAddExistingOpen(false)}
        >
          <div
            className="bg-white text-slate-900 w-full max-w-3xl rounded-xl border border-slate-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <Package className="h-4 w-4 text-slate-600" />
                </div>
                <h4 className="text-sm font-semibold">Add Existing Recipient</h4>
              </div>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setIsAddExistingOpen(false)}>×</button>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-600 mb-3">Send a gift to someone we've gifted in the past.</p>

            {/* Filters: show only who has NOT been sent */}
            <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
              <span className="text-slate-600">Show only contacts who have not been sent:</span>
              <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={filterNotMagic} onChange={(e)=>setFilterNotMagic(e.target.checked)} /> Magic Cards</label>
              <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={filterNotSfs} onChange={(e)=>setFilterNotSfs(e.target.checked)} /> SFS Book</label>
              <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={filterNotGolden} onChange={(e)=>setFilterNotGolden(e.target.checked)} /> Golden Record</label>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={existingSearch}
                onChange={(e) => setExistingSearch(e.target.value)}
                placeholder="Search by name or company..."
                className="w-full px-3 py-2 rounded-md bg-white border border-slate-300 text-sm placeholder-slate-400"
              />
            </div>

            <div className="max-h-[50vh] overflow-auto pr-1" ref={existingListRef} onScroll={handleExistingInfiniteScroll}>
              {isLoadingAllContacts ? (
                <div className="text-sm text-slate-400">Loading contacts…</div>
              ) : (
                <ul className="text-sm space-y-1.5">
                  {allContactsDataset
                    .filter((c) => {
                      const q = existingSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (c.name || '').toLowerCase().includes(q) ||
                        (c.company || '').toLowerCase().includes(q)
                      );
                    })
                    .filter((c)=>{
                      const notSentMagic = (c.magicCardsProjects || []).length === 0;
                      const notSentSfs = (c.sfsBookProjects || []).length === 0;
                      const notSentGolden = (c.goldenRecordProjects || []).length === 0;
                      if (filterNotMagic && !notSentMagic) return false;
                      if (filterNotSfs && !notSentSfs) return false;
                      if (filterNotGolden && !notSentGolden) return false;
                      return true;
                    })
                    .slice(0, visibleExistingCount)
                    .map((c) => {
                      const savedDraft: string[] = ((c as any).draftOrderItems || []) as string[];
                      const selected = selectedItemsByContact[c.id] || { magic: false, sfs: false, golden: false };
                      const currentDraft = [
                        ...(selected.magic ? ['Magic Cards'] : []),
                        ...(selected.sfs ? ['SFS Book'] : []),
                        ...(selected.golden ? ['Golden Record'] : []),
                      ];
                      const setEq = (a: string[], b: string[]) => a.length === b.length && a.every(v => b.includes(v));
                      const isDirty = !setEq(currentDraft, savedDraft);
                      const nextStageEmpty = currentDraft.length === 0;
                      return (
                      <li key={c.id} className="p-2 rounded-md border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate">
                            <span className="truncate">{c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={!!selectedItemsByContact[c.id]?.magic} onChange={(e)=>setSelectedItemsByContact(prev=>({ ...prev, [c.id]: { magic: e.target.checked, sfs: !!prev[c.id]?.sfs, golden: !!prev[c.id]?.golden } }))}/> Magic Cards</label>
                            <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={!!selectedItemsByContact[c.id]?.sfs} onChange={(e)=>setSelectedItemsByContact(prev=>({ ...prev, [c.id]: { magic: !!prev[c.id]?.magic, sfs: e.target.checked, golden: !!prev[c.id]?.golden } }))}/> SFS Book</label>
                            <label className="flex items-center gap-1"><input type="checkbox" className="accent-blue-500" checked={!!selectedItemsByContact[c.id]?.golden} onChange={(e)=>setSelectedItemsByContact(prev=>({ ...prev, [c.id]: { magic: !!prev[c.id]?.magic, sfs: !!prev[c.id]?.sfs, golden: e.target.checked } }))}/> Golden Record</label>
                            <button
                              onClick={async ()=>{
                                try {
                                  const draftOrderItems = currentDraft;
                                  const updated = await AirtableService.updateContact(c.id, {
                                    contactAddedBy: creator,
                                    specificStage: (draftOrderItems.length > 0 ? 'Approved to receive gift' : null) as any,
                                    draftOrderItems,
                                  } as any);
                                  if (updated) {
                                    setContacts(prev=>prev.map(pc=>pc.id===c.id?updated:pc));
                                    setAllContactsDataset(prev=>prev.map(pc=>pc.id===c.id?updated:pc));
                                  }
                                } catch(e) { console.error('Add selected failed', e); }
                              }}
                              className={`text-xs px-2 py-1 rounded border ${isDirty ? 'border-blue-400 text-blue-700' : 'border-slate-300'} hover:bg-slate-50`}
                            >
                              {isDirty ? 'Save Changes' : 'Add Selected'}
                            </button>
                          </div>
                        </div>
                        {/* Already sent badges */}
                        <div className="mt-2 pl-4">
                          <span className="text-[11px] text-slate-600 mr-2">Already sent:</span>
                          <span className="inline-flex flex-wrap gap-1 align-middle">
                            {(c.magicCardsProjects || []).length > 0 && (
                              <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">Magic Cards</span>
                            )}
                            {(c.goldenRecordProjects || []).length > 0 && (
                              <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">Golden Record</span>
                            )}
                            {(c.cardsAgainstRealityProjects || []).length > 0 && (
                              <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">Cards Against Reality</span>
                            )}
                            {(c.fundIiVideoProjects || []).length > 0 && (
                              <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">Fund II Video</span>
                            )}
                            {(c.sfsBookProjects || []).length > 0 && (
                              <span className="inline-block text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700">SFS Book</span>
                            )}
                            {(c.magicCardsProjects || []).length === 0 && (c.goldenRecordProjects || []).length === 0 && (c.cardsAgainstRealityProjects || []).length === 0 && (c.fundIiVideoProjects || []).length === 0 && (c.sfsBookProjects || []).length === 0 && (
                              <span className="text-[10px] text-slate-500">None</span>
                            )}
                          </span>
                        </div>
                      </li>
                    )})}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewerDashboardPage;


