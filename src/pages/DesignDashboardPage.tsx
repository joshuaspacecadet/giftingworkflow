import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, User, ThumbsUp, Linkedin, Info, Download } from 'lucide-react';
import { AirtableService } from '../services/airtable';
import { Contact, SpecificStage } from '../types';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';
import ContactModal from '../components/ContactModal';
import { PREDEFINED_CONTACT_CREATORS } from '../config/airtable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const DesignDashboardPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [uploadingById, setUploadingById] = useState<Record<string, boolean>>({});
  const [successById, setSuccessById] = useState<Record<string, boolean>>({});
  const [errById, setErrById] = useState<Record<string, string>>({});
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const all = await AirtableService.getContacts();
        if (!mounted) return;
        setContacts(all);
      } catch (e) {
        if (!mounted) return;
        setError('Failed to load contacts.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const approvedRecipients = useMemo(() => {
    return contacts.filter(c => (c.specificStage as SpecificStage) === 'Approved to receive gift');
  }, [contacts]);

  const inDesignNoFile = useMemo(() => {
    return contacts.filter(c => (c.specificStage as SpecificStage) === 'In design' && (!c.designFiles || c.designFiles.length === 0));
  }, [contacts]);

  const designRejected = useMemo(() => {
    return contacts.filter(c => (c.specificStage as SpecificStage) === 'Design rejected');
  }, [contacts]);

  const handleContactSave = async (updatedData: Partial<Contact>) => {
    setIsSavingContact(true);
    try {
      const contactId = (updatedData as any).id;
      const updated = await AirtableService.updateContact(contactId, updatedData);
      if (updated) {
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        setIsContactModalOpen(false);
        setSelectedContact(null);
      }
      return updated;
    } catch (e) {
      console.error('Failed to save contact assets', e);
      return null;
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleReadyForDesign = async (contactId: string) => {
    setUploadingById(prev => ({ ...prev, [contactId]: true }));
    try {
      const updated = await AirtableService.updateContact(contactId, {
        specificStage: 'In design' as SpecificStage,
      } as any);
      if (updated) {
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
    } catch (e) {
      console.error('Failed to move to In Design', e);
    } finally {
      setUploadingById(prev => ({ ...prev, [contactId]: false }));
    }
  };

  const handleReadyForReview = async (contactId: string) => {
    setUploadingById(prev => ({ ...prev, [contactId]: true }));
    try {
      const updated = await AirtableService.updateContact(contactId, {
        specificStage: 'Design review' as SpecificStage,
      } as any);
      if (updated) {
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
    } catch (e) {
      console.error('Failed to move to Design review', e);
    } finally {
      setUploadingById(prev => ({ ...prev, [contactId]: false }));
    }
  };

  const [isDownloadingById, setIsDownloadingById] = useState<Record<string, boolean>>({});

  const handleDownloadAssets = async (contact: Contact) => {
    setIsDownloadingById(prev => ({ ...prev, [contact.id]: true }));
    try {
      const zip = new JSZip();
      const folderName = contact.name ? contact.name.trim() : 'Assets';
      const folder = zip.folder(folderName);
      
      const assets = [
        ...(contact.headshot || []).map(f => ({ ...f, type: 'headshot' })),
        ...(contact.companyLogo || []).map(f => ({ ...f, type: 'logo' }))
      ];

      if (assets.length === 0) {
        throw new Error('No assets to download');
      }

      if (!folder) throw new Error('Failed to create folder');

      await Promise.all(assets.map(async (asset, idx) => {
        try {
          // Fetch blob via proxy or CORS-enabled URL
          const response = await fetch(asset.url, { mode: 'cors', cache: 'no-cache' });
          const blob = await response.blob();
          const ext = asset.filename.split('.').pop() || 'jpg';
          // Name format: Name_Type_Index.ext or original filename
          const filename = `${contact.name?.replace(/\s+/g, '_') || 'Asset'}_${asset.type}_${idx + 1}.${ext}`;
          folder.file(filename, blob);
        } catch (e) {
          console.error('Failed to fetch asset', asset.url, e);
        }
      }));

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    } catch (e) {
      console.error('Download failed', e);
      alert('Failed to download assets. They might be missing or inaccessible.');
    } finally {
      setIsDownloadingById(prev => ({ ...prev, [contact.id]: false }));
    }
  };

  const handleUploadFor = async (contact: Contact, file: File) => {
    setErrById(prev => ({ ...prev, [contact.id]: '' }));
    setSuccessById(prev => ({ ...prev, [contact.id]: false }));
    setUploadingById(prev => ({ ...prev, [contact.id]: true }));
    try {
      const url = await uploadToCloudinary(file);
      const attachment = [{ url, filename: file.name }];
      const isRejected = (contact.specificStage as SpecificStage) === 'Design rejected';
      const updates: Partial<Contact> = {
        designFiles: attachment as any,
        latestDesignDate: new Date().toISOString(),
        specificStage: 'Design review' as SpecificStage,
        ...(isRejected ? { latestDesignFeedback: '' } : {})
      } as Partial<Contact>;
      const updated = await AirtableService.updateContact(contact.id, updates);
      if (updated) {
        setContacts(prev => prev.map(c => c.id === contact.id ? updated : c));
        setSuccessById(prev => ({ ...prev, [contact.id]: true }));
      } else {
        throw new Error('Save failed');
      }
    } catch (e: any) {
      setErrById(prev => ({ ...prev, [contact.id]: e?.message || 'Upload failed' }));
    } finally {
      setUploadingById(prev => ({ ...prev, [contact.id]: false }));
    }
  };

  const renderUploadCard = (c: Contact, opts?: { showFeedback?: boolean }) => {
    const uploading = !!uploadingById[c.id];
    const downloading = !!isDownloadingById[c.id];
    const success = !!successById[c.id];
    const err = errById[c.id];
    const headshot = (c.headshot || [])[0];
    const logo = (c.companyLogo || [])[0];
    const hasAssets = (c.headshot && c.headshot.length > 0) || (c.companyLogo && c.companyLogo.length > 0);

    return (
      <div key={c.id} className="border border-slate-700/60 rounded-lg p-4 bg-[#121214]">
        <div className="flex items-start gap-4">
          {/* Left: Contact Info */}
          <div className="min-w-0 flex-[2]">
            <div className="font-medium text-slate-100 truncate text-base">{c.name || 'Unnamed'}</div>
            {c.company && <div className="text-sm text-slate-400 truncate">{c.company}</div>}
            
            <div className="mt-1">
              {c.linkedinUrl && (
                <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 w-fit">
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </a>
              )}
            </div>
            
            {c.additionalContactContext && (
              <div className="mt-3 text-xs text-slate-400 bg-slate-800/50 p-2 rounded border border-slate-700/50">
                <div className="flex items-center gap-1.5 mb-1 text-slate-300">
                  <Info className="h-3 w-3" /> <span className="font-medium">Context</span>
                </div>
                {c.additionalContactContext}
              </div>
            )}

            {opts?.showFeedback && (c.latestDesignFeedback ? (
              <div className="mt-3 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="font-semibold">Latest feedback</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-slate-300">{c.latestDesignFeedback}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-400">No feedback on record.</div>
            ))}
          </div>

          {/* Middle: Download Assets */}
          <div className="flex items-center justify-center flex-1 border-l border-r border-slate-800/50 px-4">
            {hasAssets ? (
              <button
                onClick={() => handleDownloadAssets(c)}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-sm"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span>Download assets</span>
              </button>
            ) : (
              <div className="text-xs text-slate-500">No assets available</div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="shrink-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${uploading ? 'border-slate-700 text-slate-400 opacity-60 cursor-not-allowed' : 'border-slate-600 text-slate-100 hover:bg-slate-800 cursor-pointer'}`}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? 'Uploading…' : 'Upload Design'}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadFor(c, file);
                  }}
                  disabled={uploading}
                />
              </label>
              <button
                onClick={() => handleReadyForReview(c.id)}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-sm disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4" />
                <span>Ready for Review</span>
              </button>
            </div>
            
            {success && (
              <div className="flex items-center gap-1 text-emerald-400 text-sm mt-1 justify-end">
                <CheckCircle2 className="h-4 w-4" />
                <span>Saved</span>
              </div>
            )}
            {err && (
              <div className="text-rose-400 text-sm mt-1 text-right">{err}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-slate-200">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-[#0B0B0C]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-orange-400" />
            <h1 className="text-lg font-semibold">Design Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading…</span>
          </div>
        ) : error ? (
          <div className="text-rose-400">{error}</div>
        ) : (
          <>
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-100">Add Assets for New Approved Recipients</h2>
                <span className="text-sm text-slate-400">{approvedRecipients.length}</span>
              </div>
              {approvedRecipients.length === 0 ? (
                <div className="text-sm text-slate-400">No approved recipients pending assets.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {approvedRecipients.map(c => (
                    <div key={c.id} className="border border-slate-700/60 rounded-lg p-4 bg-[#121214]">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100 truncate">{c.name || 'Unnamed'}{c.company ? `, ${c.company}` : ''}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            Set to receive: {((c.draftOrderItems || []).length > 0 ? (c.draftOrderItems || []).join(', ') : 'Nothing selected')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => { setSelectedContact(c); setIsContactModalOpen(true); }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-600 text-slate-100 hover:bg-slate-800 text-sm"
                          >
                            <User className="h-4 w-4" />
                            <span>Add Assets</span>
                          </button>
                          <button
                            onClick={() => handleReadyForDesign(c.id)}
                            disabled={!!uploadingById[c.id]}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-sm disabled:opacity-50"
                          >
                            {uploadingById[c.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                            <span>Ready for Design</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-100">Start New Designs</h2>
                <span className="text-sm text-slate-400">{inDesignNoFile.length}</span>
              </div>
              {inDesignNoFile.length === 0 ? (
                <div className="text-sm text-slate-400">Nothing to start.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {inDesignNoFile.map(c => renderUploadCard(c))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-100">Revise Rejected Designs</h2>
                <span className="text-sm text-slate-400">{designRejected.length}</span>
              </div>
              {designRejected.length === 0 ? (
                <div className="text-sm text-slate-400">No rejected designs pending.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {designRejected.map(c => renderUploadCard(c, { showFeedback: true }))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => { setIsContactModalOpen(false); setSelectedContact(null); }}
        onSave={handleContactSave}
        isLoading={isSavingContact}
        availableCreators={PREDEFINED_CONTACT_CREATORS}
        contact={selectedContact || undefined}
      />
    </div>
  );
};

export default DesignDashboardPage;


