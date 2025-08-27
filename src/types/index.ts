export interface Project {
  id: string;
  name: string;
  stage: ProjectStage;
  trackingNumber?: string;
  illustratorFiles?: AirtableAttachment[];
  finalDesignFileLink?: string; // New field for URL link
  invoice?: AirtableAttachment[];
  linkedContacts?: string[]; // Array of Contact record IDs
  printerSubmissionDate?: string;
  shippedToPacksmithDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  streetLine1?: string;
  streetLine2?: string;
  city?: string;
  state?: string;
  postCode?: string;
  countryCode?: string;
  companyLogo?: AirtableAttachment[];
  headshot?: AirtableAttachment[];
  linkedinUrl?: string;
  confirmAddressUrl?: string;
  additionalContactContext?: string;
  contactAddedBy?: string; // New field for who added the contact
  // Linked projects for each item (Airtable "Link to Projects" fields)
  magicCardsProjects?: string[];
  sfsBookProjects?: string[];
  goldenRecordProjects?: string[];
  // Legacy booleans kept optional for backward compatibility (should not be used going forward)
  magicCards?: boolean;
  sfsBook?: boolean;
  goldenRecord?: boolean;
  copyTitle1?: string;
  copyTitle2?: string;
  copyTitle3?: string;
  copyMainText?: string;
  imageDirection?: string;
  round1Draft?: AirtableAttachment[];
  round1DraftFeedback?: string;
  rejectRound1?: boolean;
  round2Draft?: AirtableAttachment[];
  round2DraftFeedback?: string;
  rejectRound2?: boolean;
  round3Draft?: AirtableAttachment[];
  contactReview?: 'Approve' | 'Send Later' | 'Remove';
  contactReviewFeedback?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
}

export type ProjectStage = 
  | 'Contacts'
  | 'Copy'
  | 'Design Brief'
  | 'Design Round 1'
  | 'Design Round 2'
  | 'Handoff'
  | 'Ready for Print'
  | 'Project Complete';

// Updated labels for the admin filter dropdown
export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  'Contacts': 'Contacts',
  'Copy': 'Copy',
  'Design Brief': 'Design Brief',
  'Design Round 1': 'Designs (Round I)',
  'Design Round 2': 'Designs (Round II)',
  'Handoff': 'Final Design File(s)',
  'Ready for Print': 'Production & Fulfillment',
  'Project Complete': 'Completed'
};

// Updated labels for the project cards - showing the full stage descriptions
export const PROJECT_STAGE_CARD_LABELS: Record<ProjectStage, string> = {
  'Contacts': 'Stage 1 — Add & Review Contacts',
  'Copy': 'Stage 2 — Manage Magic Card Copy',
  'Design Brief': 'Stage 3 — Magic Card Design Brief',
  'Design Round 1': 'Stage 4 — Review & Approve Magic Card Designs (Round I)',
  'Design Round 2': 'Stage 5 — Review & Approve Magic Card Designs (Round II)',
  'Handoff': 'Stage 6 — Upload Final Magic Card Design File(s)',
  'Ready for Print': 'Stage 7 — Ready for Print & Fulfillment',
  'Project Complete': 'Stage 8 — Completed'
};

export const PROJECT_STAGE_COLORS: Record<ProjectStage, string> = {
  'Contacts': 'bg-blue-100 text-blue-800',
  'Copy': 'bg-purple-100 text-purple-800',
  'Design Brief': 'bg-yellow-100 text-yellow-800',
  'Design Round 1': 'bg-orange-100 text-orange-800',
  'Design Round 2': 'bg-indigo-100 text-indigo-800',
  'Handoff': 'bg-green-100 text-green-800',
  'Ready for Print': 'bg-teal-100 text-teal-800',
  'Project Complete': 'bg-gray-100 text-gray-800'
};

// Legacy type alias for backward compatibility
export type ProjectStatus = ProjectStage;
export const PROJECT_STATUS_LABELS = PROJECT_STAGE_LABELS;
export const PROJECT_STATUS_COLORS = PROJECT_STAGE_COLORS;