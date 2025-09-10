import React, { useState, useEffect } from 'react';
import { Save, Loader2, Check, User, ExternalLink } from 'lucide-react';
import { Contact } from '../types';

interface ContactCopyEditorProps {
  contact: Contact;
  onSave: (contactId: string, copyData: Partial<Contact>) => Promise<boolean>;
  isReadOnly?: boolean;
}

const ContactCopyEditor: React.FC<ContactCopyEditorProps> = ({
  contact,
  onSave,
  isReadOnly = false
}) => {
  const [copyData, setCopyData] = useState({
    copyTitle1: contact.copyTitle1 || '',
    copyTitle2: (contact.copyTitle2 && contact.copyTitle2.length > 0) ? contact.copyTitle2 : 'Human Creature - ',
    copyTitle3: (contact as any).copyTitle3 || '',
    copyMainText: contact.copyMainText || '',
    imageDirection: contact.imageDirection || ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setCopyData({
      copyTitle1: contact.copyTitle1 || '',
      copyTitle2: (contact.copyTitle2 && contact.copyTitle2.length > 0) ? contact.copyTitle2 : 'Human Creature - ',
      copyTitle3: (contact as any).copyTitle3 || '',
      copyMainText: contact.copyMainText || '',
      imageDirection: contact.imageDirection || ''
    });
    setHasChanges(false);
    setSaveStatus('idle');
  }, [contact]);

  const handleInputChange = (field: keyof typeof copyData, value: string) => {
    // Enforce character limits per field
    let limited = value;
    if (field === 'copyTitle1') {
      limited = value.slice(0, 24);
    } else if (field === 'copyTitle2') {
      limited = value.slice(0, 36);
    } else if (field === 'copyMainText') {
      limited = value.slice(0, 362);
    }
    setCopyData(prev => ({ ...prev, [field]: limited }));
    setHasChanges(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const success = await onSave(contact.id, copyData);
      if (success) {
        setSaveStatus('success');
        setHasChanges(false);
        // Clear success status after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving copy:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const getSaveButtonContent = () => {
    if (isSaving) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Saving...
        </>
      );
    }
    if (saveStatus === 'success') {
      return (
        <>
          <Check className="h-4 w-4 mr-2" />
          Saved!
        </>
      );
    }
    return (
      <>
        <Save className="h-4 w-4 mr-2" />
        Save Copy
      </>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Header spanning both columns on large screens */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            {contact.headshot && contact.headshot.length > 0 ? (
              <img src={contact.headshot[0].url} alt={contact.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600" />
              </div>
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900">{contact.name}</h4>
              {contact.company && <p className="text-sm text-slate-600">{contact.company}</p>}
              {contact.linkedinUrl && (
                <div className="flex items-center mt-1">
                  <ExternalLink className="h-3 w-3 mr-1 text-slate-500" />
                  <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
                    LinkedIn Profile
                  </a>
                </div>
              )}
              {contact.additionalContactContext && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-xs text-slate-600 italic">{contact.additionalContactContext}</p>
                </div>
              )}
            </div>
            <div className="text-xs text-slate-600">{contact.phone && <div>{contact.phone}</div>}</div>
          </div>
        </div>

        {/* Live Preview (aligned with Copy Title 1 row) */}
        <div className="order-2 lg:order-1 lg:col-span-1">
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <h3 className="text-sm font-medium text-slate-700 mb-2">Live Preview</h3>
            <div className="border border-slate-700 rounded-md p-3 bg-black text-white flex flex-col gap-3" style={{ aspectRatio: '5 / 7' }}>
              <div className="flex-1 flex flex-col gap-3">
                <div className="border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white bg-black/30">
                  {copyData.copyTitle1 || 'Copy Title 1'}
                </div>
                <div className="h-40 border border-slate-700 rounded-md overflow-hidden bg-black">
                  {contact.headshot && contact.headshot.length > 0 ? (
                    <img
                      src={contact.headshot[0].url}
                      alt={`${contact.name} headshot`}
                      className="w-full h-full object-cover filter grayscale"
                    />
                  ) : null}
                </div>
                <div className="border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white bg-black/30">
                  {copyData.copyTitle2 || 'Copy Title 2'}
                </div>
                <div className="border border-slate-700 rounded-md px-3 py-2 bg-black/30">
                  <div className="text-xs font-semibold text-white mb-1">
                    {copyData.copyTitle3 || 'Copy Title 3'}
                  </div>
                  <div className="text-xs text-white whitespace-pre-line">
                    {copyData.copyMainText || 'Main copy will appear here...'}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <img src="/spacecadet-logo.png" alt="Spacecadet" className="h-3 opacity-80" />
                <div className="text-[10px] text-white/60">preview</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel - inputs */}
        <div className="space-y-4 order-1 lg:order-2 lg:col-span-2">
      {/* Copy Input Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Copy Title 1
          </label>
          <input
            type="text"
            value={copyData.copyTitle1}
            onChange={(e) => handleInputChange('copyTitle1', e.target.value)}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Enter first title line..."
            maxLength={24}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Copy Title 2
          </label>
          <input
            type="text"
            value={copyData.copyTitle2}
            onChange={(e) => handleInputChange('copyTitle2', e.target.value)}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Human Creature - "
            maxLength={36}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Copy Title 3
          </label>
          <input
            type="text"
            value={copyData.copyTitle3 as any}
            onChange={(e) => handleInputChange('copyTitle3' as any, e.target.value)}
            disabled={isReadOnly}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Enter third title line..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Copy Main Text
          </label>
          <textarea
            value={copyData.copyMainText}
            onChange={(e) => handleInputChange('copyMainText', e.target.value)}
            disabled={isReadOnly}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Enter main copy text..."
            maxLength={362}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Image Direction
          </label>
          <textarea
            value={copyData.imageDirection}
            onChange={(e) => handleInputChange('imageDirection', e.target.value)}
            disabled={isReadOnly}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Enter specific image direction and visual notes for the designer..."
          />
        </div>
      </div>
        {/* Save Button */}
        {!isReadOnly && (
          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center ${
                hasChanges && !isSaving
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : saveStatus === 'success'
                  ? 'bg-green-600 text-white'
                  : saveStatus === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              {getSaveButtonContent()}
            </button>
          </div>
        )}

        {/* Error Message */}
        {saveStatus === 'error' && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            Failed to save copy. Please try again.
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ContactCopyEditor;