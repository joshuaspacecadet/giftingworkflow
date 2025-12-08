import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { Contact } from '../types';
import * as XLSX from 'xlsx';

interface BulkFulfillmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[]; // All potential contacts to match against
  onConfirm: (matches: MatchedOrder[]) => Promise<void>;
}

export interface MatchedOrder {
  contact: Contact;
  trackingNumber: string;
  shipDate: string;
}

interface ParseResult {
  matched: MatchedOrder[];
  unmatched: any[];
  errors: string[];
}

const BulkFulfillmentModal: React.FC<BulkFulfillmentModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onConfirm,
}) => {
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult>({ matched: [], unmatched: [], errors: [] });
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const matched: MatchedOrder[] = [];
      const unmatched: any[] = [];
      const errors: string[] = [];

      // Helper to find case-insensitive key
      const findKey = (obj: any, possibleKeys: string[]) => {
        const keys = Object.keys(obj);
        for (const pk of possibleKeys) {
          const found = keys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
          if (found) return found;
        }
        return null;
      };

      jsonData.forEach((row: any, index) => {
        // Identify Name
        const nameKey = findKey(row, ['Recipient', 'Recipient Name', 'Name', 'Full Name']);
        const emailKey = findKey(row, ['Email', 'Email Address']);
        
        const nameValue = nameKey ? row[nameKey] : null;
        const emailValue = emailKey ? row[emailKey] : null;

        if (!nameValue && !emailValue) {
          unmatched.push({ row: index + 2, data: row, reason: 'No Name or Email found' });
          return;
        }

        // Find Contact
        let contact: Contact | undefined;
        if (nameValue) {
          contact = contacts.find(c => c.name.trim().toLowerCase() === nameValue.toString().trim().toLowerCase());
        }
        if (!contact && emailValue) {
          contact = contacts.find(c => c.email?.trim().toLowerCase() === emailValue.toString().trim().toLowerCase());
        }

        if (!contact) {
          unmatched.push({ row: index + 2, data: row, reason: `Contact not found for: ${nameValue || emailValue}` });
          return;
        }

        // Extract Tracking & Ship Date
        const trackingKey = findKey(row, ['Tracking Number', 'Tracking']);
        const shipDateKey = findKey(row, ['Ship Date', 'Date', 'Shipped Date']);

        const trackingNumber = trackingKey ? row[trackingKey]?.toString().trim() : '';
        
        // Handle Excel dates or string dates
        let shipDate = '';
        if (shipDateKey && row[shipDateKey]) {
            const rawDate = row[shipDateKey];
            // If Excel numeric date
            if (typeof rawDate === 'number') {
                const dateObj = new Date((rawDate - (25567 + 2)) * 86400 * 1000); // Approximate conversion
                shipDate = dateObj.toISOString().split('T')[0];
            } else {
                // Try parsing string
                try {
                    const dateObj = new Date(rawDate);
                    if (!isNaN(dateObj.getTime())) {
                        shipDate = dateObj.toISOString().split('T')[0];
                    } else {
                        shipDate = rawDate; // fallback
                    }
                } catch {
                    shipDate = rawDate;
                }
            }
        } else {
            // Default to today if not provided? Prompt says "save to Latest Ship Date". 
            // If missing, maybe we shouldn't default, but for fulfillment usually implies today.
            // Let's leave empty if missing, but the logic says "upload... adds... ship date".
            // We can default to today if valid tracking provided?
            // Let's assume provided in file for now, or today if matched.
            shipDate = new Date().toISOString().split('T')[0];
        }

        if (!trackingNumber) {
          unmatched.push({ row: index + 2, data: row, reason: `Missing tracking number for ${contact.name}` });
          return;
        }

        matched.push({
          contact,
          trackingNumber,
          shipDate
        });
      });

      setParseResult({ matched, unmatched, errors });
      setStep('review');
    } catch (error) {
      console.error('Error parsing file:', error);
      // Handle error state appropriately
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm(parseResult.matched);
    setIsProcessing(false);
    onClose();
  };

  const reset = () => {
    setStep('upload');
    setParseResult({ matched: [], unmatched: [], errors: [] });
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Bulk Fulfill Orders
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 'upload' ? (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors flex flex-col items-center justify-center ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="h-12 w-12 text-slate-400 mb-4" />
              <p className="text-lg font-medium text-slate-900 mb-1">
                Drag and drop your fulfillment file here
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Supports .xlsx, .xls, .csv
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="bulk-upload-input"
              />
              <label
                htmlFor="bulk-upload-input"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer font-medium shadow-sm"
              >
                Browse Files
              </label>
              <div className="mt-8 text-xs text-slate-500 text-left max-w-sm">
                <p className="font-medium mb-2">Required Columns:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><span className="font-medium">Identifier:</span> "Recipient Name", "Name", "Full Name", or "Email"</li>
                  <li><span className="font-medium">Tracking:</span> "Tracking Number" or "Tracking"</li>
                  <li><span className="font-medium">Date:</span> "Ship Date" (Optional, defaults to today)</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900">Review Matches</h3>
                <div className="flex gap-2 text-sm">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md font-medium">
                    {parseResult.matched.length} Ready
                  </span>
                  {parseResult.unmatched.length > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded-md font-medium">
                      {parseResult.unmatched.length} Issues
                    </span>
                  )}
                </div>
              </div>

              {parseResult.matched.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 max-h-60 overflow-y-auto">
                      {parseResult.matched.slice(0, 50).map((match, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{match.contact.name}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{match.trackingNumber}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{match.shipDate}</td>
                        </tr>
                      ))}
                      {parseResult.matched.length > 50 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-center text-sm text-gray-500 italic">
                            ...and {parseResult.matched.length - 50} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {parseResult.unmatched.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Issues ({parseResult.unmatched.length})
                  </h4>
                  <div className="bg-red-50 border border-red-100 rounded-md p-4 max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-sm text-red-700">
                      {parseResult.unmatched.map((item, idx) => (
                        <li key={idx} className="flex justify-between">
                          <span>Row {item.row}: {item.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          {step === 'review' && (
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Upload
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          {step === 'review' && (
            <button
              onClick={handleConfirm}
              disabled={isProcessing || parseResult.matched.length === 0}
              className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Fulfill ${parseResult.matched.length} Orders`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BulkFulfillmentModal;
