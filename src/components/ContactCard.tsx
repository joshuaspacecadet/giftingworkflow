import React, { useState } from 'react';
import { Edit, User, ExternalLink, Copy, Check, X, Info } from 'lucide-react';
import { Contact } from '../types';
import { openUrlSafely } from '../utils/urlHelpers';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';

interface ContactCardProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onUpdate: (contactId: string, updates: Partial<Contact>) => void | Promise<void>;
  isStageLocked?: boolean;
  previouslySent?: { magicCards: boolean; sfsBook: boolean; goldenRecord: boolean }; // deprecated
  currentProjectId?: string;
  onRemoveFromProject?: (contactId: string) => Promise<void> | void;
}

const ContactCard: React.FC<ContactCardProps> = ({ 
  contact, 
  onEdit, 
  onUpdate,
  isStageLocked = false,
  previouslySent,
  currentProjectId,
  onRemoveFromProject
}) => {
  const [showDetails] = useState(true);
  const [copiedConfirmUrl, setCopiedConfirmUrl] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [flagFeedback, setFlagFeedback] = useState("");
  const [flagError, setFlagError] = useState("");
  const [isConfirmClearFeedbackOpen, setIsConfirmClearFeedbackOpen] = useState(false);
  const [confirmClearNextStatus, setConfirmClearNextStatus] = useState<"Approve" | "Remove" | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isAddressRequiredModalOpen, setIsAddressRequiredModalOpen] = useState(false);
  const [companyInput, setCompanyInput] = useState(contact.company || "");
  const [headshotNew, setHeadshotNew] = useState<{ url: string; filename: string }[]>([]);
  const [logoNew, setLogoNew] = useState<{ url: string; filename: string }[]>([]);
  const [isUploadingHeadshot, setIsUploadingHeadshot] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<null | 'headshot' | 'logo'>(null);
  const [approveError, setApproveError] = useState<string>("");
  const [modalMagic, setModalMagic] = useState<boolean>(false);
  const [modalSfs, setModalSfs] = useState<boolean>(false);
  const [modalGr, setModalGr] = useState<boolean>(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [notesInput, setNotesInput] = useState<string>("");
  const [showItemsSelector, setShowItemsSelector] = useState<boolean>(false);
  const isMagicCards = (contact.magicCardsProjects || []).includes(currentProjectId || '');
  const isSfsBook = (contact.sfsBookProjects || []).includes(currentProjectId || '');
  const isGoldenRecord = (contact.goldenRecordProjects || []).includes(currentProjectId || '');
  // Effective requirement states used in modal styling
  const effectiveCompany = (contact.company && contact.company.trim().length>0) ? contact.company : companyInput;
  const isIndividual = (effectiveCompany || '').trim().toLowerCase() === 'individual (no company)';
  const hasAddress = !!contact.streetLine1;
  const hasCompanyEff = !!(effectiveCompany && effectiveCompany.trim().length>0);
  const hasHeadshotEff = (contact.headshot && contact.headshot.length>0) || headshotNew.length>0;
  const hasLogoEff = (contact.companyLogo && contact.companyLogo.length>0) || logoNew.length>0;

  console.log("Debug: ContactCard received contact:", contact);

  const handleImageClick = (imageUrl: string) => {
    openUrlSafely(imageUrl);
  };

  const handleLinkedInClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (contact.linkedinUrl) {
      openUrlSafely(contact.linkedinUrl);
    }
  };

  const handleCopyConfirmUrl = async () => {
    if (!contact.confirmAddressUrl) return;
    try {
      await navigator.clipboard.writeText(contact.confirmAddressUrl);
      setCopiedConfirmUrl(true);
      setTimeout(() => setCopiedConfirmUrl(false), 1500);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const formatAddress = (contact: Contact): string => {
    const addressParts = [];
    
    if (contact.streetLine1) addressParts.push(contact.streetLine1);
    if (contact.streetLine2) addressParts.push(contact.streetLine2);
    
    const cityStateZip = [];
    if (contact.city) cityStateZip.push(contact.city);
    if (contact.state) cityStateZip.push(contact.state);
    if (contact.postCode) cityStateZip.push(contact.postCode);
    
    if (cityStateZip.length > 0) {
      addressParts.push(cityStateZip.join(', '));
    }
    
    if (contact.countryCode) addressParts.push(contact.countryCode);
    
    return addressParts.join('\n');
  };

  // Details are always shown; no toggle

  return (
    <>
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-3 md:p-4 hover:shadow-md transition-shadow flex flex-col h-full relative">
      {/* Absolutized action buttons to avoid layout shift/overlap (delete removed) */}
      {!isStageLocked && (
        <div className="absolute top-2 right-2 flex space-x-1 z-10">
          <button
            onClick={() => onEdit(contact)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit contact"
          >
            <Edit className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-start mb-3 pr-10">
        <div className={`flex items-start ${isMagicCards ? 'space-x-3' : ''} flex-1`}>
          {isMagicCards ? (
            contact.headshot && contact.headshot.length > 0 ? (
            <img
              src={contact.headshot[0].url}
              alt={`${contact.name} headshot`}
              className="w-12 h-12 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setPreviewUrl(contact.headshot![0].url)}
            />
          ) : (
              <div className="w-12 h-12 rounded-full bg-red-100 border border-red-200 flex items-center justify-center">
                <User className="h-6 w-6 text-red-600" />
            </div>
            )
          ) : null}
          <div className="flex-1 min-w-0">
            <div className="flex items-center min-w-0">
            <h4 className="font-semibold text-slate-900 truncate">{contact.name}</h4>
              {isMagicCards && contact.linkedinUrl && (
                <button
                  onClick={handleLinkedInClick}
                  className="ml-2 text-slate-400 hover:text-blue-600"
                  title="Open LinkedIn profile"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
            </div>
            {contact.company && (isMagicCards || isSfsBook || isGoldenRecord) && (
              <div className="flex items-center text-sm text-slate-600 mt-1">
                {isMagicCards ? (
                  contact.companyLogo && contact.companyLogo.length > 0 ? (
                  <img
                    src={contact.companyLogo[0].url}
                    alt="Company logo"
                      className="h-4 w-4 mr-1 object-contain cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    onClick={() => handleImageClick(contact.companyLogo![0].url)}
                  />
                  ) : (
                    <div className="h-4 w-4 mr-1 flex items-center justify-center border border-red-600 rounded bg-red-50 text-red-600 text-[10px] leading-none flex-shrink-0">?</div>
                  )
                ) : null}
                <span className="truncate">{contact.company}</span>
              </div>
            )}
            
            {/* Display "Added by [Name]" if contactAddedBy has a value */}
            {contact.contactAddedBy && (
              <div className="flex items-center text-[11px] text-slate-500 mt-1">
                <span>Added by {contact.contactAddedBy}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1">
        {/* Missing Address now shown inline in address area below */}
              
        {/* Two-column layout: left items, right address */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="text-[11px] space-y-1 md:col-span-1">
            {(() => {
              const linked = {
                magicCards: contact.magicCardsProjects || [],
                sfsBook: contact.sfsBookProjects || [],
                goldenRecord: contact.goldenRecordProjects || [],
              };
              const thisProjectId = currentProjectId || '';
              const keys = [
                { key: 'magicCards' as const, label: 'Magic Cards' },
                { key: 'sfsBook' as const, label: 'SFS Book' },
                { key: 'goldenRecord' as const, label: 'Golden Record' },
              ];

              const canToggle = (k: 'magicCards'|'sfsBook'|'goldenRecord') => {
                const arr = linked[k];
                const selectedHere = arr.includes(thisProjectId);
                const neverSent = arr.length === 0;
                return selectedHere || neverSent;
              };

              const alreadySentItems = keys.filter(({ key }) => {
                const arr = linked[key];
                return arr.length > 0 && !arr.includes(thisProjectId);
              });

              return (
                <>
                  <div className="flex flex-col gap-1">
                    {keys.map((i) => {
                      const arr: string[] = linked[i.key];
                      const checked = arr.includes(thisProjectId);
                      if (canToggle(i.key)) {
                        return (
                          <label key={i.key} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={async (e) => {
                                const currentArr: string[] = (contact as any)[`${i.key}Projects`] || [];
                                const next = e.target.checked
                                  ? Array.from(new Set([...currentArr, thisProjectId])).filter(Boolean)
                                  : currentArr.filter((id) => id !== thisProjectId);
                                await onUpdate(contact.id, { [`${i.key}Projects`]: next } as any);
                              }}
                              disabled={isStageLocked || !thisProjectId}
                            />
                            <span>{i.label}</span>
                          </label>
                        );
                      }
                      return null;
                    })}
                  </div>

                  {alreadySentItems.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] font-medium text-slate-700 mb-1">Already sent</div>
                      <div className="flex flex-wrap gap-1.5">
                        {alreadySentItems.map((i) => (
                          <span key={i.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                            <Check className="h-3 w-3 text-green-600" /> {i.label}
                          </span>
                        ))}
                      </div>
                </div>
              )}
                </>
              );
            })()}
          </div>

          {/* Always-visible contact details (address + confirm URL) */}
          <div className="space-y-1.5 text-sm md:col-span-2">
              {/* Email and phone intentionally hidden */}

              {contact.streetLine1 ? (
                <div className="flex items-start text-slate-600">
                  <div className="text-xs whitespace-pre-line">
                    {formatAddress(contact)}
                    {contact.confirmAddressUrl && contact.streetLine1 && (
                      <button
                        onClick={handleCopyConfirmUrl}
                        className="ml-2 text-[11px] underline text-slate-500 hover:text-blue-600 transition-colors"
                        title={contact.confirmAddressUrl}
                      >
                        {copiedConfirmUrl ? 'Link copied' : 'Copy Confirm Link'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full flex justify-center" role="alert">
                  <div className="max-w-[260px] rounded-lg border border-red-300 bg-red-50 px-3 py-2 leading-tight text-center">
                    <div className="text-[12px] font-semibold text-red-700">Missing Address</div>
                    {contact.confirmAddressUrl && (
                  <button 
                        onClick={handleCopyConfirmUrl}
                        className="mt-1 inline-block text-[11px] underline text-red-600 hover:text-red-700"
                        title={contact.confirmAddressUrl}
                  >
                        {copiedConfirmUrl ? 'Link copied' : 'Copy Confirm Link'}
                  </button>
                    )}
                  </div>
                </div>
              )}

              {/* Removed LinkedIn Profile row; link icon near name handles this */}

          {/* Confirm link is rendered inline with the address above for compact layout */}
          </div>
        </div>

        {/* Special notes section (Magic Cards only) */}
        {isMagicCards && (
          <div className="mt-1">
            {contact.additionalContactContext ? (
                <div className="pt-2 border-t border-slate-200">
                  <div className="text-[11px] font-medium text-slate-700 mb-1">Special notes</div>
                  <p className="text-xs text-slate-600 italic whitespace-pre-line">
                    {contact.additionalContactContext}
                  </p>
                </div>
              ) : (
                <div className="pt-3">
                  <div className={`flex items-center justify-center gap-2 text-slate-600 mb-2 ${isStageLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                    <Edit className="h-3 w-3 flex-shrink-0" />
                    <button
                      onClick={() => { if (!isStageLocked) { setNotesInput(""); setIsNotesModalOpen(true); } }}
                      disabled={isStageLocked}
                      className={`hover:text-blue-600 transition-colors text-xs ${isStageLocked ? 'text-slate-400 cursor-not-allowed' : ''}`}
                    >
                      Add special notes
                    </button>
                    <span className="relative inline-flex items-center group">
                      <Info
                        className="h-3.5 w-3.5 text-slate-400 cursor-help"
                        tabIndex={0}
                        aria-label="Add notes about the recipient to help us tailor the copy on their Magic Card."
                      />
                      <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 transform z-50 hidden group-hover:block group-focus-within:block w-[120px] whitespace-normal break-words text-left rounded-md bg-slate-900/95 text-white text-[11px] leading-snug px-2.5 py-1.5 shadow-md">
                        Add notes about the recipient to help us tailor the copy on their Magic Card.
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>
        )}
      </div>

      {/* Contact Review Actions */}
      <div className={`mt-2 pt-2 border-t border-slate-200 flex items-center justify-center gap-2 ${isStageLocked ? 'opacity-60 pointer-events-none' : ''}` }>
        <button
          className={`px-2.5 py-1 text-xs rounded border transition-colors ${contact.contactReview === 'Approve' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
          onClick={() => {
            if (isStageLocked) return;
            // If Magic Cards is selected, enforce required assets
            // Prepare modal item state each time Approve is clicked
            setModalMagic(isMagicCards);
            setModalSfs(isSfsBook);
            setModalGr(isGoldenRecord);
            // Only initially show items selector if nothing is selected for this project
            setShowItemsSelector(!(isMagicCards || isSfsBook || isGoldenRecord));

            // Prevent Approve if no items selected for this project → open modal to select
            const anyItemSelected = isMagicCards || isSfsBook || isGoldenRecord;
            if (!anyItemSelected) {
              setCompanyInput(contact.company || "");
              setApproveError("");
              setHeadshotNew([]);
              setLogoNew([]);
              setShowItemsSelector(true);
              setIsApproveModalOpen(true);
              return;
            }

            if (isMagicCards) {
              const hasAddress = !!contact.streetLine1;
              const hasCompany = !!(contact.company && contact.company.trim().length > 0);
              const hasHeadshot = !!(contact.headshot && contact.headshot.length > 0);
              const hasLogo = !!(contact.companyLogo && contact.companyLogo.length > 0);
              if (!hasAddress || !hasCompany || !hasHeadshot || !hasLogo) {
                setCompanyInput(contact.company || "");
                setApproveError("");
                setHeadshotNew([]);
                setLogoNew([]);
                setShowItemsSelector(false);
                setIsApproveModalOpen(true);
                return;
              }
            }
            // If SFS Book and/or Golden Record are selected but no address, prompt for confirm address
            if (!isMagicCards && (isSfsBook || isGoldenRecord) && !contact.streetLine1) {
              setIsAddressRequiredModalOpen(true);
              return;
            }
            const hasFeedback = !!(contact.contactReviewFeedback && contact.contactReviewFeedback.trim().length > 0);
            if (hasFeedback) {
              setConfirmClearNextStatus('Approve');
              setIsConfirmClearFeedbackOpen(true);
            } else {
              onUpdate(contact.id, { contactReview: 'Approve', contactReviewFeedback: '' });
            }
          }}
          disabled={isStageLocked}
        >
          Approve
        </button>
        <button
          className={`px-2.5 py-1 text-xs rounded border transition-colors ${contact.contactReview === 'Send Later' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50'}`}
          onClick={() => {
            if (isStageLocked) return;
            setFlagFeedback(contact.contactReview === 'Send Later' ? (contact.contactReviewFeedback || '') : '');
            setFlagError("");
            setIsFlagModalOpen(true);
          }}
          disabled={isStageLocked}
        >
          Send Later
        </button>
        <button
          className={`px-2.5 py-1 text-xs rounded border transition-colors bg-white text-red-700 border-red-300 hover:bg-red-50`}
          onClick={() => {
            if (isStageLocked) return;
            setIsRemoveConfirmOpen(true);
          }}
          disabled={isStageLocked}
        >
          Remove
        </button>
      </div>

      {contact.contactReviewFeedback && contact.contactReviewFeedback.trim().length > 0 && (
        <div className="mt-2 text-xs text-slate-600 italic whitespace-pre-line text-center">
          {contact.contactReviewFeedback}
        </div>
      )}

      {/* Approve requirements modal (only when Magic Cards is selected) */}
      {isApproveModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsApproveModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Complete requirements to approve {contact.name}</h4>
              <button onClick={() => setIsApproveModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-600 mb-4">To print a Magic Card, we need the recipient’s address, company, headshot, and company logo.</p>

            {/* Items section: initially shown only if missing; remains visible after selection until modal closed */}
            {showItemsSelector && (
            <div className={`mb-4 p-3 rounded border ${!(modalMagic || modalSfs || modalGr) ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="text-sm font-medium text-slate-900 mb-2">Items to send</div>
              <div className="flex flex-col gap-2 text-sm">
                  {(() => {
                    const linked = {
                      magicCards: contact.magicCardsProjects || [],
                      sfsBook: contact.sfsBookProjects || [],
                      goldenRecord: contact.goldenRecordProjects || [],
                    };
                    const pid = currentProjectId || '';
                    const row = (
                      args: {
                        label: string;
                        selected: boolean;
                        setSelected: (v: boolean) => void;
                        arr: string[];
                      }
                    ) => {
                      const { label, selected, setSelected, arr } = args;
                      const selectedHere = arr.includes(pid);
                      const neverSent = arr.length === 0;
                      const disabled = !(selectedHere || neverSent);
                      const hint = arr.length > 0 && !selectedHere ? ' (already sent in another project)' : '';
                      return (
                        <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selected}
                            onChange={(e) => !disabled && setSelected(e.target.checked)}
                            disabled={disabled}
                          />
                          <span>
                            {label}
                            {hint && <span className="ml-1 text-[11px] text-slate-500">{hint}</span>}
                          </span>
                        </label>
                      );
                    };
                    return (
                      <>
                        {row({ label: 'Magic Cards', selected: modalMagic, setSelected: setModalMagic, arr: linked.magicCards })}
                        {row({ label: 'SFS Book', selected: modalSfs, setSelected: setModalSfs, arr: linked.sfsBook })}
                        {row({ label: 'Golden Record', selected: modalGr, setSelected: setModalGr, arr: linked.goldenRecord })}
                        {!(modalMagic || modalSfs || modalGr) && (
                          <div className="text-xs text-red-700 mt-1">Select at least one item to send for this project.</div>
                        )}
                      </>
                    );
                  })()}
              </div>
            </div>
            )}

            {/* Address section (only when missing in data; cannot be filled here) */}
            {!contact.streetLine1 && (
            <div className={`mb-4 p-3 rounded border ${hasAddress ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">Address</div>
                {!contact.streetLine1 && contact.confirmAddressUrl && (
                  <button
                    onClick={handleCopyConfirmUrl}
                    className="inline-flex items-center text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100"
                    title={copiedConfirmUrl ? 'Copied!' : 'Copy Confirm Address URL'}
                  >
                    {copiedConfirmUrl ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy confirm link
                  </button>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-700 whitespace-pre-line">
                <span className="text-red-700">Missing address — copy the link above and send it to the recipient to confirm their mailing address.</span>
              </div>
            </div>
            )}

            {/* Company section - style turns neutral when input provided */}
            {!(contact.company && contact.company.trim().length>0) && (
            <div className={`mb-4 p-3 rounded border ${hasCompanyEff ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-slate-900">Company</div>
                <button
                  type="button"
                  onClick={() => setCompanyInput("Individual (No Company)")}
                  className="text-[11px] underline text-slate-600 hover:text-blue-700"
                >
                  Use "Individual (No Company)"
                </button>
              </div>
              <input
                type="text"
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter company name"
              />
            </div>
            )}

            {/* Headshot section - neutral when a headshot is added in-session */}
            {!(contact.headshot && contact.headshot.length>0) && (
            <div className={`mb-4 p-3 rounded border ${hasHeadshotEff ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
              <div className="text-sm font-medium text-slate-900 mb-2">Headshot</div>
              <p className="text-xs text-slate-600 mb-2">Please add one or more photos. Adding a few gives the designer more options to generate a strong image for the card.</p>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragOverTarget==='headshot' ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'} ${isUploadingHeadshot ? 'opacity-50 pointer-events-none' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget('headshot'); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOverTarget(null); }}
                onDrop={async (e) => { e.preventDefault(); setDragOverTarget(null); const files = Array.from(e.dataTransfer.files || []); if (!files.length) return; setIsUploadingHeadshot(true); const uploaded: { url: string; filename: string }[] = []; for (const f of files) { const url = await uploadToCloudinary(f); uploaded.push({ url, filename: f.name }); } setHeadshotNew((prev) => [...prev, ...uploaded]); setIsUploadingHeadshot(false); }}
              >
                <input id="approve-headshot" className="hidden" type="file" multiple accept="image/*" onChange={async (e) => { if (!e.target.files) return; setIsUploadingHeadshot(true); const files = Array.from(e.target.files); const uploaded=[] as {url:string; filename:string}[]; for (const f of files){ const url = await uploadToCloudinary(f); uploaded.push({url, filename: f.name}); } setHeadshotNew((p)=>[...p,...uploaded]); setIsUploadingHeadshot(false); e.target.value=''; }} />
                <label htmlFor="approve-headshot" className="inline-flex items-center px-3 py-2 rounded bg-blue-600 text-white text-xs cursor-pointer hover:bg-blue-700">{isUploadingHeadshot ? 'Uploading...' : 'Choose File(s)'}</label>
              </div>
              {(contact.headshot && contact.headshot.length>0) || headshotNew.length>0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(contact.headshot||[]).map((h,idx)=>(<img key={`eh${idx}`} src={h.url} alt={h.filename} className="w-full h-20 object-cover rounded border" />))}
                  {headshotNew.map((h,idx)=>(<img key={`nh${idx}`} src={h.url} alt={h.filename} className="w-full h-20 object-cover rounded border" />))}
                </div>
              ) : null}
            </div>
            )}

            {/* Company logo section - neutral once a logo is added; hidden if Individual (No Company) */}
            {(!isIndividual) && !(contact.companyLogo && contact.companyLogo.length>0) && (
            <div className={`mb-4 p-3 rounded border ${hasLogoEff ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
              <div className="text-sm font-medium text-slate-900 mb-2">Company Logo</div>
              <p className="text-xs text-slate-600 mb-2">Please add one or more logo images. Make sure the logo matches the company name.</p>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragOverTarget==='logo' ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'} ${isUploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget('logo'); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOverTarget(null); }}
                onDrop={async (e) => { e.preventDefault(); setDragOverTarget(null); const files = Array.from(e.dataTransfer.files || []); if (!files.length) return; setIsUploadingLogo(true); const uploaded: { url: string; filename: string }[] = []; for (const f of files) { const url = await uploadToCloudinary(f); uploaded.push({ url, filename: f.name }); } setLogoNew((prev) => [...prev, ...uploaded]); setIsUploadingLogo(false); }}
              >
                <input id="approve-logo" className="hidden" type="file" multiple accept="image/*" onChange={async (e) => { if (!e.target.files) return; setIsUploadingLogo(true); const files = Array.from(e.target.files); const uploaded=[] as {url:string; filename:string}[]; for (const f of files){ const url = await uploadToCloudinary(f); uploaded.push({url, filename: f.name}); } setLogoNew((p)=>[...p,...uploaded]); setIsUploadingLogo(false); e.target.value=''; }} />
                <label htmlFor="approve-logo" className="inline-flex items-center px-3 py-2 rounded bg-blue-600 text-white text-xs cursor-pointer hover:bg-blue-700">{isUploadingLogo ? 'Uploading...' : 'Choose File(s)'}</label>
              </div>
              {(contact.companyLogo && contact.companyLogo.length>0) || logoNew.length>0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(contact.companyLogo||[]).map((h,idx)=>(<img key={`el${idx}`} src={h.url} alt={h.filename} className="w-full h-20 object-cover rounded border" />))}
                  {logoNew.map((h,idx)=>(<img key={`nl${idx}`} src={h.url} alt={h.filename} className="w-full h-20 object-cover rounded border" />))}
                </div>
              ) : null}
            </div>
            )}

            {approveError && <div className="text-xs text-red-600 mb-2">{approveError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsApproveModalOpen(false)} className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Close</button>
              <button
                onClick={async () => {
                  // Save progress without approving
                  const pid = currentProjectId || '';
                  const updates: Partial<Contact> = { company: companyInput } as Partial<Contact>;
                  // Persist item selections for this project
                  const mcArr = (contact.magicCardsProjects || []);
                  const sfsArr = (contact.sfsBookProjects || []);
                  const grArr = (contact.goldenRecordProjects || []);
                  (updates as any).magicCardsProjects = modalMagic ? Array.from(new Set([...mcArr, pid])).filter(Boolean) : mcArr.filter(id => id !== pid);
                  (updates as any).sfsBookProjects = modalSfs ? Array.from(new Set([...sfsArr, pid])).filter(Boolean) : sfsArr.filter(id => id !== pid);
                  (updates as any).goldenRecordProjects = modalGr ? Array.from(new Set([...grArr, pid])).filter(Boolean) : grArr.filter(id => id !== pid);
                  if (headshotNew.length > 0) {
                    (updates as any).headshot = [
                      ...(contact.headshot || []),
                      ...headshotNew,
                    ] as any;
                  }
                  if (logoNew.length > 0) {
                    (updates as any).companyLogo = [
                      ...(contact.companyLogo || []),
                      ...logoNew,
                    ] as any;
                  }
                  if (
                    updates.company !== contact.company ||
                    (updates as any).headshot ||
                    (updates as any).companyLogo ||
                    (updates as any).magicCardsProjects ||
                    (updates as any).sfsBookProjects ||
                    (updates as any).goldenRecordProjects
                  ) {
                    await onUpdate(contact.id, updates);
                    setHeadshotNew([]);
                    setLogoNew([]);
                  }
                }}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Save
              </button>
              <button
                onClick={async () => {
                  // Validate
                  const pid = currentProjectId || '';
                  const anySelected = modalMagic || modalSfs || modalGr;
                  if (!anySelected) {
                    setApproveError('Select at least one item for this project before approving.');
                    return;
                  }
                  const hasAddress = !!contact.streetLine1;
                  const effectiveCompany = (contact.company && contact.company.trim().length>0)
                    ? contact.company
                    : companyInput.trim();
                  const isIndividual = (effectiveCompany || "").toLowerCase() === 'individual (no company)';
                  const hasCompany = !!effectiveCompany;
                  const hasHeadshot = (contact.headshot && contact.headshot.length>0) || headshotNew.length>0;
                  const hasLogo = (contact.companyLogo && contact.companyLogo.length>0) || logoNew.length>0;
                  if (modalMagic) {
                    if (!hasAddress || !hasCompany || !hasHeadshot || (!isIndividual && !hasLogo)) {
                      setApproveError('All items are required to approve for Magic Cards.');
                      return;
                    }
                  } else if ((modalSfs || modalGr) && !hasAddress) {
                    setIsAddressRequiredModalOpen(true);
                    return;
                  }
                  // Save uploads/changes then approve
                  const updates: Partial<Contact> = { company: companyInput } as Partial<Contact>;
                  // Persist item selections for this project
                  const mcArr = (contact.magicCardsProjects || []);
                  const sfsArr = (contact.sfsBookProjects || []);
                  const grArr = (contact.goldenRecordProjects || []);
                  (updates as any).magicCardsProjects = modalMagic ? Array.from(new Set([...mcArr, pid])).filter(Boolean) : mcArr.filter(id => id !== pid);
                  (updates as any).sfsBookProjects = modalSfs ? Array.from(new Set([...sfsArr, pid])).filter(Boolean) : sfsArr.filter(id => id !== pid);
                  (updates as any).goldenRecordProjects = modalGr ? Array.from(new Set([...grArr, pid])).filter(Boolean) : grArr.filter(id => id !== pid);
                  if (headshotNew.length>0) {
                    (updates as any).headshot = [...(contact.headshot||[]), ...headshotNew] as any;
                  }
                  if (logoNew.length>0) {
                    (updates as any).companyLogo = [...(contact.companyLogo||[]), ...logoNew] as any;
                  }
                  await onUpdate(contact.id, updates);
                  const hasFeedback = !!(contact.contactReviewFeedback && contact.contactReviewFeedback.trim().length > 0);
                  if (hasFeedback) {
                    setConfirmClearNextStatus('Approve');
                    setIsConfirmClearFeedbackOpen(true);
                  } else {
                    await onUpdate(contact.id, { contactReview: 'Approve', contactReviewFeedback: '' });
                  }
                  setIsApproveModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700"
              >
                Save & Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Address required modal for SFS Book / Golden Record */}
      {isAddressRequiredModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsAddressRequiredModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">We need an address to approve {contact.name}</h4>
              <button onClick={() => setIsAddressRequiredModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className={`mb-2 p-3 rounded border border-red-200 bg-red-50`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">Address</div>
                {contact.confirmAddressUrl && (
                  <button
                    onClick={handleCopyConfirmUrl}
                    className="inline-flex items-center text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100"
                    title={copiedConfirmUrl ? 'Copied!' : 'Copy Confirm Address URL'}
                  >
                    {copiedConfirmUrl ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy confirm link
                  </button>
                )}
              </div>
              <div className="mt-2 text-xs text-red-700">Missing address — copy the link above and send it to the recipient to confirm their mailing address.</div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setIsAddressRequiredModalOpen(false)} className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Feedback Modal */}
      {isFlagModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsFlagModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Provide feedback (optional)</h4>
              <button
                onClick={() => setIsFlagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-3">Why are you holding on sending to this contact? For example: Is this the wrong person and you want to share the right LinkedIn? Are they not responding to address requests? Or do you just want to hold off for now?</p>
            <textarea
              value={flagFeedback}
              onChange={(e) => setFlagFeedback(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
              placeholder="Write feedback..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsFlagModalOpen(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdate(contact.id, { contactReview: 'Send Later', contactReviewFeedback: flagFeedback.trim() });
                  setIsFlagModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded bg-yellow-600 text-white hover:bg-yellow-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear feedback for Remove/Approve */}
      {isConfirmClearFeedbackOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsConfirmClearFeedbackOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Delete saved feedback?</h4>
              <button
                onClick={() => setIsConfirmClearFeedbackOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">Switching to “{confirmClearNextStatus ?? 'this status'}” will remove the saved feedback on this contact. Are you sure?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsConfirmClearFeedbackOpen(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const next = confirmClearNextStatus || 'Approve';
                  onUpdate(contact.id, { contactReview: next, contactReviewFeedback: '' });
                  setIsConfirmClearFeedbackOpen(false);
                  setConfirmClearNextStatus(null);
                }}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Yes, continue
              </button>
            </div>
          </div>
            </div>
          )}

      {/* Remove from Project Confirm Modal */}
      {isRemoveConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsRemoveConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Remove from current project?</h4>
              <button onClick={() => setIsRemoveConfirmOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-600 mb-4">This will unlink {contact.name} from this project but keep their contact record. You can always add them back later.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsRemoveConfirmOpen(false)} className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await (onRemoveFromProject?.(contact.id));
                  } finally {
                    setIsRemoveConfirmOpen(false);
                  }
                }}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add notes modal */}
      {isNotesModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsNotesModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Add special notes</h4>
              <button onClick={() => setIsNotesModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-600 mb-3">Help us make the Magic Card copy extra special by adding details (e.g. loves to surf, lives bi-coastal, training for a marathon, amazing growth marketer).</p>
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
              placeholder="Enter special notes..."
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsNotesModalOpen(false)} className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                onClick={async () => {
                  await onUpdate(contact.id, { additionalContactContext: notesInput.trim() });
                  setIsNotesModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No toggle; details are always shown */}
    </div>
    </>
  );
};

export default ContactCard;