import React, { useState, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  Eye,
  Save,
  Loader2,
  Check,
  User,
  FileText,
  Image,
  XCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Contact, AirtableAttachment } from "../types";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";

interface ContactDesignRoundEditorProps {
  contact: Contact;
  onSave: (contactId: string, updates: Partial<Contact>) => Promise<boolean>;
  isReadOnly?: boolean;
  roundNumber: 1 | 2 | 3;
  round?: 1 | 2 | 3; // For backward compatibility
}

const ContactDesignRoundEditor: React.FC<ContactDesignRoundEditorProps> = ({
  contact,
  onSave,
  isReadOnly = false,
  roundNumber,
  round,
}) => {
  // Use round prop if provided, otherwise use roundNumber
  const currentRound = round || roundNumber;

  const [feedback, setFeedback] = useState(
    currentRound === 1
      ? contact.round1DraftFeedback || ""
      : currentRound === 2
      ? contact.round2DraftFeedback || ""
      : ""
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRejectToggling, setIsRejectToggling] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [copiedConfirmUrl, setCopiedConfirmUrl] = useState(false);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<
    "idle" | "upload" | "remove" | "feedback" | "reject"
  >("idle");
  const [lastRejectValue, setLastRejectValue] = useState<boolean | null>(null);

  const currentFiles =
    currentRound === 1
      ? contact.round1Draft || []
      : currentRound === 2
      ? contact.round2Draft || []
      : contact.round3Draft || [];

  // For Round 2, show previous round files and feedback above for context
  const previousRoundFiles = currentRound === 2 ? contact.round1Draft || [] : [];
  const previousRoundFeedback = currentRound === 2 ? contact.round1DraftFeedback || "" : "";
  const hasCurrentFiles = currentFiles.length > 0;

  const isRejected =
    currentRound === 1
      ? contact.rejectRound1
      : currentRound === 2
      ? contact.rejectRound2
      : false;

  const rejectField = currentRound === 1 ? "rejectRound1" : "rejectRound2";

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

  const handleCopyConfirmUrl = async () => {
    if (!contact.confirmAddressUrl) return;
    try {
      await navigator.clipboard.writeText(contact.confirmAddressUrl);
      setCopiedConfirmUrl(true);
      setTimeout(() => setCopiedConfirmUrl(false), 1500);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isReadOnly) {
        setIsDragOver(true);
      }
    },
    [isReadOnly]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (isReadOnly) return;

      const files = Array.from(e.dataTransfer.files);
      await handleFileUpload(files);
    },
    [isReadOnly]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly || !e.target.files) return;

      const files = Array.from(e.target.files);
      await handleFileUpload(files);

      // Reset input
      e.target.value = "";
    },
    [isReadOnly]
  );

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 5MB.`;
    }

    // Check file type
    const allowedExtensions = [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".ai",
      ".psd",
      ".sketch",
      ".fig",
      ".eps",
      ".indd",
      ".tiff",
      ".tif",
    ];

    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    const isValidType = allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      return `File "${file.name}" is not a supported format. Please use AI, PSD, PDF, or image files.`;
    }

    return null;
  };

  const processFileForAirtable = async (
    file: File
  ): Promise<AirtableAttachment> => {
    const url = await uploadToCloudinary(file);
    return {
      id: `temp_${Date.now()}_${Math.random()}`,
      url,
      filename: file.name,
      size: file.size,
      type: file.type,
    };
  };

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setSaveStatus("idle");
    setErrorMessage("");
    setUploadProgress({});
    setLastAction("upload");
    setLastRejectValue(null);

    try {
      // Validate all files first
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      // Process files one by one to avoid memory issues
      const processedFiles: AirtableAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name;

        // Initialize progress
        setUploadProgress((prev) => ({ ...prev, [fileName]: 0 }));

        try {
          // Simulate progress updates
          const progressInterval = setInterval(() => {
            setUploadProgress((prev) => ({
              ...prev,
              [fileName]: Math.min((prev[fileName] || 0) + 15, 85),
            }));
          }, 300);

          // Upload to Cloudinary and get the URL
          const processedFile = await processFileForAirtable(file);
          clearInterval(progressInterval);
          setUploadProgress((prev) => ({ ...prev, [fileName]: 95 }));
          processedFiles.push(processedFile);
        } catch (error) {
          console.error(`Error processing file ${fileName}:`, error);
          throw new Error(
            `Failed to process ${fileName}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      // Update progress to show saving
      Object.keys(uploadProgress).forEach((fileName) => {
        setUploadProgress((prev) => ({ ...prev, [fileName]: 98 }));
      });

      // Combine with existing files and save to Airtable
      const updatedFiles = [...currentFiles, ...processedFiles].map((file) => ({
        url: file.url,
        filename: file.filename,
      }));
      const updateData =
        currentRound === 1
          ? { round1Draft: updatedFiles as unknown as AirtableAttachment[] }
          : currentRound === 2
          ? { round2Draft: updatedFiles as unknown as AirtableAttachment[] }
          : { round3Draft: updatedFiles as unknown as AirtableAttachment[] };

      const success = await onSave(contact.id, updateData);
      if (!success) {
        throw new Error(
          "Failed to save files to database. Please check your file formats and try again."
        );
      }

      // Complete progress
      Object.keys(uploadProgress).forEach((fileName) => {
        setUploadProgress((prev) => ({ ...prev, [fileName]: 100 }));
      });

      setSaveStatus("success");
      // Clear progress after success
      setTimeout(() => {
        setUploadProgress({});
        setSaveStatus("idle");
      }, 3000);
    } catch (error) {
      console.error("Error uploading files:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Failed to upload files";
      setErrorMessage(errorMsg);
      setSaveStatus("error");
      setUploadProgress({});
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = async (fileIndex: number) => {
    if (isReadOnly) return;

    const updatedFiles = currentFiles.filter((_, index) => index !== fileIndex);
    const updateData =
      currentRound === 1
        ? { round1Draft: updatedFiles as unknown as AirtableAttachment[] }
        : currentRound === 2
        ? { round2Draft: updatedFiles as unknown as AirtableAttachment[] }
        : { round3Draft: updatedFiles as unknown as AirtableAttachment[] };

    setLastAction("remove");
    setLastRejectValue(null);
    const success = await onSave(contact.id, updateData);
    if (success) {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus("error");
    }
  };

  const handleFeedbackChange = (value: string) => {
    setFeedback(value);
    setHasChanges(true);
    setSaveStatus("idle");
  };

  const handleSaveFeedback = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setSaveStatus("idle");
    setLastAction("feedback");
    setLastRejectValue(null);

    try {
      const updateData =
        currentRound === 1
          ? { round1DraftFeedback: feedback }
          : currentRound === 2
          ? { round2DraftFeedback: feedback }
          : {};

      const success = await onSave(contact.id, updateData);
      if (success) {
        setSaveStatus("success");
        setHasChanges(false);
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Error saving feedback:", error);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleReject = async () => {
    if (isReadOnly || currentRound === 3) return;

    setIsRejectToggling(true);
    try {
      const newRejectValue = !isRejected;
      const updateData = { [rejectField]: newRejectValue };

      setLastAction("reject");
      setLastRejectValue(newRejectValue);
      const success = await onSave(contact.id, updateData);
      if (success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Error toggling reject status:", error);
      setSaveStatus("error");
    } finally {
      setIsRejectToggling(false);
    }
  };

  const [previewGroup, setPreviewGroup] = useState<AirtableAttachment[] | null>(null);
  const [previewStartIndex, setPreviewStartIndex] = useState<number>(0);
  const getPreviewLayout = (count: number) => {
    if (count <= 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    const cols = 4;
    const rows = Math.ceil(count / cols);
    return { cols, rows };
  };
  const openPreviewGrid = (group: AirtableAttachment[], clicked: AirtableAttachment) => {
    const images = group.filter((f) => isImage(f));
    if (images.length === 0) return;
    const startIdx = images.findIndex((img) => img.url === clicked.url);
    setPreviewGroup(images);
    setPreviewStartIndex(startIdx >= 0 ? startIdx : 0);
  };
  const handlePreviewClick = (group: AirtableAttachment[], file: AirtableAttachment) => {
    if (isImage(file)) {
      openPreviewGrid(group, file);
    } else {
      window.open(file.url, "_blank");
    }
  };

  // Lock background scroll when preview is open
  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    if (previewGroup) {
      htmlEl.style.overflow = 'hidden';
      bodyEl.style.overflow = 'hidden';
    }
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
    };
  }, [previewGroup]);

  const isImage = (file: AirtableAttachment) => {
    return (
      file.type?.startsWith("image/") ||
      file.filename.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
    );
  };

  const getFileIcon = (file: AirtableAttachment) => {
    if (isImage(file)) {
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    return <FileText className="h-8 w-8 text-slate-500" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
    if (saveStatus === "success") {
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
        Save Feedback
      </>
    );
  };

  const renderSuccessBanner = () => {
    if (saveStatus !== "success") return null;
    let message = "Saved successfully!";
    if (lastAction === "upload") message = "Files uploaded successfully!";
    else if (lastAction === "remove") message = "File removed.";
    else if (lastAction === "feedback") message = "Feedback saved.";
    else if (lastAction === "reject") {
      message = lastRejectValue ? "Marked as rejected." : "Rejection cleared.";
    }
    return (
      <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
        {message}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
      {previewGroup && (
        <div
          className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={() => setPreviewGroup(null)}
        >
          <div className="w-full max-w-[95vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white text-sm opacity-80">
                Viewing {previewGroup.length} image{previewGroup.length === 1 ? '' : 's'}
              </div>
              <button
                onClick={() => setPreviewGroup(null)}
                className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {(() => {
              const { cols, rows } = getPreviewLayout(previewGroup.length);
              const gapPx = 16; // Tailwind gap-4
              const headerPx = 40; // approx header height
              const perItemHeight = `calc((82vh - ${headerPx}px - ${(rows - 1) * gapPx}px) / ${rows})`;
              return (
                <div
                  className="grid gap-4 h-[82vh] overflow-hidden"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {previewGroup.map((img, idx) => (
                    <div
                      key={idx}
                      className={`bg-white rounded border flex flex-col ${idx === previewStartIndex ? 'ring-2 ring-blue-500' : ''}`}
                      style={{ height: perItemHeight }}
                    >
                      <div className="flex-1 flex items-center justify-center bg-white">
                        <img src={img.url} alt={img.filename} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="text-xs text-slate-600 p-2 truncate">{img.filename}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Contact Header */
      }
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          {contact.headshot && contact.headshot.length > 0 ? (
            <img
              src={contact.headshot[0].url}
              alt={contact.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="h-6 w-6 text-blue-600" />
            </div>
          )}
          <div>
            <h4 className="font-semibold text-slate-900">{contact.name}</h4>
            {contact.company && (
              <p className="text-sm text-slate-600">{contact.company}</p>
            )}
            {/* Display "Added by [Name]" if contactAddedBy has a value */}
            {contact.contactAddedBy && (
              <div className="flex items-center text-xs text-slate-500 mt-1">
                <User className="h-3 w-3 mr-1 flex-shrink-0" />
                <span>Added by {contact.contactAddedBy}</span>
              </div>
            )}
          </div>
        </div>

        {/* Reject Button - Only show for rounds 1 and 2, and when not read-only */}
        {!isReadOnly && currentRound !== 3 && (
          <button
            onClick={handleToggleReject}
            disabled={isRejectToggling}
            className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isRejected
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-red-600 text-white hover:bg-red-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRejectToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span>{isRejected ? "Rejected" : "Reject"}</span>
          </button>
        )}

        {/* Read-only reject status */}
        {isReadOnly && isRejected && currentRound !== 3 && (
          <div className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-lg">
            <XCircle className="h-4 w-4" />
            <span>Rejected</span>
          </div>
        )}
      </div>

      {/* Missing Address Callout */}
      {!contact.streetLine1 && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded flex items-center justify-between">
          <span className="text-xs font-medium text-red-700">Missing Address</span>
          {contact.confirmAddressUrl && (
            <button
              onClick={handleCopyConfirmUrl}
              className="p-1 text-red-600 hover:text-red-700 hover:bg-red-100 rounded transition-colors flex items-center"
              title={copiedConfirmUrl ? "Copied!" : "Copy Confirm Address URL"}
            >
              {copiedConfirmUrl ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      )}

      {currentRound === 2 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Round 1 summary */}
          <div className="space-y-3">
            <h5 className="font-medium text-slate-900">Round 1 Summary</h5>
            {previousRoundFiles.length > 0 && (
              <div>
                <p className="text-sm text-slate-700 mb-2">Round 1 Files ({previousRoundFiles.length})</p>
                <div className="grid grid-cols-1 gap-4">
                  {previousRoundFiles.map((file, index) => (
                    <div key={index} className="relative group bg-slate-50 rounded-lg border border-slate-200 p-4">
                      {isImage(file) ? (
                        <div className="h-64 mb-3 bg-white rounded border overflow-hidden flex items-center justify-center">
                          <img src={file.url} alt={file.filename} className="max-h-full max-w-full object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={() => handlePreviewClick(previousRoundFiles, file)} />
                        </div>
                      ) : (
                        <div className="h-64 mb-3 bg-white rounded border flex items-center justify-center">
                          {getFileIcon(file)}
                        </div>
                      )}
                      <p className="text-sm font-medium text-slate-900 truncate" title={file.filename}>{file.filename}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {previousRoundFeedback && (
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <p className="text-sm text-slate-700 whitespace-pre-line">{previousRoundFeedback}</p>
              </div>
            )}
          </div>

          {/* Right: Round 2 editor */}
          <div className="space-y-6">
            {/* File Upload Area */}
            {!isReadOnly && (
              <div className="space-y-4">
                <h5 className="font-medium text-slate-900">Upload Design Round {currentRound} Files</h5>
                <div className={`border-2 border-dashed rounded-lg ${hasCurrentFiles ? 'p-4' : 'p-8'} text-center transition-colors ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"} ${isUploading ? "opacity-50 pointer-events-none" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  {isUploading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="text-slate-600">Uploading files...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className={`${hasCurrentFiles ? 'h-8 w-8' : 'h-12 w-12'} text-slate-400 mx-auto mb-3`} />
                      <p className={`${hasCurrentFiles ? 'text-sm' : 'text-lg'} font-medium text-slate-900 mb-1`}>
                        {hasCurrentFiles ? 'Add more files' : 'Drop design files here or click to browse'}
                      </p>
                      <p className="text-xs text-slate-600 mb-3">Supports AI, PSD, PDF, and image files (max 5MB each)</p>
                      <input type="file" multiple accept="image/*,.pdf,.ai,.psd,.sketch,.fig,.eps,.indd,.tiff,.tif" onChange={handleFileSelect} className="hidden" id={`file-upload-${contact.id}-round${currentRound}`} />
                      <label htmlFor={`file-upload-${contact.id}-round${currentRound}`} className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Choose Files
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-slate-700">Upload Progress</h5>
                {Object.entries(uploadProgress).map(([fileName, progress]) => (
                  <div key={fileName} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600"><span className="truncate">{fileName}</span><span>{progress}%</span></div>
                    <div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                  </div>
                ))}
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{errorMessage}</span></div>
            )}

            {/* Uploaded Files Display */}
            {currentFiles.length > 0 && (
              <div className="space-y-4">
                <h5 className="font-medium text-slate-900">Design Round {currentRound} Files ({currentFiles.length})</h5>
                <div className="grid grid-cols-1 gap-4">
                  {currentFiles.map((file, index) => (
                    <div key={index} className="relative group bg-slate-50 rounded-lg border border-slate-200 p-4">
                      {isImage(file) ? (
                        <div className="h-64 mb-3 bg-white rounded border overflow-hidden flex items-center justify-center">
                          <img src={file.url} alt={file.filename} className="max-h-full max-w-full object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={() => handlePreviewClick(currentFiles, file)} />
                        </div>
                      ) : (
                        <div className="h-64 mb-3 bg-white rounded border flex items-center justify-center">{getFileIcon(file)}</div>
                      )}
                      <div className="space-y-2"><p className="text-sm font-medium text-slate-900 truncate" title={file.filename}>{file.filename}</p>{file.size && (<p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>)}</div>
                      <div className="flex items-center justify-end mt-3">
                        {!isReadOnly && (
                          <button
                            onClick={() => setConfirmRemoveIndex(index)}
                            className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 transition-colors"
                          >
                            <X className="h-3 w-3" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                      {confirmRemoveIndex === index && (
                        <div className="absolute inset-0 z-10 bg-white/95 rounded-lg border-2 border-red-200 p-4 flex flex-col items-center justify-center text-center space-y-3">
                          <div className="flex items-center text-red-700 font-semibold"><AlertCircle className="h-4 w-4 mr-2" />Remove this file?</div>
                          <div className="text-xs text-slate-600">This will remove the file from this round.</div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={async () => {
                                const removeIdx = index;
                                setConfirmRemoveIndex(null);
                                await handleRemoveFile(removeIdx);
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => setConfirmRemoveIndex(null)}
                              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Messages */}
            {renderSuccessBanner()}

            {/* Feedback Section - Hide for Round 3 */}
            {currentRound !== 3 && (
              <div className="space-y-4">
                <h5 className="font-medium text-slate-900">Design Round {currentRound} Feedback</h5>
                <textarea value={feedback} onChange={(e) => handleFeedbackChange(e.target.value)} disabled={isReadOnly || !isRejected} rows={4} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500" placeholder={isRejected ? `Enter feedback for ${contact.name}'s design round ${currentRound}...` : 'Feedback enabled after clicking Reject'} />
                {!isReadOnly && (
                  <div className="flex justify-end">
                    <button onClick={handleSaveFeedback} disabled={!isRejected || !hasChanges || isSaving} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center ${hasChanges && !isSaving && isRejected ? "bg-blue-600 text-white hover:bg-blue-700" : saveStatus === "success" ? "bg-green-600 text-white" : saveStatus === "error" ? "bg-red-600 text-white" : "bg-slate-200 text-slate-500 cursor-not-allowed"}`}>
                      {getSaveButtonContent()}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Status Messages */}
            {saveStatus === "error" && (<div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">Failed to save changes. Please try again.</div>)}
          </div>
        </div>
      ) : (
        <>
          {/* File Upload Area */}
          {!isReadOnly && (
            <div className="space-y-4">
              <h5 className="font-medium text-slate-900">Upload Design Round {currentRound} Files</h5>
              <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"} ${isUploading ? "opacity-50 pointer-events-none" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                {isUploading ? (
                  <div className="flex items-center justify-center space-x-2"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /><span className="text-slate-600">Uploading files...</span></div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-slate-900 mb-2">Drop design files here or click to browse</p>
                    <p className="text-sm text-slate-600 mb-4">Supports AI, PSD, PDF, and image files (max 5MB each)</p>
                    <input type="file" multiple accept="image/*,.pdf,.ai,.psd,.sketch,.fig,.eps,.indd,.tiff,.tif" onChange={handleFileSelect} className="hidden" id={`file-upload-${contact.id}-round${currentRound}`} />
                    <label htmlFor={`file-upload-${contact.id}-round${currentRound}`} className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"><Upload className="h-4 w-4 mr-2" />Choose Files</label>
                  </>
                )}
              </div>
            </div>
          )}
          {Object.keys(uploadProgress).length > 0 && (
            <div className="space-y-2"><h5 className="text-sm font-medium text-slate-700">Upload Progress</h5>{Object.entries(uploadProgress).map(([fileName, progress]) => (<div key={fileName} className="space-y-1"><div className="flex justify-between text-xs text-slate-600"><span className="truncate">{fileName}</span><span>{progress}%</span></div><div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} /></div></div>))}</div>
          )}
          {errorMessage && (<div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{errorMessage}</span></div>)}
          {currentFiles.length > 0 && (
            <div className="space-y-4">
              <h5 className="font-medium text-slate-900">Design Round {currentRound} Files ({currentFiles.length})</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentFiles.map((file, index) => (
                  <div key={index} className="relative group bg-slate-50 rounded-lg border border-slate-200 p-4">
                    {isImage(file) ? (
                      <div className="aspect-square mb-3 bg-white rounded border overflow-hidden">
                        <img src={file.url} alt={file.filename} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handlePreviewClick(currentFiles, file)} />
                      </div>
                    ) : (
                      <div className="aspect-square mb-3 bg-white rounded border flex items-center justify-center">{getFileIcon(file)}</div>
                    )}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-900 truncate" title={file.filename}>{file.filename}</p>
                      {file.size && (<p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>)}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <button onClick={() => handlePreviewClick(currentFiles, file)} className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"><Eye className="h-3 w-3" /><span>Preview</span></button>
                      {!isReadOnly && (
                        <button onClick={() => setConfirmRemoveIndex(index)} className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 transition-colors"><X className="h-3 w-3" /><span>Remove</span></button>
                      )}
                    </div>
                    {confirmRemoveIndex === index && (
                      <div className="absolute inset-0 z-10 bg-white/95 rounded-lg border-2 border-red-200 p-4 flex flex-col items-center justify-center text-center space-y-3">
                        <div className="flex items-center text-red-700 font-semibold"><AlertCircle className="h-4 w-4 mr-2" />Remove this file?</div>
                        <div className="text-xs text-slate-600">This will remove the file from this round.</div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={async () => {
                              const removeIdx = index;
                              setConfirmRemoveIndex(null);
                              await handleRemoveFile(removeIdx);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => setConfirmRemoveIndex(null)}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {renderSuccessBanner()}
          {currentRound !== 3 && (<div className="space-y-4"><h5 className="font-medium text-slate-900">Design Round {currentRound} Feedback</h5><textarea value={feedback} onChange={(e) => handleFeedbackChange(e.target.value)} disabled={isReadOnly || !isRejected} rows={4} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500" placeholder={isRejected ? `Enter feedback for ${contact.name}'s design round ${currentRound}...` : 'Feedback enabled after clicking Reject'} />{!isReadOnly && (<div className="flex justify-end"><button onClick={handleSaveFeedback} disabled={!isRejected || !hasChanges || isSaving} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center ${hasChanges && !isSaving && isRejected ? "bg-blue-600 text-white hover:bg-blue-700" : saveStatus === "success" ? "bg-green-600 text-white" : saveStatus === "error" ? "bg-red-600 text-white" : "bg-slate-200 text-slate-500 cursor-not-allowed"}`}>{getSaveButtonContent()}</button></div>)}</div>)}
          {saveStatus === "error" && (<div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">Failed to save changes. Please try again.</div>)}
        </>
      )}
    </div>
  );
};

export default ContactDesignRoundEditor;
