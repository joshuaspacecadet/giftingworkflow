import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  CheckCircle,
  AlertCircle,
  FileText,
  Palette,
  Filter,
  Hash,
  Search,
  ExternalLink,
  Calendar,
  Upload,
} from "lucide-react";
import { Project, ProjectStage, Contact } from "../types";
import { AirtableService } from "../services/airtable";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import { PREDEFINED_CONTACT_CREATORS } from "../config/airtable";
import FunnelStage from "../components/FunnelStage";
import ContactCard from "../components/ContactCard";
import ContactModal from "../components/ContactModal";
import ContactCopyEditor from "../components/ContactCopyEditor";
import ContactDesignRoundEditor from "../components/ContactDesignRoundEditor";
import DesignBriefDisplay from "../components/DesignBriefDisplay";
import FinalDesignFileUploader from "../components/FinalDesignFileUploader";
import ProjectFieldEditor from "../components/ProjectFieldEditor";

// Inline Invoice Uploader for Stage 8
const InvoiceUploader: React.FC<{
  project: Project;
  onSaved: (project: Project) => void;
}> = ({ project, onSaved }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    setErrorMessage("");
    try {
      const uploaded = [] as { url: string; filename: string }[];
      for (const file of files) {
        const url = await uploadToCloudinary(file);
        uploaded.push({ url, filename: file.name });
      }
      const existing = (project.invoice || []).map((f) => ({ url: f.url, filename: f.filename }));
      const updated = await AirtableService.updateProject(project.id, {
        invoice: [...existing, ...uploaded] as unknown as import("../types").AirtableAttachment[],
      });
      if (updated) onSaved(updated);
      e.target.value = "";
    } catch (err) {
      setErrorMessage("Failed to upload invoice. Please try again.");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    // mimic input select
    const fakeEvent = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>;
    await handleSelect(fakeEvent);
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 max-w-lg mx-auto">
      <h4 className="text-lg font-semibold text-slate-900 mb-2">Upload Print & Fulfillment Invoice</h4>
      {errorMessage && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">{errorMessage}</div>
      )}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"} ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
        <p className="text-lg font-medium text-slate-900 mb-1">Drop invoice here or click to browse</p>
        <p className="text-sm text-slate-600 mb-3">Supports PDF and image files (max 5MB each)</p>
        <input
          id="invoice-upload"
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          onChange={handleSelect}
          disabled={isUploading}
        />
        <label htmlFor="invoice-upload" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
          {isUploading ? "Uploading..." : "Choose File(s)"}
        </label>
      </div>
      {project.invoice && project.invoice.length > 0 && (
        <div className="mt-4 text-left">
          <p className="text-sm text-slate-700 mb-2">Uploaded Invoice(s)</p>
          <ul className="list-disc list-inside space-y-1">
            {project.invoice.map((file, idx) => (
              <li key={file.id || `${file.url}-${idx}`}>
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">
                  {file.filename || `Invoice ${idx + 1}`}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ProjectFunnelPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Project and contacts state
  const [project, setProject] = useState<Project | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  // Capture the baseline of items that were already sent BEFORE this project session
  // No longer need baseline booleans; we will rely on per-item linked projects
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contact modal state
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Filter state for contacts
  const [selectedFilterCreator, setSelectedFilterCreator] =
    useState<string>("");
  const [selectedDesignCreatorFilter, setSelectedDesignCreatorFilter] =
    useState<string>("");
  // Stage 1: toggle to show/hide completed contacts (Approve / Send Later / Remove)
  const [showCompletedContacts, setShowCompletedContacts] = useState<boolean>(false);

  // Add Existing modal state
  const [isAddExistingOpen, setIsAddExistingOpen] = useState<boolean>(false);
  const [existingSearch, setExistingSearch] = useState<string>("");
  const [isSearchingExisting, setIsSearchingExisting] = useState<boolean>(false);
  const [existingResults, setExistingResults] = useState<Contact[]>([]);
  const [addExistingError, setAddExistingError] = useState<string>("");
  // All contacts dataset for Add Existing modal
  const [allContactsDataset, setAllContactsDataset] = useState<Contact[]>([]);
  const [isLoadingAllContacts, setIsLoadingAllContacts] = useState<boolean>(false);
  // Filters: show who has NOT been sent these items (ever)
  const [filterNotMagic, setFilterNotMagic] = useState<boolean>(false);
  const [filterNotSfs, setFilterNotSfs] = useState<boolean>(false);
  const [filterNotGolden, setFilterNotGolden] = useState<boolean>(false);

  // When opening the Add Existing modal, load all contacts once
  useEffect(() => {
    const loadAll = async () => {
      if (!isAddExistingOpen) return;
      setAddExistingError("");
      setIsLoadingAllContacts(true);
      try {
        const all = await AirtableService.getContacts();
        // Sort by name ascending
        const sorted = [...all].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAllContactsDataset(sorted);
      } catch (e) {
        console.error('Failed to load all contacts for Add Existing', e);
        setAddExistingError('Failed to load contacts.');
      } finally {
        setIsLoadingAllContacts(false);
      }
    };
    loadAll();
  }, [isAddExistingOpen]);

  // Compute filtered results client-side from dataset, search, and filters
  const filteredExistingResults = useMemo(() => {
    const q = existingSearch.trim().toLowerCase();
    return (allContactsDataset || []).filter((c) => {
      const matchesQuery = !q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q);
      if (!matchesQuery) return false;
      const notSentMagic = (c.magicCardsProjects || []).length === 0;
      const notSentSfs = (c.sfsBookProjects || []).length === 0;
      const notSentGolden = (c.goldenRecordProjects || []).length === 0;
      if (filterNotMagic && !notSentMagic) return false;
      if (filterNotSfs && !notSentSfs) return false;
      if (filterNotGolden && !notSentGolden) return false;
      return true;
    });
  }, [allContactsDataset, existingSearch, filterNotMagic, filterNotSfs, filterNotGolden]);

  // Refs for scrolling to stages
  const contactsStageRef = useRef<HTMLDivElement>(null);
  const copyStageRef = useRef<HTMLDivElement>(null);
  const designBriefStageRef = useRef<HTMLDivElement>(null);
  const designRound1StageRef = useRef<HTMLDivElement>(null);
  const designRound2StageRef = useRef<HTMLDivElement>(null);
  const handoffStageRef = useRef<HTMLDivElement>(null);
  const readyForPrintStageRef = useRef<HTMLDivElement>(null);
  const projectCompleteStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [projectData] = await Promise.all([
        AirtableService.getProject(projectId),
      ]);

      if (!projectData) {
        setError("Project not found");
        return;
      }

      setProject(projectData);

      // Filter contacts to only those linked to this project
      if (projectData.linkedContacts && projectData.linkedContacts.length > 0) {
        const linkedContacts = await AirtableService.getContactsByIds(
          projectData.linkedContacts
        );
        setContacts(linkedContacts);
      } else {
        setContacts([]);
      }
    } catch (error) {
      console.error("Error loading project data:", error);
      setError("Failed to load project data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdvanceStage = async () => {
    if (!project) return;

    const stageOrder: ProjectStage[] = [
      "Contacts",
      "Copy",
      "Design Brief",
      "Design Round 1",
      "Design Round 2",
      "Handoff",
      "Ready for Print",
      "Project Complete",
    ];

    const currentIndex = stageOrder.indexOf(project.stage);
    if (currentIndex < stageOrder.length - 1) {
      let nextStage = stageOrder[currentIndex + 1];

      // If completing Stage 4 (Design Round 1) and there are no rejected designs,
      // skip Stage 5 and advance directly to Stage 6 (Handoff)
      if (project.stage === "Design Round 1") {
        const anyRejectedInRound1 = contacts.some(
          (c) => c.contactReview === 'Approve' && (c.magicCardsProjects || []).includes(project.id) && !!c.rejectRound1
        );
        if (!anyRejectedInRound1) {
          nextStage = "Handoff";
        }
      }

      try {
        const updatedProject = await AirtableService.updateProject(project.id, {
          stage: nextStage,
        });
        if (updatedProject) {
          setProject(updatedProject);

          // Scroll to the new active stage after a short delay
          setTimeout(() => {
            scrollToStage(nextStage);
          }, 300);
        }
      } catch (error) {
        console.error("Error advancing stage:", error);
      }
    }
  };

  // Deprecated: kept for reference; revert is now handled contextually via getRevertTopActions

  const handleRevertToStage = async (targetStage: ProjectStage) => {
    if (!project) return;
    try {
      const updatedProject = await AirtableService.updateProject(project.id, {
        stage: targetStage,
      });
      if (updatedProject) {
        setProject(updatedProject);
        setTimeout(() => {
          scrollToStage(targetStage);
        }, 300);
      }
    } catch (error) {
      console.error("Error reverting stage:", error);
    }
  };

  const getRevertTopActions = (stage: ProjectStage): React.ReactNode => {
    if (!project) return null;
    const stageOrder: ProjectStage[] = [
      "Contacts",
      "Copy",
      "Design Brief",
      "Design Round 1",
      "Design Round 2",
      "Handoff",
      "Ready for Print",
      "Project Complete",
    ];
    const currentIndex = stageOrder.indexOf(project.stage);
    if (currentIndex <= 0) return null;
    const previousStage = stageOrder[currentIndex - 1];
    // Detect if Stage 5 (Design Round 2) was skipped due to no Round I rejections
    const anyRejectedInRound1_global = contacts.some(
      (c) => c.contactReview === 'Approve' && !!c.magicCards && !!c.rejectRound1
    );
    const stage5Skipped_global =
      !anyRejectedInRound1_global && currentIndex >= stageOrder.indexOf("Handoff");

    // Allow actions on:
    // - The immediately previous stage (normal behavior)
    // - Stage 4 header too, if Stage 5 was skipped (so user can revert to Stage 4)
    const allowForStage =
      previousStage === stage ||
      (stage5Skipped_global && project.stage === "Handoff" && stage === "Design Round 1");
    if (!allowForStage) return null;
    // If the previous stage is Design Round 2 but it was skipped due to no Round I rejections,
    // show an informational label instead of a revert button.
    const stageNumber = stageOrder.indexOf(stage) + 1;
    const label = `Revert to Stage ${stageNumber}`;
    // If Stage 5 was skipped: on Stage 5 header show italic notice only (no button)
    if (stage === "Design Round 2" && stage5Skipped_global) {
      return (
        <span className="italic text-slate-600 text-xs">
          Stage skipped: no need for second round of review
        </span>
      );
    }

    // If Stage 5 was skipped and we're on Stage 4 header, show only the revert button to Stage 4
    if (stage === "Design Round 1" && stage5Skipped_global) {
      return (
        <button
          onClick={() => handleRevertToStage(stage)}
          className="px-2 py-1 text-xs rounded border bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
        >
          {label}
        </button>
      );
    }

    return (
      <button
        onClick={() => handleRevertToStage(stage)}
        className="px-2 py-1 text-xs rounded border bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
      >
        {label}
      </button>
    );
  };

  const scrollToStage = (stage: ProjectStage) => {
    const stageRefs = {
      Contacts: contactsStageRef,
      Copy: copyStageRef,
      "Design Brief": designBriefStageRef,
      "Design Round 1": designRound1StageRef,
      "Design Round 2": designRound2StageRef,
      Handoff: handoffStageRef,
      "Ready for Print": readyForPrintStageRef,
      "Project Complete": projectCompleteStageRef,
    };

    const targetRef = stageRefs[stage];
    if (targetRef?.current) {
      targetRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    }
  };

  const shouldRenderStage = (stage: ProjectStage): boolean => {
    if (!project) return false;

    const stageOrder: ProjectStage[] = [
      "Contacts",
      "Copy",
      "Design Brief",
      "Design Round 1",
      "Design Round 2",
      "Handoff",
      "Ready for Print",
      "Project Complete",
    ];

    const currentIndex = stageOrder.indexOf(project.stage);
    const stageIndex = stageOrder.indexOf(stage);

    return stageIndex <= currentIndex;
  };

  const isStageActive = (stage: ProjectStage): boolean => {
    return project?.stage === stage;
  };

  const isStageCompleted = (stage: ProjectStage): boolean => {
    if (!project) return false;

    const stageOrder: ProjectStage[] = [
      "Contacts",
      "Copy",
      "Design Brief",
      "Design Round 1",
      "Design Round 2",
      "Handoff",
      "Ready for Print",
      "Project Complete",
    ];

    const currentIndex = stageOrder.indexOf(project.stage);
    const stageIndex = stageOrder.indexOf(stage);

    return stageIndex < currentIndex;
  };

  const handleCreateContact = () => {
    setEditingContact(undefined);
    setIsContactModalOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setIsContactModalOpen(true);
  };

  const handleSaveContact = async (
    contactData: Partial<Contact>
  ): Promise<Contact | null> => {
    if (!project) return null;

    console.log("handleSaveContact called with:", {
      contactData,
      editingContact,
    });

    setIsSavingContact(true);
    try {
      let savedContact: Contact | null = null;

      // If the modal selected an existing contact (by id), update that record instead of creating new
      const targetContactId = (contactData as any).id || editingContact?.id;

      if (targetContactId) {
        // Update existing contact
        console.log("Updating existing contact:", targetContactId);
        savedContact = await AirtableService.updateContact(targetContactId, contactData);
        if (savedContact) {
          console.log("Contact updated successfully:", savedContact);
          setContacts((prev) => {
            const updated = prev.map((c) =>
              c.id === targetContactId ? savedContact! : c
            );
            console.log("[DEBUG] Updated contacts after edit:", updated);
            return updated;
          });
          setEditingContact(savedContact);

          // Ensure selected existing contact is linked to the project
          const alreadyLinked = (project.linkedContacts || []).includes(targetContactId);
          if (!alreadyLinked) {
            const linkSuccess = await AirtableService.linkContactToProject(
              project.id,
              targetContactId
            );
            if (linkSuccess) {
              setProject((prev) =>
                prev
                  ? {
                      ...prev,
                      linkedContacts: [
                        ...(prev.linkedContacts || []),
                        targetContactId,
                      ],
                    }
                  : prev
              );
            }
          }
        }
      } else {
        // Create new contact
        console.log("Creating new contact");
        savedContact = await AirtableService.createContact(contactData);
        if (savedContact) {
          // Link the new contact to the project
          const linkSuccess = await AirtableService.linkContactToProject(
            project.id,
            savedContact.id
          );
          if (linkSuccess) {
            setContacts((prev) => {
              const updated = [...prev, savedContact!];
              console.log("[DEBUG] Updated contacts after create:", updated);
              return updated;
            });
            // Update project's linkedContacts in local state
            setProject((prev) =>
              prev
                ? {
                    ...prev,
                    linkedContacts: [
                      ...(prev.linkedContacts || []),
                      savedContact!.id,
                    ],
                  }
                : null
            );
            setEditingContact(savedContact);
          }
        }
      }

      if (savedContact) {
        // Reload contacts using the latest linkedContacts including this saved contact
        const currentLinked = project?.linkedContacts || [];
        const idsSet = new Set<string>(currentLinked);
        idsSet.add(savedContact.id);
        const linkedContacts = await AirtableService.getContactsByIds(
          Array.from(idsSet)
        );
        setContacts(linkedContacts);
        setIsContactModalOpen(false);
        setEditingContact(undefined); // Clear the editing contact
      }

      return savedContact;
    } catch (error) {
      console.error("Error saving contact:", error);
      return null;
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (
      !project ||
      !window.confirm("Are you sure you want to delete this contact?")
    )
      return;

    try {
      // First unlink from project
      const unlinkSuccess = await AirtableService.unlinkContactFromProject(
        project.id,
        contactId
      );
      if (unlinkSuccess) {
        // Then delete the contact
        const deleteSuccess = await AirtableService.deleteContact(contactId);
        if (deleteSuccess) {
          setContacts((prev) => prev.filter((c) => c.id !== contactId));
          // Update project's linkedContacts in local state
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  linkedContacts: (prev.linkedContacts || []).filter(
                    (id) => id !== contactId
                  ),
                }
              : null
          );
        }
      }
    } catch (error) {
      console.error("Error deleting contact:", error);
    }
  };

  const handleSaveContactCopy = async (
    contactId: string,
    copyData: Partial<Contact>
  ): Promise<boolean> => {
    try {
      const updatedContact = await AirtableService.updateContact(
        contactId,
        copyData
      );
      if (updatedContact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? updatedContact : c))
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error saving contact copy:", error);
      return false;
    }
  };

  const handleSaveContactDesignRound = async (
    contactId: string,
    updates: Partial<Contact>
  ): Promise<boolean> => {
    try {
      const updatedContact = await AirtableService.updateContact(
        contactId,
        updates
      );
      if (updatedContact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contactId ? updatedContact : c))
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error saving contact design round:", error);
      return false;
    }
  };

  const handleSaveProjectField = async (
    field: keyof Project,
    value: string
  ): Promise<boolean> => {
    if (!project) return false;

    try {
      const updates = { [field]: value };
      const updatedProject = await AirtableService.updateProject(
        project.id,
        updates
      );
      if (updatedProject) {
        setProject(updatedProject);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error saving project field:", error);
      return false;
    }
  };

  const handleSaveFinalDesignFiles = async (
    projectId: string,
    files: { url: string; filename: string }[]
  ): Promise<boolean> => {
    try {
      // Preserve existing attachments by ID and append any new ones by URL
      const existing = project?.illustratorFiles || [];
      const preserveById = existing.map((att) => ({ id: att.id }));
      const existingUrls = new Set(existing.map((a) => a.url));
      const toAdd = files
        .filter((f) => !existingUrls.has(f.url))
        .map((f) => ({ url: f.url, filename: f.filename }));

      const payload = [...preserveById, ...toAdd];

      const updatedProject = await AirtableService.updateProject(projectId, {
        illustratorFiles: payload as unknown as import("../types").AirtableAttachment[],
      });
      if (updatedProject) {
        setProject(updatedProject);
        // Validate Airtable persisted expected number of files
        const expectedCount = existing.length + toAdd.length;
        const actualCount = (updatedProject.illustratorFiles || []).length;
        return actualCount >= expectedCount;
      }
      return false;
    } catch (error) {
      console.error("Error saving final design files:", error);
      return false;
    }
  };

  // Filter contacts based on selected creator
  const getFilteredContacts = (
    filterCreator: string = selectedFilterCreator,
    includeCompleted: boolean = showCompletedContacts
  ) => {
    const byCreator = !filterCreator
      ? contacts
      : contacts.filter((contact) => contact.contactAddedBy === filterCreator);
    if (includeCompleted) return byCreator;
    return byCreator.filter((c) => {
      const status = c.contactReview;
      return !(status === 'Approve' || status === 'Send Later' || status === 'Remove');
    });
  };

  // Filter contacts for design rounds
  const getFilteredDesignContacts = (
    filterCreator: string = selectedDesignCreatorFilter
  ) => {
    const byCreator = !filterCreator
      ? contacts
      : contacts.filter((contact) => contact.contactAddedBy === filterCreator);
    // Only include contacts that are approved and have Magic Cards selected
    return byCreator.filter(
      (c) => c.contactReview === 'Approve' && (c.magicCardsProjects || []).includes(project!.id)
    );
  };

  // Helper: contacts eligible for copy/design brief (approved + Magic Cards)
  const getApprovedMagicContacts = () =>
    contacts.filter((c) => c.contactReview === 'Approve' && (c.magicCardsProjects || []).includes(project!.id));

  // Stage 1: status counts (respect creator filter if selected)
  const statusCounts = useMemo(() => {
    const base = selectedFilterCreator
      ? contacts.filter((c) => c.contactAddedBy === selectedFilterCreator)
      : contacts;
    return base.reduce(
      (acc, c) => {
        if (c.contactReview === 'Approve') acc.approve += 1;
        if (c.contactReview === 'Send Later') acc.sendLater += 1;
        if (c.contactReview === 'Remove') acc.remove += 1;
        return acc;
      },
      { approve: 0, sendLater: 0, remove: 0 }
    );
  }, [contacts, selectedFilterCreator]);

  // Stage 1: All contacts must be reviewed (Approve / Send Later / Remove)
  const allContactsReviewed = useMemo(() => {
    if (contacts.length === 0) return false;
    return contacts.every(
      (c) => c.contactReview === 'Approve' || c.contactReview === 'Send Later' || c.contactReview === 'Remove'
    );
  }, [contacts]);

  // CSV generation for Stage 7
  const contactsCsvDataUri = useMemo(() => {
    const escapeCsv = (value: string | undefined) => {
      const str = (value ?? "").toString();
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    const headers = [
      "Full Name",
      "Company",
      "Street Line 1",
      "Street Line 2 (Apt, Suite, Floor, etc.)",
      "City",
      "State / Province",
      "Postal Code",
      "Country",
      "LinkedIn URL",
      "Magic Cards",
      "SFS Book",
      "Golden Record",
    ];
    const headerLine = headers.map((h) => escapeCsv(h)).join(",");
    // Only include approved contacts in the CSV
    const approved = contacts.filter((c) => c.contactReview === 'Approve');
    const rows = approved.map((c) => [
      escapeCsv(c.name),
      escapeCsv(c.company),
      escapeCsv(c.streetLine1),
      escapeCsv(c.streetLine2),
      escapeCsv(c.city),
      escapeCsv(c.state),
      escapeCsv(c.postCode),
      escapeCsv(c.countryCode),
      escapeCsv(c.linkedinUrl),
      escapeCsv((c.magicCardsProjects || []).includes(project!.id) ? "1" : ""),
      escapeCsv((c.sfsBookProjects || []).includes(project!.id) ? "1" : ""),
      escapeCsv((c.goldenRecordProjects || []).includes(project!.id) ? "1" : ""),
    ].join(","));
    const csv = [headerLine, ...rows].join("\r\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [contacts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <div className="bg-white rounded-xl p-8 border border-slate-200 max-w-md mx-auto">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {error || "Project not found"}
          </h3>
          <p className="text-slate-600 mb-6">
            The project you're looking for doesn't exist or couldn't be loaded.
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Back to Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Local component for invoice upload */}
      {null}
      {/* Stage 1: Contacts */}
      {shouldRenderStage("Contacts") && (
        <FunnelStage
          ref={contactsStageRef}
          title="Stage 1 — Add & Review Contacts"
          description="Add and manage the gift recipients."
          isActive={isStageActive("Contacts")}
          isCompleted={isStageCompleted("Contacts")}
          topActions={getRevertTopActions("Contacts")}
        >
          <div className="space-y-6">
            {/* Contact Management Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div className="flex items-center space-x-4">
                {PREDEFINED_CONTACT_CREATORS.length > 0 && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Filter className="h-4 w-4 text-slate-500" />
                      <label
                        htmlFor="contact-filter"
                        className="text-sm font-medium text-slate-700"
                      >
                        Review contacts as:
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      {PREDEFINED_CONTACT_CREATORS.map((creator) => {
                        const isSelected = selectedFilterCreator === creator;
                        return (
                          <button
                            key={creator}
                            type="button"
                            onClick={() =>
                              setSelectedFilterCreator(
                                isSelected ? "" : creator
                              )
                            }
                            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                            }`}
                            title={`Review contacts as ${creator}`}
                          >
                            {creator}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {/* Show/Hide completed toggle */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-slate-700">Show completed</span>
                  <button
                    type="button"
                    aria-pressed={showCompletedContacts}
                    onClick={() => setShowCompletedContacts((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      showCompletedContacts ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                    title={showCompletedContacts ? 'Showing approved/held/removed' : 'Hiding approved/held/removed'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        showCompletedContacts ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {/* Status counts */}
                <div className="hidden sm:flex items-center flex-wrap gap-2 ml-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] bg-green-50 text-green-700 border-green-200">Approved: {statusCounts.approve}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] bg-yellow-50 text-yellow-700 border-yellow-200">Send Later: {statusCounts.sendLater}</span>
                </div>
              </div>
              {/* Status counts (mobile) */}
              <div className="sm:hidden w-full -mt-2">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] bg-green-50 text-green-700 border-green-200">Approved: {statusCounts.approve}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] bg-yellow-50 text-yellow-700 border-yellow-200">Send Later: {statusCounts.sendLater}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <button
                  onClick={() => setIsAddExistingOpen(true)}
                  className="inline-flex items-center justify-center gap-2 h-9 px-3 text-sm bg-white text-slate-700 rounded-md border border-slate-300 hover:bg-slate-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isStageCompleted("Contacts")}
                >
                  <Search className="h-4 w-4" />
                  <span>Add Existing</span>
                </button>

                <button
                  onClick={handleCreateContact}
                  className="inline-flex items-center justify-center gap-2 h-9 px-3 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isStageCompleted("Contacts")}
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Recipient</span>
                </button>
              </div>
            </div>

            {/* Contacts Grid */}
            {getFilteredContacts().length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  {selectedFilterCreator
                    ? "No contacts found for this creator"
                    : "No contacts added yet"}
                </h3>
                <p className="text-slate-600 mb-6">
                  {selectedFilterCreator
                    ? "Try selecting a different creator or clear the filter to see all contacts."
                    : "Add your first contact to get started with this project."}
                </p>
                {!selectedFilterCreator && (
                  <button
                    onClick={handleCreateContact}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Add First Contact
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getFilteredContacts().map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onEdit={handleEditContact}
                    onDelete={handleDeleteContact}
                    onUpdate={async (contactId, updates) => {
                      try {
                        const updated = await AirtableService.updateContact(contactId, updates);
                        if (updated) {
                          setContacts((prev) => prev.map((c) => (c.id === contactId ? updated : c)));
                        }
                      } catch (e) {
                        console.error('Quick update failed', e);
                      }
                    }}
                    isStageLocked={isStageCompleted("Contacts")}
                    currentProjectId={project.id}
                    onRemoveFromProject={async (contactId) => {
                      // Also remove current project from any item link arrays on the contact
                      try {
                        const mc = (contact.magicCardsProjects || []).filter((id) => id !== project.id);
                        const sfs = (contact.sfsBookProjects || []).filter((id) => id !== project.id);
                        const gr = (contact.goldenRecordProjects || []).filter((id) => id !== project.id);
                        await AirtableService.updateContact(contactId, {
                          magicCardsProjects: mc as any,
                          sfsBookProjects: sfs as any,
                          goldenRecordProjects: gr as any,
                        });
                      } catch (e) {
                        console.error('Failed to clear item links for contact', e);
                      }
                      // Unlink contact from this project
                      try {
                        await AirtableService.unlinkContactFromProject(project.id, contactId);
                      } catch (e) {
                        console.error('Unlink contact from project failed', e);
                      }
                      // Remove from local list
                      setContacts((prev) => prev.filter((c) => c.id !== contactId));
                    }}
                  />
                ))}
              </div>
            )}

            {/* Stage Completion */}
            {isStageActive("Contacts") && contacts.length > 0 && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  disabled={!allContactsReviewed}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Contacts Stage</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 2: Copy */}
      {shouldRenderStage("Copy") && (
        <FunnelStage
          ref={copyStageRef}
          title="Stage 2 — Manage Magic Card Copy"
          description="Create and review the copy content for each contact's Magic Card."
          isActive={isStageActive("Copy")}
          isCompleted={isStageCompleted("Copy")}
          topActions={getRevertTopActions("Copy")}
        >
          <div className="space-y-6">
            {getApprovedMagicContacts().length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  No contacts available
                </h3>
                <p className="text-slate-600">
                  Add and approve recipients with Magic Cards selected before proceeding with copy creation.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {getApprovedMagicContacts().map((contact) => (
                  <ContactCopyEditor
                    key={contact.id}
                    contact={contact}
                    onSave={handleSaveContactCopy}
                    isReadOnly={isStageCompleted("Copy")}
                  />
                ))}
              </div>
            )}

            {/* Stage Completion */}
            {isStageActive("Copy") && getApprovedMagicContacts().length > 0 && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Copy Stage</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 3: Design Brief */}
      {shouldRenderStage("Design Brief") && (
        <FunnelStage
          ref={designBriefStageRef}
          title="Stage 3 — Magic Card Design Brief"
          description="Review the design brief that will guide the creation of each contact's Magic Card."
          isActive={isStageActive("Design Brief")}
          isCompleted={isStageCompleted("Design Brief")}
          topActions={getRevertTopActions("Design Brief")}
        >
          <div className="space-y-6">
            {getApprovedMagicContacts().length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                <Palette className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  No contacts available
                </h3>
                <p className="text-slate-600">
                  Add and approve recipients with Magic Cards selected before generating the design brief.
                </p>
              </div>
            ) : (
              <DesignBriefDisplay project={project} contacts={getApprovedMagicContacts()} />
            )}

            {/* Stage Completion */}
            {isStageActive("Design Brief") && getApprovedMagicContacts().length > 0 && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Design Brief Stage</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 4: Design Round 1 */}
      {shouldRenderStage("Design Round 1") && (
        <FunnelStage
          ref={designRound1StageRef}
          title="Stage 4 — Review & Approve Magic Card Designs (Round I)"
          description="Upload and review the first round of design concepts for each contact."
          isActive={isStageActive("Design Round 1")}
          isCompleted={isStageCompleted("Design Round 1")}
          topActions={getRevertTopActions("Design Round 1")}
        >
          <div className="space-y-6">
            {/* Design Creator Filter */}
            {PREDEFINED_CONTACT_CREATORS.length > 0 && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <label
                    htmlFor="design-creator-filter"
                    className="text-sm font-medium text-slate-700"
                  >
                    Review designs as:
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {PREDEFINED_CONTACT_CREATORS.map((creator) => {
                    const isSelected = selectedDesignCreatorFilter === creator;
                    return (
                      <button
                        key={creator}
                        type="button"
                        onClick={() =>
                          setSelectedDesignCreatorFilter(
                            isSelected ? "" : creator
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                        title={`Review designs as ${creator}`}
                      >
                        {creator}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {getFilteredDesignContacts().length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                <Palette className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  {selectedDesignCreatorFilter
                    ? "No contacts found for this creator"
                    : "No contacts available"}
                </h3>
                <p className="text-slate-600">
                  {selectedDesignCreatorFilter
                    ? "Try selecting a different creator or clear the filter to see all contacts."
                    : "Complete previous stages to proceed with design reviews."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {getFilteredDesignContacts().map((contact) => (
                  <ContactDesignRoundEditor
                    key={contact.id}
                    contact={contact}
                    onSave={handleSaveContactDesignRound}
                    isReadOnly={isStageCompleted("Design Round 1")}
                    roundNumber={1}
                  />
                ))}
              </div>
            )}

            {/* Stage Completion */}
            {isStageActive("Design Round 1") && getFilteredDesignContacts().length > 0 && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Design Round 1</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 5: Design Round 2 */}
      {shouldRenderStage("Design Round 2") && (
        <FunnelStage
          ref={designRound2StageRef}
          title="Stage 5 — Review & Approve Magic Card Designs (Round II)"
          description="Upload and review the second round of design revisions for each contact."
          isActive={isStageActive("Design Round 2")}
          isCompleted={isStageCompleted("Design Round 2")}
          topActions={getRevertTopActions("Design Round 2")}
        >
          <div className="space-y-6">
            {/* Design Creator Filter */}
            {PREDEFINED_CONTACT_CREATORS.length > 0 && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <label
                    htmlFor="design-creator-filter-round2"
                    className="text-sm font-medium text-slate-700"
                  >
                    Review designs as:
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {PREDEFINED_CONTACT_CREATORS.map((creator) => {
                    const isSelected = selectedDesignCreatorFilter === creator;
                    return (
                      <button
                        key={creator}
                        type="button"
                        onClick={() =>
                          setSelectedDesignCreatorFilter(
                            isSelected ? "" : creator
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                        title={`Review designs as ${creator}`}
                      >
                        {creator}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

              {getFilteredDesignContacts().filter((c) => c.rejectRound1).length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                <Palette className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  {selectedDesignCreatorFilter
                    ? "No rejected designs found for this creator"
                    : "No designs to review in Round II"}
                </h3>
                <p className="text-slate-600">
                  {selectedDesignCreatorFilter
                    ? "Try selecting a different creator or clear the filter. Only designs rejected in Round I appear here."
                    : "Only designs rejected in Round I are shown here."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {getFilteredDesignContacts()
                  .filter((c) => c.rejectRound1)
                  .map((contact) => (
                  <ContactDesignRoundEditor
                    key={contact.id}
                    contact={contact}
                    onSave={handleSaveContactDesignRound}
                    isReadOnly={isStageCompleted("Design Round 2")}
                    roundNumber={2}
                  />
                  ))}
              </div>
            )}

            {/* Stage Completion */}
            {isStageActive("Design Round 2") && getFilteredDesignContacts().filter((c) => c.rejectRound1).length > 0 && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Design Round 2</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 6: Handoff */}
      {shouldRenderStage("Handoff") && (
        <FunnelStage
          ref={handoffStageRef}
          title="Stage 6 — Upload Final Magic Card Design File(s)"
          description="Upload the final design files that are ready for production."
          isActive={isStageActive("Handoff")}
          isCompleted={isStageCompleted("Handoff")}
          topActions={getRevertTopActions("Handoff")}
        >
          <div className="space-y-6">
            <FinalDesignFileUploader
              project={project}
              onSave={handleSaveFinalDesignFiles}
              isReadOnly={isStageCompleted("Handoff")}
            />

            {/* Stage Completion */}
            {isStageActive("Handoff") && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Complete Handoff Stage</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 7: Ready for Print */}
      {shouldRenderStage("Ready for Print") && (
        <FunnelStage
          ref={readyForPrintStageRef}
          title="Stage 7 — Ready for Print & Fulfillment"
          description="Review and finalize all files and details before sending to print and fulfillment."
          isActive={isStageActive("Ready for Print")}
          isCompleted={isStageCompleted("Ready for Print")}
          topActions={getRevertTopActions("Ready for Print")}
        >
          <div className="space-y-6">
            {/* Top row: Final Designs | Contacts CSV */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Final Designs Card */}
              <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5 text-blue-600" />
                  <h4 className="text-lg font-semibold text-slate-900">Final Designs</h4>
                </div>

                <div className="space-y-2">
                  {project.finalDesignFileLink && (
                    <div>
                      <p className="text-sm text-slate-600 mb-1">External Final Design Link</p>
                      <a
                        href={project.finalDesignFileLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 underline break-all"
                      >
                        {project.finalDesignFileLink}
                      </a>
                    </div>
                  )}

                  {!project.finalDesignFileLink && (
                    <p className="text-sm text-slate-500">No final designs linked yet. Add the link in Stage 6.</p>
                  )}
                </div>
              </div>

              {/* Recipients CSV Card */}
              <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5 text-blue-600" />
                  <h4 className="text-lg font-semibold text-slate-900">Recipients CSV</h4>
                </div>
                <p className="text-sm text-slate-600">Download a CSV of all recipients for fulfillment.</p>
                <a
                  href={contactsCsvDataUri}
                  download={`contacts_${project.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'project'}.csv`}
                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Download Recipients CSV
                </a>
              </div>
            </div>

            {/* Bottom row: Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ProjectFieldEditor
                label="Printer Submission Date"
                value={project.printerSubmissionDate || ""}
                onSave={(value) =>
                  handleSaveProjectField("printerSubmissionDate", value)
                }
                type="date"
                placeholder="Select submission date"
                icon={<Calendar className="h-4 w-4" />}
                disabled={isStageCompleted("Ready for Print")}
              />

              <ProjectFieldEditor
                label="Orders Fulfillment Date"
                value={project.shippedToPacksmithDate || ""}
                onSave={(value) =>
                  handleSaveProjectField("shippedToPacksmithDate", value)
                }
                type="date"
                placeholder="Select fulfillment date"
                icon={<Calendar className="h-4 w-4" />}
                disabled={isStageCompleted("Ready for Print")}
              />
            </div>

            {/* Stage Completion */}
            {isStageActive("Ready for Print") && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleAdvanceStage}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Mark Project Complete</span>
                </button>
              </div>
            )}
          </div>
        </FunnelStage>
      )}

      {/* Stage 8: Project Complete */}
      {shouldRenderStage("Project Complete") && (
        <FunnelStage
          ref={projectCompleteStageRef}
          title="Stage 8 — Completed"
          description="This project has been successfully completed and shipped."
          isActive={isStageActive("Project Complete")}
          isCompleted={false}
          topActions={getRevertTopActions("Project Complete")}
        >
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Project Successfully Completed!
            </h3>
            <p className="text-slate-600 mb-6">
              All custom cards have been designed, produced, and shipped.
            </p>
            <InvoiceUploader project={project} onSaved={setProject} />
          </div>
        </FunnelStage>
      )}

      {/* Contact Modal */}
      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        onSave={handleSaveContact}
        contact={editingContact}
        isLoading={isSavingContact}
        availableCreators={PREDEFINED_CONTACT_CREATORS}
        currentProjectId={project.id}
      />

      {/* Add Existing Modal */}
      {isAddExistingOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
          onClick={() => setIsAddExistingOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Add Existing Recipient</h4>
              <button
                onClick={() => setIsAddExistingOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-3">Search by name or company. You can add an existing contact to this project's recipient list. Their review status will be cleared.</p>
            <div className="flex flex-col gap-2 mb-3">
              {/* Filters row */}
              <div className="flex items-center gap-4 text-xs text-slate-700">
                <span className="font-medium">Show only contacts who have not been sent:</span>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterNotMagic} onChange={(e) => setFilterNotMagic(e.target.checked)} />
                  <span>Magic Cards</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterNotSfs} onChange={(e) => setFilterNotSfs(e.target.checked)} />
                  <span>SFS Book</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterNotGolden} onChange={(e) => setFilterNotGolden(e.target.checked)} />
                  <span>Golden Record</span>
                </label>
              </div>
              {/* Search row */}
              <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      // No remote search; results compute automatically
                      e.preventDefault();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search recipients by name or company"
                />
              </div>
              <button
                onClick={() => { /* client-side filter updates automatically */ }}
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply
              </button>
              </div>
            </div>
            {addExistingError && (
              <div className="text-xs text-red-600 mb-2">{addExistingError}</div>
            )}
            <div className="max-h-[50vh] overflow-auto border border-slate-200 rounded">
              {isLoadingAllContacts ? (
                <div className="p-4 text-sm text-slate-500">Loading contacts…</div>
              ) : filteredExistingResults.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No matching contacts.</div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {filteredExistingResults.map((c) => {
                    const alreadyLinked = (project.linkedContacts || []).includes(c.id);
                    const alreadySent: { label: string; sent: boolean }[] = [
                      { label: 'Magic Cards', sent: (c.magicCardsProjects || []).length > 0 },
                      { label: 'SFS Book', sent: (c.sfsBookProjects || []).length > 0 },
                      { label: 'Golden Record', sent: (c.goldenRecordProjects || []).length > 0 },
                      { label: 'Cards Against', sent: ((c as any).cardsAgainstRealityProjects || []).length > 0 },
                      { label: 'Fund II Video', sent: ((c as any).fundIiVideoProjects || []).length > 0 },
                    ].filter((i) => i.sent);
                    return (
                      <li key={c.id} className="p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-slate-900 truncate">{c.name}</div>
                            {c.company && (
                              <div className="text-xs text-slate-600 truncate">• {c.company}</div>
                            )}
                          </div>
                          {alreadySent.length > 0 && (
                            <div className="mt-1 text-[11px] text-slate-700">
                              <span className="mr-1">Already sent:</span>
                              <span className="inline-flex flex-wrap gap-1 align-middle">
                                {alreadySent.map((i, idx) => (
                                  <span key={`${c.id}-sent-${idx}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                    {i.label}
                                  </span>
                                ))}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          <button
                            className={`px-2.5 py-1 text-xs rounded border font-medium ${alreadyLinked ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'}`}
                            disabled={alreadyLinked}
                            onClick={async () => {
                              if (!project) return;
                              try {
                                // Clear review status and feedback
                                await AirtableService.updateContact(c.id, { contactReview: null as any, contactReviewFeedback: '' });
                                // Link to project
                                const success = await AirtableService.linkContactToProject(project.id, c.id);
                                if (success) {
                                  // Fetch latest contact record and update local state
                                  const [fresh] = await AirtableService.getContactsByIds([c.id]);
                                  if (fresh) {
                                    setContacts((prev) => {
                                      const exists = prev.some((pc) => pc.id === c.id);
                                      return exists ? prev.map((pc) => (pc.id === c.id ? fresh : pc)) : [...prev, fresh];
                                    });
                                    setProject((prev) => prev ? { ...prev, linkedContacts: Array.from(new Set([...(prev.linkedContacts || []), c.id])) } : prev);
                                  }
                                }
                              } catch (e) {
                                console.error('Failed to add existing contact', e);
                              }
                            }}
                          >
                            {alreadyLinked ? 'Added' : 'Add to Project'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={() => setIsAddExistingOpen(false)} className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectFunnelPage;
