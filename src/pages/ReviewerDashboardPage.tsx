import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AirtableService } from '../services/airtable';
import { Contact, Project, SpecificStage } from '../types';
import { PREDEFINED_CONTACT_CREATORS } from '../config/airtable';
import { Loader2, FileText, Images, MapPin, Users as UsersIcon, Package, UserPlus } from 'lucide-react';
import PdfThumbnail from '../components/PdfThumbnail';
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
  const [isSaving, setIsSaving] = useState(false);

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
    c => c.specificStage === 'Design approved' && (!c.streetLine1 || !c.city || !c.countryCode)
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
      const saved = await AirtableService.createContact(contactData);
      if (saved) {
        setContacts(prev => [saved, ...prev]);
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
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      {/* Header */}
      <div className="max-w-[1200px] mx-auto px-6 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{creator}’s Gifting Dashboard</h1>
          <p className="text-sm text-slate-400">Quick actions and reviews to keep the gifts flowin’.</p>
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
                  <Images className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <div className="text-sm text-slate-300">
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
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Open review →</button>
              </div>
            </div>

            {/* Missing address */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <div className="text-sm text-slate-300">
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
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Start address requests →</button>
              </div>
            </div>

            {/* Review to receive gift */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <UsersIcon className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <div className="text-sm text-slate-300">
                  <span className="font-semibold">{reviewToReceiveGift.length}</span> contacts you might want to send a gift to.
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
            <button onClick={handleOpenAddExisting} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <Package className="h-4 w-4 text-slate-300" />
                </div>
                <div>
                  <div className="text-sm">Add recipient from a past shipment</div>
                  <div className="text-xs text-slate-400">Send the recipient something else</div>
                </div>
              </div>
              <span className="text-slate-400">→</span>
            </button>

            <button onClick={() => setIsCreateOpen(true)} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-[#151619] border border-[#27282B] flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-slate-300" />
                </div>
                <div>
                  <div className="text-sm">Create a new recipient</div>
                  <div className="text-xs text-slate-400">Add name, email, and address</div>
                </div>
              </div>
              <span className="text-slate-400">→</span>
            </button>
          </div>

          {/* Beast mode */}
          <div className="mt-5 border border-[#F97316] rounded-xl p-4 flex items-center justify-between">
            <div className="text-sm">Ready to tackle it all?</div>
            <button className="text-xs bg-[#F97316] text-black font-semibold rounded-md px-3 py-1.5">Enter beast mode →</button>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
            <div className="text-sm mb-2">Approved Recipients ({approvedRecipients.length})</div>
            <ul className="text-xs text-slate-400 space-y-1 max-h-48 overflow-auto pr-1">
              {approvedRecipients.slice(0, 10).map(c => (
                <li key={c.id}>{c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}</li>
              ))}
            </ul>
          </div>

          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
            <div className="text-sm mb-2">In design ({inDesign.length})</div>
            <ul className="text-xs text-slate-400 space-y-1 max-h-48 overflow-auto pr-1">
              {inDesign.slice(0, 10).map(c => (
                <li key={c.id}>{c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}</li>
              ))}
            </ul>
          </div>

          <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
            <div className="text-sm mb-2">Fulfillment ({fulfillment.length})</div>
            <ul className="text-xs text-slate-400 space-y-1 max-h-48 overflow-auto pr-1">
              {fulfillment.slice(0, 10).map(c => (
                <li key={c.id}>{c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Create Recipient Modal */}
      <ContactModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreateSave}
        isLoading={isSaving}
        availableCreators={PREDEFINED_CONTACT_CREATORS}
      />
    </div>
  );
};

export default ReviewerDashboardPage;


