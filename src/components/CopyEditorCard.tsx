import React, { useState, useEffect } from 'react';
import { Contact, SpecificStage } from '../types';
import { AirtableService } from '../services/airtable';
import { Loader2, Save, ThumbsUp, Linkedin, Info } from 'lucide-react';

interface CopyEditorCardProps {
  contact: Contact;
  onUpdate: (updated: Contact) => void;
  onReadyForDesign: (contactId: string) => void;
  isProcessing: boolean;
}

const CopyEditorCard: React.FC<CopyEditorCardProps> = ({ contact, onUpdate, onReadyForDesign, isProcessing }) => {
  const [formData, setFormData] = useState({
    headline: contact.headline || '',
    subheadline: contact.subheadline || '',
    flavorText: contact.flavorText || ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFormData({
      headline: contact.headline || '',
      subheadline: contact.subheadline || '',
      flavorText: contact.flavorText || ''
    });
    setHasChanges(false);
  }, [contact]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await AirtableService.updateContact(contact.id, formData);
      if (updated) {
        onUpdate(updated);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Error saving copy:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border border-slate-700/60 rounded-lg p-4 bg-[#121214]">
      <div className="flex flex-col gap-4">
        {/* Header Info */}
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium text-slate-100 truncate text-lg">{contact.name || 'Unnamed'}</div>
            <div className="text-sm text-slate-400 truncate">{contact.company}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">
              {contact.contactAddedBy ? `${contact.contactAddedBy}'s contact` : 'Contact owner unknown'}
            </div>
            {contact.linkedinUrl && (
              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 w-fit mt-1">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            )}
          </div>
        </div>

        {/* Context */}
        {contact.additionalContactContext && (
          <div className="text-xs text-slate-400 bg-slate-800/50 p-3 rounded border border-slate-700/50">
            <div className="flex items-center gap-1.5 mb-1 text-slate-300">
              <Info className="h-3 w-3" /> <span className="font-medium">Context</span>
            </div>
            {contact.additionalContactContext}
          </div>
        )}

        {/* Editor Inputs */}
        <div className="space-y-3 mt-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Headline Text</label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => handleChange('headline', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              placeholder="Enter headline..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subheadline Text</label>
            <input
              type="text"
              value={formData.subheadline}
              onChange={(e) => handleChange('subheadline', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              placeholder="Enter subheadline..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Flavor Text</label>
            <textarea
              value={formData.flavorText}
              onChange={(e) => handleChange('flavorText', e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              placeholder="Enter flavor text..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-2 pt-4 border-t border-slate-800">
           {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-blue-600/50 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 text-sm transition-colors"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Changes</span>
            </button>
          )}
          <button
            onClick={() => onReadyForDesign(contact.id)}
            disabled={isProcessing || hasChanges}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={hasChanges ? "Save changes before moving to design" : ""}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
            <span>Ready for Design</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CopyEditorCard;

