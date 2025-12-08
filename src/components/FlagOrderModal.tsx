import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Flag } from 'lucide-react';
import { Contact } from '../types';

interface FlagOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  onSave: (contactId: string, flagNote: string) => Promise<void>;
}

const FlagOrderModal: React.FC<FlagOrderModalProps> = ({
  isOpen,
  onClose,
  contact,
  onSave,
}) => {
  const [flagNote, setFlagNote] = useState(contact.fulfillFlag || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(contact.id, flagNote);
      onClose();
    } catch (error) {
      console.error("Failed to save flag note:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <div className="bg-red-100 p-2 rounded-full">
              <Flag className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Flag Order
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-sm text-slate-600 mb-4">
            Add a note to flag this order for <strong>{contact.name}</strong>.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Note
            </label>
            <textarea
              required
              rows={4}
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter reason for flagging..."
            />
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="mr-3 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Flag'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default FlagOrderModal;
