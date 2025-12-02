import React, { useState, useEffect } from 'react';
import { Loader2, Download, ThumbsUp, RefreshCw, Trash2, AlertTriangle, Linkedin, Info, FileText, Save, Check, Edit3 } from 'lucide-react';
import { Contact } from '../types';
import { AirtableService } from '../services/airtable';
import PdfThumbnail from './PdfThumbnail';

interface DesignRevisionCardProps {
  contact: Contact;
  onUpdate: (updated: Contact) => void;
  onDownloadAssets: (contact: Contact) => void;
  onReadyForReview: (contactId: string) => void;
  onDeleteDesign: (contactId: string) => void;
  onUploadFile: (file: File) => void;
  onPreview: (url: string, type: 'pdf' | 'image') => void;
  isUploading: boolean;
  isDownloading: boolean;
  isDeleting: boolean;
  uploadError?: string;
}

const DesignRevisionCard: React.FC<DesignRevisionCardProps> = ({
  contact,
  onUpdate,
  onDownloadAssets,
  onReadyForReview,
  onDeleteDesign,
  onUploadFile,
  onPreview,
  isUploading,
  isDownloading,
  isDeleting,
  uploadError
}) => {
  const [dragging, setDragging] = useState(false);
  const [copyFormData, setCopyFormData] = useState({
    headline: contact.headline || '',
    subheadline: contact.subheadline || '',
    flavorText: contact.flavorText || ''
  });
  const [isSavingCopy, setIsSavingCopy] = useState(false);
  const [copyHasChanges, setCopyHasChanges] = useState(false);

  useEffect(() => {
    setCopyFormData({
      headline: contact.headline || '',
      subheadline: contact.subheadline || '',
      flavorText: contact.flavorText || ''
    });
    setCopyHasChanges(false);
  }, [contact]);

  const handleCopyChange = (field: string, value: string) => {
    setCopyFormData(prev => ({ ...prev, [field]: value }));
    setCopyHasChanges(true);
  };

  const handleSaveCopy = async () => {
    setIsSavingCopy(true);
    try {
      const updated = await AirtableService.updateContact(contact.id, copyFormData);
      if (updated) {
        onUpdate(updated);
        setCopyHasChanges(false);
      }
    } catch (error) {
      console.error('Error saving copy:', error);
    } finally {
      setIsSavingCopy(false);
    }
  };

  const handleRequestNewCopy = async () => {
    try {
      const updated = await AirtableService.updateContact(contact.id, { copyStatus: 'New copy needed' });
      if (updated) {
        onUpdate(updated);
      }
    } catch (error) {
      console.error('Error requesting new copy:', error);
    }
  };

  const handleNewCopyDone = async () => {
    // Save any pending changes first
    if (copyHasChanges) {
       await handleSaveCopy();
    }
    
    try {
      const updated = await AirtableService.updateContact(contact.id, { copyStatus: 'New copy done' });
      if (updated) {
        onUpdate(updated);
      }
    } catch (error) {
      console.error('Error marking copy as done:', error);
    }
  };

  const handleReadyForReviewInternal = async () => {
    try {
      // If copy was updated, we want to clear these fields upon submission for review
      // so they don't persist if rejected again unless they are part of the "approved" state?
      // The requirement says "clear the headline, subheadline, and flavor text, as well as the copy status"
      
      // We first update the contact to clear these fields
      await AirtableService.updateContact(contact.id, {
        headline: '',
        subheadline: '',
        flavorText: '',
        copyStatus: undefined // or null/empty string depending on Airtable
      } as any);
      
      // Then proceed with the parent's onReadyForReview which moves stage
      onReadyForReview(contact.id);
    } catch (e) {
      console.error('Failed to clear copy fields before review', e);
      // Attempt to proceed anyway? 
      onReadyForReview(contact.id);
    }
  };

  const hasAssets = (contact.headshot && contact.headshot.length > 0) || (contact.companyLogo && contact.companyLogo.length > 0);
  const existingDesign = (contact.designFiles || [])[0];
  const designUrl = typeof existingDesign === 'string' ? existingDesign : existingDesign?.url;
  const designFilename = typeof existingDesign === 'string' ? 'Design File' : existingDesign?.filename || 'Design File';
  const isPdfDesign = designUrl ? /\.pdf($|\?)/i.test(designUrl) : false;

  const isCopyNeeded = contact.copyStatus === 'New copy needed';

  return (
    <div className="border border-slate-700/60 rounded-lg p-4 bg-[#121214]">
      <div className="flex items-start gap-4">
        {/* Left: Contact Info & Copy Editor */}
        <div className="min-w-0 flex-[2]">
          <div className="font-medium text-slate-100 truncate text-base">{contact.name || 'Unnamed'}</div>
          {contact.company && <div className="text-sm text-slate-400 truncate">{contact.company}</div>}
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">
            {contact.contactAddedBy ? `${contact.contactAddedBy}'s contact` : 'Contact owner unknown'}
          </div>
          
          <div className="mt-1">
            {contact.linkedinUrl && (
              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 w-fit">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            )}
          </div>
          
          {contact.additionalContactContext && (
            <div className="mt-3 text-xs text-slate-400 bg-slate-800/50 p-2 rounded border border-slate-700/50">
              <div className="flex items-center gap-1.5 mb-1 text-slate-300">
                <Info className="h-3 w-3" /> <span className="font-medium">Context</span>
              </div>
              {contact.additionalContactContext}
            </div>
          )}

          {contact.latestDesignFeedback ? (
            <div className="mt-3 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="font-semibold">Latest feedback</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-slate-300">{contact.latestDesignFeedback}</div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">No feedback on record.</div>
          )}

          {/* Copy Section */}
          {(isCopyNeeded || contact.copyStatus === 'New copy done') && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {contact.copyStatus === 'New copy done' ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="font-semibold text-slate-200">Copy has been updated</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 text-purple-400" />
                      <span className="font-semibold text-slate-200">Please add updated copy below</span>
                    </>
                  )}
                </div>
                {!isCopyNeeded && contact.copyStatus !== 'New copy done' && (
                  <button
                    onClick={handleRequestNewCopy}
                    className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <Edit3 className="h-3 w-3" />
                    Request Copy Changes
                  </button>
                )}
                {contact.copyStatus === 'New copy done' && (
                   <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <button 
                          onClick={handleRequestNewCopy} 
                          className="ml-2 text-slate-500 hover:text-slate-300 underline"
                      >
                          Edit
                      </button>
                   </span>
                )}
              </div>

              {isCopyNeeded ? (
                <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-purple-900/30">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Headline</label>
                    <input
                      type="text"
                      value={copyFormData.headline}
                      onChange={(e) => handleCopyChange('headline', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                      placeholder="Headline text..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Subheadline</label>
                    <input
                      type="text"
                      value={copyFormData.subheadline}
                      onChange={(e) => handleCopyChange('subheadline', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                       placeholder="Subheadline text..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Flavor Text</label>
                    <textarea
                      value={copyFormData.flavorText}
                      onChange={(e) => handleCopyChange('flavorText', e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                       placeholder="Flavor text..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    {copyHasChanges && (
                      <button
                          onClick={handleSaveCopy}
                          disabled={isSavingCopy}
                          className="text-xs px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 flex items-center gap-1"
                      >
                          {isSavingCopy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          <span>Save Draft</span>
                      </button>
                    )}
                    <button
                      onClick={handleNewCopyDone}
                      className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-500 flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      New Copy Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm text-slate-400 pl-6 border-l-2 border-slate-800">
                   {contact.headline && <div><span className="text-slate-500 text-xs uppercase mr-2">Headline:</span> <span className="text-slate-300">{contact.headline}</span></div>}
                   {contact.subheadline && <div><span className="text-slate-500 text-xs uppercase mr-2">Subhead:</span> <span className="text-slate-300">{contact.subheadline}</span></div>}
                   {contact.flavorText && <div><span className="text-slate-500 text-xs uppercase mr-2">Flavor:</span> <span className="text-slate-300">{contact.flavorText}</span></div>}
                </div>
              )}
            </div>
          )}

          {/* Request Copy Changes Button when section is hidden */}
          {!isCopyNeeded && contact.copyStatus !== 'New copy done' && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleRequestNewCopy}
                className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Edit3 className="h-3 w-3" />
                Request Copy Changes
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="shrink-0 flex flex-col gap-3 min-w-[260px]">
            <UploadZone 
             isUploading={isUploading}
             isDeleting={isDeleting}
             designUrl={designUrl}
             designFilename={designFilename}
             isPdfDesign={isPdfDesign}
             dragging={dragging}
             setDragging={setDragging}
             onUploadFile={onUploadFile}
             onDeleteDesign={() => onDeleteDesign(contact.id)}
             onPreview={onPreview}
           />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDownloadAssets(contact)}
                disabled={!hasAssets || isDownloading}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm flex-1 ${(!hasAssets || isDownloading) ? 'border-slate-700 text-slate-500 cursor-not-allowed opacity-60' : 'border-slate-600 text-slate-100 hover:bg-slate-800'}`}
              >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span>Download Assets</span>
              </button>
              <button
                onClick={handleReadyForReviewInternal}
                disabled={isUploading || !designUrl}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm disabled:opacity-50 ${!designUrl ? 'border-slate-700 bg-slate-800 text-slate-500' : 'border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20'}`}
              >
                <ThumbsUp className="h-4 w-4" />
                <span>Ready for Review</span>
              </button>
            </div>
            {uploadError && (
              <div className="text-rose-400 text-sm mt-1 text-right">{uploadError}</div>
            )}
        </div>
      </div>
    </div>
  );
};

interface UploadZoneProps {
    isUploading: boolean;
    isDeleting: boolean;
    designUrl?: string;
    designFilename: string;
    isPdfDesign: boolean;
    dragging: boolean;
    setDragging: (v: boolean) => void;
    onUploadFile: (file: File) => void;
    onDeleteDesign: () => void;
    onPreview: (url: string, type: 'pdf' | 'image') => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ isUploading, isDeleting, designUrl, designFilename, isPdfDesign, dragging, setDragging, onUploadFile, onDeleteDesign, onPreview }) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
         <div
              className={`relative border-2 border-dashed rounded-lg px-4 py-5 text-center transition cursor-pointer ${dragging ? 'border-slate-100 bg-slate-800/40' : 'border-slate-600/60 bg-slate-900/20 hover:border-slate-400'} ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (isUploading) return;
                setDragging(false);
                if (e.dataTransfer.files?.[0]) onUploadFile(e.dataTransfer.files[0]);
              }}
              onClick={() => {
                if (isUploading) return;
                fileInputRef.current?.click();
              }}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-100" />
                  <div className="text-xs">Uploading design…</div>
                  <div className="text-[11px] text-slate-500">This can take up to 20 seconds for large files.</div>
                </div>
              ) : designUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full flex items-center justify-center">
                    {isPdfDesign ? (
                      <PdfThumbnail url={designUrl} heightPx={140} className="max-w-full" alt={designFilename} />
                    ) : (
                      <img src={designUrl} alt={designFilename} className="max-h-40 rounded-md object-contain" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-3">
                    <span 
                      className="underline hover:text-slate-300 cursor-pointer" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onPreview(designUrl, isPdfDesign ? 'pdf' : 'image');
                      }}
                    >
                      Open full design
                    </span>
                    <button
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={isDeleting}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Replace
                    </button>
                    <button
                      className="text-rose-300 hover:text-rose-200 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDesign();
                      }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 space-y-2">
                  <div className="font-medium text-slate-200">Drag & drop the final print-ready file here</div>
                  <div>or click to browse</div>
                  <div className="text-slate-500">PDF or image files supported</div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                    if(e.target.files?.[0]) onUploadFile(e.target.files[0]);
                }}
                disabled={isUploading}
              />
            </div>
    );
}

export default DesignRevisionCard;
