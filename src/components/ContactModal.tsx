import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Upload, Trash2, AlertCircle, Info, CheckCircle } from "lucide-react";
import { Contact } from "../types";
import { normalizeUrl, isValidUrl } from "../utils/urlHelpers";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import { AirtableService } from "../services/airtable";

// Type for Airtable contact data (different from our Contact type)
type AirtableContactData = Omit<
  Partial<Contact>,
  "headshot" | "companyLogo"
> & {
  headshot?: { url: string; filename: string }[];
  companyLogo?: { url: string; filename: string }[];
};

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Partial<Contact>) => Promise<Contact | null>;
  contact?: Contact;
  isLoading?: boolean;
  availableCreators: string[];
  currentProjectId?: string;
}

const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contact,
  isLoading = false,
  availableCreators,
  currentProjectId,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    streetLine1: "",
    streetLine2: "",
    city: "",
    state: "",
    postCode: "",
    countryCode: "",
    linkedinUrl: "",
    additionalContactContext: "",
    contactAddedBy: "",
    magicCards: false,
    sfsBook: false,
    goldenRecord: false,
  });

  const [headshots, setHeadshots] = useState<
    { url: string; filename: string; type: string; size: number }[]
  >([]);
  const [companyLogos, setCompanyLogos] = useState<
    { url: string; filename: string; type: string; size: number }[]
  >([]);
  const [isUploadingHeadshots, setIsUploadingHeadshots] = useState(false);
  const [isUploadingLogos, setIsUploadingLogos] = useState(false);
  const [isDragOverHeadshots, setIsDragOverHeadshots] = useState(false);
  const [isDragOverLogos, setIsDragOverLogos] = useState(false);
  const [linkedinUrlError, setLinkedinUrlError] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [itemsError, setItemsError] = useState<string>("");

  // Autocomplete state
  const [nameSuggestions, setNameSuggestions] = useState<Contact[]>([]);
  const [isSearchingNames, setIsSearchingNames] = useState(false);
  const [selectedExistingContact, setSelectedExistingContact] = useState<Contact | null>(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

  useEffect(() => {
    console.log("ContactModal useEffect triggered with contact:", contact);

    if (contact) {
      console.log("Setting form data for existing contact:", contact);
      setFormData({
        name: contact.name || "",
        company: contact.company || "",
        email: contact.email || "",
        phone: contact.phone || "",
        streetLine1: contact.streetLine1 || "",
        streetLine2: contact.streetLine2 || "",
        city: contact.city || "",
        state: contact.state || "",
        postCode: contact.postCode || "",
        countryCode: contact.countryCode || "",
        linkedinUrl: contact.linkedinUrl || "",
        additionalContactContext: contact.additionalContactContext || "",
        contactAddedBy: contact.contactAddedBy || "",
        magicCards: (contact.magicCardsProjects || []).includes(currentProjectId || ""),
        sfsBook: (contact.sfsBookProjects || []).includes(currentProjectId || ""),
        goldenRecord: (contact.goldenRecordProjects || []).includes(currentProjectId || ""),
      });

      // Convert AirtableAttachment format to internal format
      const convertedHeadshots = (contact.headshot || []).map((attachment) => ({
        url: attachment.url,
        filename: attachment.filename,
        type: attachment.type,
        size: attachment.size,
      }));

      const convertedCompanyLogos = (contact.companyLogo || []).map(
        (attachment) => ({
          url: attachment.url,
          filename: attachment.filename,
          type: attachment.type,
          size: attachment.size,
        })
      );

      console.log("Converted headshots:", convertedHeadshots);
      console.log("Converted company logos:", convertedCompanyLogos);

      setHeadshots(convertedHeadshots);
      setCompanyLogos(convertedCompanyLogos);
    } else {
      console.log("Clearing form data for new contact");
      setFormData({
        name: "",
        company: "",
        email: "",
        phone: "",
        streetLine1: "",
        streetLine2: "",
        city: "",
        state: "",
        postCode: "",
        countryCode: "",
        linkedinUrl: "",
        additionalContactContext: "",
        contactAddedBy: "",
        magicCards: false,
        sfsBook: false,
        goldenRecord: false,
      });
      setHeadshots([]);
      setCompanyLogos([]);
    }
    setLinkedinUrlError("");
    setSelectedExistingContact(contact ?? null);
    setItemsError("");
  }, [contact]);

  // Clear items error when a new selection is made or availability changes
  useEffect(() => {
    if (!selectedExistingContact) {
      setItemsError("");
      return;
    }
    const previouslySent = {
      magicCards: (selectedExistingContact.magicCardsProjects || []).some((id) => id !== (currentProjectId || "")),
      sfsBook: (selectedExistingContact.sfsBookProjects || []).some((id) => id !== (currentProjectId || "")),
      goldenRecord: (selectedExistingContact.goldenRecordProjects || []).some((id) => id !== (currentProjectId || "")),
    };
    const newSelections = [
      formData.magicCards && !previouslySent.magicCards,
      formData.sfsBook && !previouslySent.sfsBook,
      formData.goldenRecord && !previouslySent.goldenRecord,
    ].some(Boolean);
    if (newSelections) setItemsError("");
  }, [formData.magicCards, formData.sfsBook, formData.goldenRecord, selectedExistingContact, currentProjectId]);

  // Debounced search for name suggestions
  useEffect(() => {
    const controller = new AbortController();
    const q = (formData.name || "").trim();
    if (!isOpen) return;
    // If a suggestion was selected and the input matches it exactly, suppress suggestions
    if (selectedExistingContact && q.toLowerCase() === (selectedExistingContact.name || '').trim().toLowerCase()) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      setIsSearchingNames(false);
      return;
    }
    if (q.length < 2) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }
    setIsSearchingNames(true);
    const handle = setTimeout(async () => {
      try {
        const results = await AirtableService.searchContactsByName(q, 8);
        setNameSuggestions(results);
        setShowNameSuggestions(true);
      } catch (e) {
        console.error("Name search failed", e);
      } finally {
        setIsSearchingNames(false);
      }
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [formData.name, isOpen]);

  // Disable background scroll when modal is open
  useEffect(() => {
    if (isOpen && typeof document !== "undefined") {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  const handleLinkedInUrlChange = (value: string) => {
    setFormData({ ...formData, linkedinUrl: value });

    // Validate LinkedIn URL if provided
    if (value.trim()) {
      const normalizedUrl = normalizeUrl(value.trim());
      if (!isValidUrl(normalizedUrl)) {
        setLinkedinUrlError(
          "Please enter a valid URL (e.g., https://linkedin.com/in/username)"
        );
      } else if (!normalizedUrl.toLowerCase().includes("linkedin.com")) {
        setLinkedinUrlError("Please enter a LinkedIn URL");
      } else {
        setLinkedinUrlError("");
      }
    } else {
      setLinkedinUrlError("");
    }
  };

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 5MB.`;
    }

    // Check file type
    const allowedExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
    ];

    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    const isValidType = allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      return `File "${file.name}" is not a supported format. Please use image files.`;
    }

    return null;
  };

  const processFileForAirtable = async (
    file: File
  ): Promise<{ url: string; filename: string; type: string; size: number }> => {
    const url = await uploadToCloudinary(file);
    return {
      url,
      filename: file.name,
      type: file.type,
      size: file.size,
    };
  };

  const handleFileUpload = useCallback(
    async (files: File[], type: "headshot" | "logo") => {
      console.log("handleFileUpload called", { files, type });
      if (files.length === 0) return;

      const setUploading =
        type === "headshot" ? setIsUploadingHeadshots : setIsUploadingLogos;
      const currentFiles = type === "headshot" ? headshots : companyLogos;
      const setFiles = type === "headshot" ? setHeadshots : setCompanyLogos;

      setUploading(true);
      setErrorMessage("");
      setUploadProgress({});

      try {
        // Validate all files first
        for (const file of files) {
          const validationError = validateFile(file);
          if (validationError) {
            throw new Error(validationError);
          }
        }

        console.log("Files validated successfully, starting upload...");

        // Process files one by one to avoid memory issues
        const processedFiles: {
          url: string;
          filename: string;
          type: string;
          size: number;
        }[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileName = file.name;

          console.log(`Processing file ${i + 1}/${files.length}: ${fileName}`);

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
            console.log(`Uploading ${fileName} to Cloudinary...`);
            const processedFile = await processFileForAirtable(file);
            console.log(`Successfully uploaded ${fileName}:`, processedFile);

            clearInterval(progressInterval);
            setUploadProgress((prev) => ({ ...prev, [fileName]: 100 }));
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

        console.log("All files processed, updating state...");
        setFiles([...currentFiles, ...processedFiles]);

        // Clear progress after success
        setTimeout(() => {
          setUploadProgress({});
        }, 2000);
      } catch (error) {
        console.error("Error uploading files:", error);
        const errorMsg =
          error instanceof Error ? error.message : "Failed to upload files";
        setErrorMessage(errorMsg);
        setUploadProgress({});
      } finally {
        setUploading(false);
      }
    },
    [headshots, companyLogos]
  );

  const handleHeadshotSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      console.log("handleHeadshotSelect called", e.target.files);
      if (e.target.files) {
        const files = Array.from(e.target.files);
        console.log("Selected headshot files:", files);
        handleFileUpload(files, "headshot");
        e.target.value = "";
      }
    },
    [handleFileUpload]
  );

  const handleLogoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      console.log("handleLogoSelect called", e.target.files);
      if (e.target.files) {
        const files = Array.from(e.target.files);
        console.log("Selected logo files:", files);
        handleFileUpload(files, "logo");
        e.target.value = "";
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = (
    e: React.DragEvent,
    type: "headshot" | "logo"
  ) => {
    e.preventDefault();
    if (type === "headshot") {
      if (!isUploadingHeadshots) setIsDragOverHeadshots(true);
    } else {
      if (!isUploadingLogos) setIsDragOverLogos(true);
    }
  };

  const handleDragLeave = (
    e: React.DragEvent,
    type: "headshot" | "logo"
  ) => {
    e.preventDefault();
    if (type === "headshot") setIsDragOverHeadshots(false);
    else setIsDragOverLogos(false);
  };

  const handleDrop = async (
    e: React.DragEvent,
    type: "headshot" | "logo"
  ) => {
    e.preventDefault();
    if (type === "headshot") setIsDragOverHeadshots(false);
    else setIsDragOverLogos(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await handleFileUpload(files, type);
  };

  const handleRemoveFile = (index: number, type: "headshot" | "logo") => {
    if (type === "headshot") {
      setHeadshots((prev) => prev.filter((_, i) => i !== index));
    } else {
      setCompanyLogos((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handlePreviewFile = (file: {
    url: string;
    filename: string;
    type: string;
    size: number;
  }) => {
    window.open(file.url, "_blank", "noopener,noreferrer");
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Don't submit if there's a LinkedIn URL error
    if (linkedinUrlError) {
      return;
    }

    // Require at least one new item selection if using an existing contact
    if (selectedExistingContact) {
      const previouslySent = {
        magicCards: (selectedExistingContact.magicCardsProjects || []).some((id) => id !== (currentProjectId || "")),
        sfsBook: (selectedExistingContact.sfsBookProjects || []).some((id) => id !== (currentProjectId || "")),
        goldenRecord: (selectedExistingContact.goldenRecordProjects || []).some((id) => id !== (currentProjectId || "")),
      };
      const anyNew = (
        (formData.magicCards && !previouslySent.magicCards) ||
        (formData.sfsBook && !previouslySent.sfsBook) ||
        (formData.goldenRecord && !previouslySent.goldenRecord)
      );
      if (!anyNew) {
        setItemsError("Please select at least one item that has not been previously sent.");
        return;
      }
    }

    // Normalize the LinkedIn URL before saving
    const normalizedLinkedInUrl = formData.linkedinUrl.trim()
      ? normalizeUrl(formData.linkedinUrl.trim())
      : "";

    // Prepare contact data
    const contactData: AirtableContactData = {
      ...formData,
      linkedinUrl: normalizedLinkedInUrl,
    };

    // If an existing contact was selected via autocomplete, include its id so the caller updates it
    if (selectedExistingContact) {
      (contactData as any).id = selectedExistingContact.id;
      // Clear any prior review status so it doesn't carry into this project
      (contactData as any).contactReview = null;
      (contactData as any).contactReviewFeedback = "";
    }

    // If we have files to upload, handle them first
    if (headshots.length > 0 || companyLogos.length > 0) {
      // Convert our simplified file format to Airtable attachment format (url + filename only)
      const airtableHeadshots = headshots.map((file) => ({
        url: file.url,
        filename: file.filename,
      }));

      const airtableCompanyLogos = companyLogos.map((file) => ({
        url: file.url,
        filename: file.filename,
      }));

      // Add files to contact data
      contactData.headshot = airtableHeadshots;
      contactData.companyLogo = airtableCompanyLogos;
    }

    // Convert selected items to per-project links
    const projectId = currentProjectId || "";
    if (projectId) {
      if (formData.magicCards) (contactData as any).magicCardsProjects = [projectId];
      if (formData.sfsBook) (contactData as any).sfsBookProjects = [projectId];
      if (formData.goldenRecord) (contactData as any).goldenRecordProjects = [projectId];
    }

    // Save/update contact with all data including files
    console.log("Submitting contactData:", contactData);
    await onSave(contactData as Partial<Contact>);

    // Don't close modal here - let the parent handle it
    // The parent will close the modal when savedContact is returned
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]"
      onClick={(e) => {
        console.log("Modal backdrop clicked", e.target);
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => {
          console.log("Modal content clicked", e.target);
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-20">
          <h2 className="text-lg font-semibold text-slate-900">
            {contact ? "Edit Contact" : "Add New Contact"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-md font-medium text-slate-900 border-b border-slate-200 pb-2">
              Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setSelectedExistingContact(null);
                    }}
                    onFocus={() => {
                      if (nameSuggestions.length > 0) setShowNameSuggestions(true);
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setShowNameSuggestions(false), 150);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter full name"
                    aria-autocomplete="list"
                    aria-expanded={showNameSuggestions}
                    aria-controls="name-suggestions-list"
                  />
                  {showNameSuggestions && (
                    <div
                      id="name-suggestions-list"
                      className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto"
                      role="listbox"
                    >
                      {isSearchingNames ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>
                      ) : nameSuggestions.length > 0 ? (
                        nameSuggestions.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              // Prefill all fields from selected contact
                              setSelectedExistingContact(c);
                              setFormData({
                                name: c.name || "",
                                company: c.company || "",
                                email: c.email || "",
                                phone: c.phone || "",
                                streetLine1: c.streetLine1 || "",
                                streetLine2: c.streetLine2 || "",
                                city: c.city || "",
                                state: c.state || "",
                                postCode: c.postCode || "",
                                countryCode: c.countryCode || "",
                                linkedinUrl: c.linkedinUrl || "",
                                additionalContactContext: c.additionalContactContext || "",
                                contactAddedBy: c.contactAddedBy || "",
                                magicCards: (c.magicCardsProjects || []).includes(currentProjectId || ""),
                                sfsBook: (c.sfsBookProjects || []).includes(currentProjectId || ""),
                                goldenRecord: (c.goldenRecordProjects || []).includes(currentProjectId || ""),
                              });
                              // Populate previews for images
                              const convertedHeadshots = (c.headshot || []).map((a) => ({
                                url: a.url,
                                filename: a.filename,
                                type: a.type,
                                size: a.size,
                              }));
                              const convertedCompanyLogos = (c.companyLogo || []).map((a) => ({
                                url: a.url,
                                filename: a.filename,
                                type: a.type,
                                size: a.size,
                              }));
                              setHeadshots(convertedHeadshots);
                              setCompanyLogos(convertedCompanyLogos);
                              setShowNameSuggestions(false);
                              setNameSuggestions([]);
                              setIsSearchingNames(false);
                              // Move focus out to collapse dropdown
                              nameInputRef.current?.blur();
                            }}
                            role="option"
                            aria-selected={selectedExistingContact?.id === c.id}
                          >
                            <div className="font-medium text-slate-800">{c.name}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {[c.company, c.email, c.city].filter(Boolean).join(" • ")}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">
                          No matches. Continue typing to add a new recipient.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">
                    Company
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, company: "Individual (No Company)" })}
                    className="text-xs text-slate-500 underline hover:text-blue-600"
                  >
                    Use "Individual (No Company)"
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Phone number"
                />
              </div>

              {/* Add Contact Added By field */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Added By
                </label>
                <select
                  value={formData.contactAddedBy}
                  onChange={(e) =>
                    setFormData({ ...formData, contactAddedBy: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                >
                  <option value="">Please Select</option>
                  {availableCreators.map((creator) => (
                    <option key={creator} value={creator}>
                      {creator}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-900">Items</h4>
              {(() => {
                const previouslySent = {
                  magicCards: (selectedExistingContact?.magicCardsProjects || []).some((id) => id !== (currentProjectId || "")),
                  sfsBook: (selectedExistingContact?.sfsBookProjects || []).some((id) => id !== (currentProjectId || "")),
                  goldenRecord: (selectedExistingContact?.goldenRecordProjects || []).some((id) => id !== (currentProjectId || "")),
                };
                const availableItems = [
                  { key: "magicCards" as const, label: "Magic Cards" },
                  { key: "sfsBook" as const, label: "SFS Book" },
                  { key: "goldenRecord" as const, label: "Golden Record" },
                ].filter((i) => !previouslySent[i.key]);
                const alreadySentItems = [
                  { key: "magicCards" as const, label: "Magic Cards", sent: previouslySent.magicCards },
                  { key: "sfsBook" as const, label: "SFS Book", sent: previouslySent.sfsBook },
                  { key: "goldenRecord" as const, label: "Golden Record", sent: previouslySent.goldenRecord },
                ].filter((i) => i.sent);

                return (
                  <>
                    <div className="flex items-center gap-4 text-sm">
                      {availableItems.length > 0 ? (
                        availableItems.map((i) => (
                          <label key={i.key} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={(formData as any)[i.key]}
                              onChange={(e) => setFormData({ ...formData, [i.key]: e.target.checked } as any)}
                            />
                            <span>{i.label}</span>
                          </label>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No items available to send. All have been sent previously.</span>
                      )}
                    </div>

                    {itemsError && (
                      <div className="text-xs text-red-600 mt-1">{itemsError}</div>
                    )}

                    {alreadySentItems.length > 0 && (
                      <div className="mt-2 text-xs border border-slate-200 bg-slate-50 rounded-md px-3 py-2 text-slate-700">
                        <div className="font-medium mb-1">Already sent</div>
                        <div className="flex flex-wrap gap-2">
                          {alreadySentItems.map((i) => (
                            <span key={i.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" /> {i.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* File Uploads */}
          <div className="space-y-4">
            <h3 className="text-md font-medium text-slate-900 border-b border-slate-200 pb-2">
              Images
            </h3>

            {/* Upload Progress */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-slate-700">
                  Upload Progress
                </h5>
                {Object.entries(uploadProgress).map(([fileName, progress]) => (
                  <div key={fileName} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span className="truncate">{fileName}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Headshot Upload */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Headshot
                </label>

                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isDragOverHeadshots
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-300 hover:border-slate-400"
                  } ${isUploadingHeadshots ? "opacity-50 pointer-events-none" : ""}`}
                  onDragOver={(e) => handleDragOver(e, "headshot")}
                  onDragLeave={(e) => handleDragLeave(e, "headshot")}
                  onDrop={(e) => handleDrop(e, "headshot")}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleHeadshotSelect}
                    className="hidden"
                    id="headshot-upload"
                    disabled={isUploadingHeadshots}
                    onClick={() => console.log("Headshot file input clicked")}
                  />
                  <label
                    htmlFor="headshot-upload"
                    className="cursor-pointer flex flex-col items-center space-y-2"
                    onClick={() => console.log("Headshot upload label clicked")}
                  >
                    {isUploadingHeadshots ? (
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    ) : (
                      <Upload className="h-8 w-8 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-600">
                      {isUploadingHeadshots
                        ? "Uploading..."
                        : "Click to upload headshot"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Max 5MB per file
                    </span>
                  </label>
                </div>

                {/* Headshot Preview */}
                {headshots.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-slate-700">
                      Headshots ({headshots.length})
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      {headshots.map((file, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={file.url}
                            alt={file.filename}
                            className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handlePreviewFile(file)}
                          />
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveFile(index, "headshot")
                              }
                              className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <p
                            className="text-xs text-slate-600 truncate mt-1"
                            title={file.filename}
                          >
                            {file.filename}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Company Logo Upload */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Company Logo
                </label>

                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isDragOverLogos
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-300 hover:border-slate-400"
                  } ${isUploadingLogos ? "opacity-50 pointer-events-none" : ""}`}
                  onDragOver={(e) => handleDragOver(e, "logo")}
                  onDragLeave={(e) => handleDragLeave(e, "logo")}
                  onDrop={(e) => handleDrop(e, "logo")}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleLogoSelect}
                    className="hidden"
                    id="logo-upload"
                    disabled={isUploadingLogos}
                    onClick={() => console.log("Logo file input clicked")}
                  />
                  <label
                    htmlFor="logo-upload"
                    className="cursor-pointer flex flex-col items-center space-y-2"
                    onClick={() => console.log("Logo upload label clicked")}
                  >
                    {isUploadingLogos ? (
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    ) : (
                      <Upload className="h-8 w-8 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-600">
                      {isUploadingLogos
                        ? "Uploading..."
                        : "Click to upload company logo"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Max 5MB per file
                    </span>
                  </label>
                </div>

                {/* Company Logo Preview */}
                {companyLogos.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-slate-700">
                      Company Logos ({companyLogos.length})
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      {companyLogos.map((file, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={file.url}
                            alt={file.filename}
                            className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handlePreviewFile(file)}
                          />
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(index, "logo")}
                              className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <p
                            className="text-xs text-slate-600 truncate mt-1"
                            title={file.filename}
                          >
                            {file.filename}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="space-y-4">
            <h3 className="text-md font-medium text-slate-900 border-b border-slate-200 pb-2">
              Address Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Street Line 1
                </label>
                <input
                  type="text"
                  value={formData.streetLine1}
                  onChange={(e) =>
                    setFormData({ ...formData, streetLine1: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Street address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Street Line 2 (Apt, Suite, Floor, etc.)
                </label>
                <input
                  type="text"
                  value={formData.streetLine2}
                  onChange={(e) =>
                    setFormData({ ...formData, streetLine2: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Apt, Suite, Floor, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="City"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  State / Province
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="State/Province"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={formData.postCode}
                  onChange={(e) =>
                    setFormData({ ...formData, postCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="12345"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.countryCode}
                  onChange={(e) =>
                    setFormData({ ...formData, countryCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="US, CA, UK, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => handleLinkedInUrlChange(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                    linkedinUrlError
                      ? "border-red-300 focus:ring-red-500"
                      : "border-slate-300 focus:ring-blue-500"
                  }`}
                  placeholder="https://linkedin.com/in/username"
                />
                {linkedinUrlError && (
                  <p className="mt-1 text-xs text-red-600">
                    {linkedinUrlError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Additional Context */}
          <div className="space-y-4">
            <h3 className="text-md font-medium text-slate-900 border-b border-slate-200 pb-2">
              Additional Information
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <span>Special Notes</span>
                <span className="relative inline-flex items-center group">
                  <Info
                    className="h-4 w-4 text-slate-400 cursor-help"
                    tabIndex={0}
                    aria-label="Add notes about the recipient to help us tailor the copy on their Magic Card."
                  />
                  <span className="absolute top-full mt-1 left-0 z-20 hidden group-hover:block group-focus-within:block w-64 whitespace-normal break-words text-left rounded bg-slate-900 text-white text-xs px-2 py-1 shadow-lg">
                    Add notes about the recipient to help us tailor the copy on their Magic Card.
                  </span>
                </span>
              </label>
              <textarea
                value={formData.additionalContactContext}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additionalContactContext: e.target.value,
                  })
                }
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="loves to surf, lives bi-coastal, training for a marathon"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-2 rounded-md font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isUploadingHeadshots || isUploadingLogos}
            >
              {isLoading || isUploadingHeadshots || isUploadingLogos ? (
                <span className="flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </span>
              ) : contact ? (
                "Save Changes"
              ) : (
                "Save Recipient"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ContactModal;
