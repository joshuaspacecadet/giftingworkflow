import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AirtableService } from '../services/airtable';
import { Contact, Project, SpecificStage } from '../types';
import { PREDEFINED_CONTACT_CREATORS } from '../config/airtable';
import { Loader2, FileText } from 'lucide-react';
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

  // Pipeline datasets
  const approvedRecipients = filtered.filter(c => c.specificStage === 'Approved to receive gift');
  const inDesign = filtered.filter(c => !!c.specificStage && IN_DESIGN_STAGES.includes(c.specificStage));
  const fulfillment = filtered.filter(c => c.specificStage === 'Fulfillment' || c.specificStage === 'Shipped');

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Designs ready for review */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
              <div className="text-sm text-slate-300 mb-2">
                <span className="font-semibold">{designsReady.length}</span> Magic Card designs ready for your review.
              </div>
              {designPreviewAttachments.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  {designPreviewAttachments.map((a, idx) => {
                    const isImage = (a.type || '').startsWith('image/');
                    return isImage ? (
                      <img
                        key={a.id || `${a.url}-${idx}`}
                        src={a.url}
                        alt={a.filename || `Design ${idx + 1}`}
                        className="h-16 w-12 object-cover rounded-md border border-[#27282B]"
                      />
                    ) : (
                      <a
                        key={a.id || `${a.url}-${idx}`}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        title={a.filename || 'Design file'}
                      >
                        <div className="h-16 w-12 rounded-md border border-[#27282B] bg-[#141518] flex flex-col items-center justify-center text-slate-300">
                          <FileText className="h-4 w-4 mb-0.5" />
                          <span className="text-[10px] leading-none">PDF</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
              <div className="mt-3">
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Open review →</button>
              </div>
            </div>

            {/* Missing address */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
              <div className="text-sm text-slate-300 mb-2">
                <span className="font-semibold">{designApprovedMissingAddress.length}</span> people are ready to receive their gift, but are missing an address.
              </div>
              <ul className="text-xs text-slate-400 space-y-1">
                {designApprovedMissingAddress.slice(0, 5).map(c => (
                  <li key={c.id}>{`${c.name || 'Unnamed'}${c.company ? `, ${c.company}` : ''}`}</li>
                ))}
                {designApprovedMissingAddress.length > 5 && (
                  <li className="italic text-slate-500">and {designApprovedMissingAddress.length - 5} more...</li>
                )}
              </ul>
              <div className="mt-3">
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Start address requests →</button>
              </div>
            </div>

            {/* Review to receive gift */}
            <div className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4">
              <div className="text-sm text-slate-300 mb-2">
                <span className="font-semibold">{reviewToReceiveGift.length}</span> contacts you might want to send a gift to.
              </div>
              <ul className="text-xs text-slate-400 space-y-1">
                {reviewToReceiveGift.slice(0, 5).map(c => (
                  <li key={c.id}>{`${c.name || 'Unnamed'}${c.company ? `, ${c.company}` : ''}`}</li>
                ))}
                {reviewToReceiveGift.length > 5 && (
                  <li className="italic text-slate-500">and {reviewToReceiveGift.length - 5} more...</li>
                )}
              </ul>
              <div className="mt-3">
                <button className="text-xs bg-white text-black rounded-md px-3 py-1.5">Review contacts →</button>
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <button onClick={handleOpenAddExisting} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div>
                <div className="text-sm">Add recipient from a past shipment</div>
                <div className="text-xs text-slate-400">Send the recipient something else</div>
              </div>
              <span className="text-slate-400">→</span>
            </button>

            <button onClick={() => setIsCreateOpen(true)} className="bg-[#0F1012] rounded-xl border border-[#27282B] p-4 text-left flex items-center justify-between">
              <div>
                <div className="text-sm">Create a new recipient</div>
                <div className="text-xs text-slate-400">Add name, email, and address</div>
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
        <h3 className="text-sm text-slate-300 mb-3">Production Pipeline ({filtered.length})</h3>
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


