import Airtable from "airtable";
import { airtableConfig } from "../config/airtable";
import { Project, Contact, ProjectStage, AirtableAttachment, SpecificStage } from "../types";

// Initialize Airtable
let base: Airtable.Base | null = null;

if (airtableConfig.apiKey && airtableConfig.baseId) {
  Airtable.configure({
    endpointUrl: "https://api.airtable.com",
    apiKey: airtableConfig.apiKey,
  });

  base = Airtable.base(airtableConfig.baseId);
}

// Helper function to transform Airtable record to Project
const transformAirtableProject = (record: any): Project => {
  const fields = record.fields;
  return {
    id: record.id,
    name: fields["Project"] || "",
    stage: fields["Stage"] || "Contacts",
    trackingNumber: fields["Tracking Number"] || "",
    illustratorFiles: fields["Final Design File"] || [],
    finalDesignFileLink: fields["Final Design File Link"] || "", // New field mapping
    invoice: fields["Invoice"] || [],
    linkedContacts: fields["Contacts"] || [], // Array of Contact record IDs
    printerSubmissionDate: fields["Printer Submission Date"] || "",
    shippedToPacksmithDate: fields["Orders Fulfillment Date"] || "",
    createdAt: fields["Created At"] || record._rawJson.createdTime,
    updatedAt: fields["Last Modified"] || record._rawJson.createdTime, // Use Last Modified field
  };
};

// Helper function to transform Airtable record to Contact
const transformAirtableContact = (record: any): Contact => {
  const fields = record.fields;
  console.log("Debug: transformAirtableContact - raw record fields:", fields);

  const transformedContact = {
    id: record.id,
    name: fields["Recipient Name*"] || "", // FIXED: Added asterisk to match actual field name
    company: fields["Company"] || "",
    firstMetDate: fields["First Met Date"] || "",
    email: fields["Email"] || "",
    phone: fields["Phone"] || "",
    streetLine1: fields["Street Line 1"] || "",
    streetLine2: fields["Street Line 2 (Unit Number)"] || "",
    city: fields["City"] || "",
    state: fields["State"] || "",
    postCode: fields["Post Code (5 digits)"] || "",
    countryCode: fields["Country Code"] || "",
    companyLogo: fields["Company Logo"] || [],
    headshot: fields["Headshot"] || [],
    linkedinUrl: fields["LinkedIn URL"] || "",
    confirmAddressUrl: fields["Confirm Address URL"] || "",
    additionalContactContext: fields["Additional Contact Context"] || "",
    contactAddedBy: fields["Contact Added By"] || "", // ADD THIS LINE
    specificStage: (fields["Specific Stage"] as SpecificStage) || undefined,
    draftOrderItems: fields["Draft Order Items"] || [],
    designFiles: (() => {
      const designField = fields["Design File"];
      if (Array.isArray(designField)) return designField;
      if (typeof designField === "string" && designField.trim()) {
        return [
          {
            id: "design-file-url",
            url: designField,
            filename: "Design File",
            size: 0,
            type: "",
          },
        ];
      }
      return [];
    })(),
    latestDesignDate: fields["Latest Design Date"] || "",
    latestDesignFeedback: fields["Latest Design Feedback"] || "",
    magicCardsProjects: (fields["Magic Cards"] || []) as string[],
    sfsBookProjects: (fields["SFS Book"] || []) as string[],
    goldenRecordProjects: (fields["Golden Record"] || []) as string[],
    cardsAgainstRealityProjects: (fields["Cards Against Reality"] || []) as string[],
    fundIiVideoProjects: (fields["Fund II Video"] || []) as string[],
    copyTitle1: fields["Copy Title 1"] || "",
    copyTitle2: fields["Copy Title 2"] || "",
    copyTitle3: fields["Copy Title 3"] || "",
    copyMainText: fields["Copy Main Text"] || "",
    imageDirection: fields["Image Direction"] || "",
    character: fields["Character"] || "",
    headline: fields["Headline Text"] || "",
    subheadline: fields["Subheadline Text"] || "",
    flavorText: fields["Flavor Text"] || "",
    artDirection: fields["Art Direction"] || "",
    copyStatus: fields["Copy Status"] || undefined,
    round1Draft: fields["Round 1 Draft"] || [],
    round1DraftFeedback: fields["Round 1 Draft Feedback"] || "",
    rejectRound1: fields["Reject Round 1"] || false,
    round2Draft: fields["Round 2 Draft"] || [],
    round2DraftFeedback: fields["Round 2 Draft Feedback"] || "",
    rejectRound2: fields["Reject Round 2"] || false,
    round3Draft: fields["Round 3 Draft"] || [],
    contactReview: fields["Contact Review"] || undefined,
    contactReviewFeedback: fields["Contact Review Feedback"] || "",
    latestTrackingNumber: fields["Latest Tracking Number"] || "",
    latestShipDate: fields["Latest Ship Date"] || "",
    fulfillFlag: fields["Fulfill Flag"] || "",
    enteredFulfillmentAt: fields["Entered Fulfillment At"] || "",
    createdAt: fields["Created At"],
    updatedAt: fields["Updated At"],
  };

  console.log(
    "Debug: transformAirtableContact - transformed contact:",
    transformedContact
  );
  return transformedContact;
};

export class AirtableService {
  // Projects operations
  static async getProjects(): Promise<Project[]> {
    if (!base) {
      console.warn("Airtable not configured");
      return [];
    }

    try {
      const records = await base(airtableConfig.tables.projects)
        .select({
          sort: [{ field: "Created At", direction: "desc" }],
        })
        .all();

      return records.map(transformAirtableProject);
    } catch (error) {
      console.error("Error fetching projects:", error);
      return [];
    }
  }

  static async getProject(id: string): Promise<Project | null> {
    if (!base) {
      console.warn("Airtable not configured");
      return null;
    }

    try {
      const record = await base(airtableConfig.tables.projects).find(id);
      return transformAirtableProject(record);
    } catch (error) {
      console.error("Error fetching project:", error);
      return null;
    }
  }

  static async createProject(
    projectData: Partial<Project>
  ): Promise<Project | null> {
    if (!base) {
      console.warn("Airtable not configured");
      return null;
    }

    try {
      const createFields: any = {
        Project: projectData.name,
        Stage: projectData.stage || "Contacts",
      };

      if (projectData.trackingNumber)
        createFields["Tracking Number"] = projectData.trackingNumber;
      if (projectData.finalDesignFileLink)
        createFields["Final Design File Link"] =
          projectData.finalDesignFileLink; // New field
      if (projectData.printerSubmissionDate)
        createFields["Printer Submission Date"] =
          projectData.printerSubmissionDate;
      if (projectData.shippedToPacksmithDate)
        createFields["Orders Fulfillment Date"] =
          projectData.shippedToPacksmithDate;

      const record = await base(airtableConfig.tables.projects).create(
        createFields
      );
      return transformAirtableProject(record);
    } catch (error) {
      console.error("Error creating project:", error);
      return null;
    }
  }

  static async updateProject(
    id: string,
    updates: Partial<Project>
  ): Promise<Project | null> {
    if (!base) {
      console.warn("Airtable not configured");
      return null;
    }

    try {
      const updateFields: any = {};
      if (updates.name !== undefined) updateFields["Project"] = updates.name;
      if (updates.stage !== undefined) updateFields["Stage"] = updates.stage;
      if (updates.trackingNumber !== undefined)
        updateFields["Tracking Number"] = updates.trackingNumber;
      if (updates.illustratorFiles !== undefined)
        updateFields["Final Design File"] = updates.illustratorFiles;
      if (updates.finalDesignFileLink !== undefined)
        updateFields["Final Design File Link"] = updates.finalDesignFileLink; // New field
      if (updates.invoice !== undefined)
        updateFields["Invoice"] = updates.invoice;
      if (updates.linkedContacts !== undefined)
        updateFields["Contacts"] = updates.linkedContacts;
      if (updates.printerSubmissionDate !== undefined)
        updateFields["Printer Submission Date"] = updates.printerSubmissionDate;
      if (updates.shippedToPacksmithDate !== undefined)
        updateFields["Orders Fulfillment Date"] =
          updates.shippedToPacksmithDate;

      const record = await base(airtableConfig.tables.projects).update(
        id,
        updateFields
      );
      return transformAirtableProject(record);
    } catch (error) {
      console.error("Error updating project:", error);
      return null;
    }
  }

  static async deleteProject(id: string): Promise<boolean> {
    if (!base) {
      console.warn("Airtable not configured");
      return false;
    }

    try {
      await base(airtableConfig.tables.projects).destroy(id);
      return true;
    } catch (error) {
      console.error("Error deleting project:", error);
      return false;
    }
  }

  // Contacts operations
  static async getContacts(): Promise<Contact[]> {
    if (!base) {
      console.warn("Airtable not configured");
      return [];
    }

    try {
      const records = await base(airtableConfig.tables.contacts)
        .select({
          sort: [{ field: "Recipient Name*", direction: "asc" }], // FIXED: Added asterisk
        })
        .all();

      return records.map(transformAirtableContact);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      return [];
    }
  }

  // Search contacts by partial name (case-insensitive)
  static async searchContactsByName(query: string, limit: number = 10): Promise<Contact[]> {
    if (!base) {
      console.warn("Airtable not configured");
      return [];
    }

    const trimmed = (query || "").trim();
    if (!trimmed) return [];

    try {
      // Use FIND on the Recipient Name* field; Airtable FIND is case-insensitive
      const filterFormula = `FIND(LOWER("${trimmed.replace(/"/g, '\\"')}"), LOWER({Recipient Name*}))`;
      const records = await base(airtableConfig.tables.contacts)
        .select({
          filterByFormula: filterFormula,
          maxRecords: limit,
          sort: [{ field: "Recipient Name*", direction: "asc" }],
        })
        .all();

      return records.map(transformAirtableContact);
    } catch (error) {
      console.error("Error searching contacts by name:", error);
      return [];
    }
  }

  // Search contacts by name OR company (case-insensitive)
  static async searchContactsByNameOrCompany(query: string, limit: number = 15): Promise<Contact[]> {
    if (!base) {
      console.warn("Airtable not configured");
      return [];
    }

    const trimmed = (query || "").trim();
    if (!trimmed) return [];

    try {
      const q = trimmed.replace(/"/g, '\\"');
      const filterFormula = `OR(FIND(LOWER("${q}"), LOWER({Recipient Name*})), FIND(LOWER("${q}"), LOWER({Company})))`;
      const records = await base(airtableConfig.tables.contacts)
        .select({
          filterByFormula: filterFormula,
          maxRecords: limit,
          sort: [{ field: "Recipient Name*", direction: "asc" }],
        })
        .all();

      return records.map(transformAirtableContact);
    } catch (error) {
      console.error("Error searching contacts by name or company:", error);
      return [];
    }
  }

  // Fixed method to fetch contacts by their IDs - removed sort option
  static async getContactsByIds(contactIds: string[]): Promise<Contact[]> {
    if (!base || !contactIds || contactIds.length === 0) {
      return [];
    }

    try {
      // Build the OR formula for filtering by record IDs
      const orConditions = contactIds
        .map((id) => `RECORD_ID() = "${id}"`)
        .join(", ");
      const filterFormula = `OR(${orConditions})`;

      console.log("Debug: getContactsByIds - contactIds:", contactIds);
      console.log("Debug: getContactsByIds - filterFormula:", filterFormula);

      const records = await base(airtableConfig.tables.contacts)
        .select({
          filterByFormula: filterFormula,
          // Removed sort option to fix 422 error when combined with filterByFormula
        })
        .all();

      console.log(
        "Debug: getContactsByIds - raw records from Airtable:",
        records
      );
      const transformedContacts = records.map(transformAirtableContact);
      console.log(
        "Debug: getContactsByIds - transformed contacts:",
        transformedContacts
      );

      return transformedContacts;
    } catch (error) {
      console.error("Error fetching contacts by IDs:", error);
      return [];
    }
  }

  static async createContact(
    contactData: Partial<Contact>
  ): Promise<Contact | null> {
    if (!base) {
      console.warn("Airtable not configured");
      return null;
    }

    try {
      const createFields: any = {};
      if (contactData.name) createFields["Recipient Name*"] = contactData.name; // FIXED: Added asterisk
      if (contactData.company) createFields["Company"] = contactData.company;
      if (contactData.email) createFields["Email"] = contactData.email;
      if (contactData.phone) createFields["Phone"] = contactData.phone;
      if (contactData.streetLine1)
        createFields["Street Line 1"] = contactData.streetLine1;
      // removed Street Number mapping (column deleted)
      if (contactData.streetLine2)
        createFields["Street Line 2 (Unit Number)"] = contactData.streetLine2;
      if (contactData.city) createFields["City"] = contactData.city;
      if (contactData.state) createFields["State"] = contactData.state;
      if (contactData.postCode)
        createFields["Post Code (5 digits)"] = contactData.postCode;
      if (contactData.countryCode)
        createFields["Country Code"] = contactData.countryCode;
      if (contactData.linkedinUrl)
        createFields["LinkedIn URL"] = contactData.linkedinUrl;
      if (contactData.additionalContactContext)
        createFields["Additional Contact Context"] =
          contactData.additionalContactContext;
      if (contactData.contactAddedBy && contactData.contactAddedBy !== "")
        createFields["Contact Added By"] = contactData.contactAddedBy;
      if ((contactData as any).specificStage)
        createFields["Specific Stage"] = (contactData as any).specificStage;
      if ((contactData as any).magicCardsProjects !== undefined)
        createFields["Magic Cards"] = (contactData as any).magicCardsProjects;
      if ((contactData as any).sfsBookProjects !== undefined)
        createFields["SFS Book"] = (contactData as any).sfsBookProjects;
      if ((contactData as any).goldenRecordProjects !== undefined)
        createFields["Golden Record"] = (contactData as any).goldenRecordProjects;
      if ((contactData as any).draftOrderItems !== undefined)
        createFields["Draft Order Items"] = (contactData as any).draftOrderItems;
      // Also ensure the generic Projects link includes any of the above selections
      {
        const projectIds = new Set<string>();
        if ((contactData as any).magicCardsProjects) (contactData as any).magicCardsProjects.forEach((id: string) => projectIds.add(id));
        if ((contactData as any).sfsBookProjects) (contactData as any).sfsBookProjects.forEach((id: string) => projectIds.add(id));
        if ((contactData as any).goldenRecordProjects) (contactData as any).goldenRecordProjects.forEach((id: string) => projectIds.add(id));
        if (projectIds.size > 0) createFields["Projects"] = Array.from(projectIds);
      }
      if (contactData.copyTitle1)
        createFields["Copy Title 1"] = contactData.copyTitle1;
      if (contactData.copyTitle2)
        createFields["Copy Title 2"] = contactData.copyTitle2;
      if (contactData.copyMainText)
        createFields["Copy Main Text"] = contactData.copyMainText;
      if (contactData.character)
        createFields["Character"] = contactData.character;
      if (contactData.headline)
        createFields["Headline Text"] = contactData.headline;
      if (contactData.subheadline)
        createFields["Subheadline Text"] = contactData.subheadline;
      if (contactData.flavorText)
        createFields["Flavor Text"] = contactData.flavorText;
      if (contactData.copyStatus)
        createFields["Copy Status"] = contactData.copyStatus;
      if (contactData.copyTitle3)
        createFields["Copy Title 3"] = contactData.copyTitle3;
      if (contactData.imageDirection)
        createFields["Image Direction"] = contactData.imageDirection;
      if (contactData.artDirection)
        createFields["Art Direction"] = contactData.artDirection;
      if (contactData.round1DraftFeedback)
        createFields["Round 1 Draft Feedback"] =
          contactData.round1DraftFeedback;
      if (contactData.round2DraftFeedback)
        createFields["Round 2 Draft Feedback"] =
          contactData.round2DraftFeedback;
      if (contactData.headshot) createFields["Headshot"] = contactData.headshot;
      if (contactData.companyLogo)
        createFields["Company Logo"] = contactData.companyLogo;
      if (contactData.contactReview)
        createFields["Contact Review"] = contactData.contactReview;
      if (contactData.contactReviewFeedback)
        createFields["Contact Review Feedback"] = contactData.contactReviewFeedback;
      if (contactData.rejectRound1 !== undefined)
        createFields["Reject Round 1"] = contactData.rejectRound1;
      if (contactData.rejectRound2 !== undefined)
        createFields["Reject Round 2"] = contactData.rejectRound2;

      const record = await base(airtableConfig.tables.contacts).create(
        createFields
      );
      return transformAirtableContact(record);
    } catch (error) {
      console.error("Error creating contact:", error);
      return null;
    }
  }

  static async updateContact(
    id: string,
    updates: Partial<Contact>
  ): Promise<Contact | null> {
    if (!base) {
      console.warn("Airtable not configured");
      return null;
    }

    try {
      const updateFields: any = {};
      if (updates.name) updateFields["Recipient Name*"] = updates.name; // FIXED: Added asterisk
      if (updates.company !== undefined)
        updateFields["Company"] = updates.company;
      if (updates.email !== undefined) updateFields["Email"] = updates.email;
      if (updates.phone !== undefined) updateFields["Phone"] = updates.phone;
      if (updates.streetLine1 !== undefined)
        updateFields["Street Line 1"] = updates.streetLine1;
      // removed Street Number mapping (column deleted)
      if (updates.streetLine2 !== undefined)
        updateFields["Street Line 2 (Unit Number)"] = updates.streetLine2;
      if (updates.city !== undefined) updateFields["City"] = updates.city;
      if (updates.state !== undefined) updateFields["State"] = updates.state;
      if (updates.postCode !== undefined)
        updateFields["Post Code (5 digits)"] = updates.postCode;
      if (updates.countryCode !== undefined)
        updateFields["Country Code"] = updates.countryCode;
      if (updates.linkedinUrl !== undefined)
        updateFields["LinkedIn URL"] = updates.linkedinUrl;
      if (updates.additionalContactContext !== undefined)
        updateFields["Additional Contact Context"] =
          updates.additionalContactContext;
      if ((updates as any).specificStage !== undefined)
        updateFields["Specific Stage"] = (updates as any).specificStage;
      if ((updates as any).draftOrderItems !== undefined)
        updateFields["Draft Order Items"] = (updates as any).draftOrderItems;
      if ((updates as any).latestDesignFeedback !== undefined)
        updateFields["Latest Design Feedback"] = (updates as any).latestDesignFeedback;
      if ((updates as any).latestDesignDate !== undefined)
        updateFields["Latest Design Date"] = (updates as any).latestDesignDate;
      if ((updates as any).designFiles !== undefined) {
        const designPayload = (updates as any).designFiles;
        if (Array.isArray(designPayload) && designPayload.length > 0) {
          const first = designPayload[0];
          const url = typeof first === "string" ? first : first?.url;
          if (url) {
            updateFields["Design File"] = url;
          }
        } else {
          updateFields["Design File"] = "";
        }
      }
      if (updates.contactAddedBy !== undefined && updates.contactAddedBy !== "")
        updateFields["Contact Added By"] = updates.contactAddedBy;
      if ((updates as any).magicCardsProjects !== undefined)
        updateFields["Magic Cards"] = (updates as any).magicCardsProjects;
      if ((updates as any).sfsBookProjects !== undefined)
        updateFields["SFS Book"] = (updates as any).sfsBookProjects;
      if ((updates as any).goldenRecordProjects !== undefined)
        updateFields["Golden Record"] = (updates as any).goldenRecordProjects;
      // Also ensure the generic Projects link includes any of the above selections,
      // without erasing other existing project links.
      {
        const projectIds = new Set<string>();
        if ((updates as any).magicCardsProjects) (updates as any).magicCardsProjects.forEach((id: string) => projectIds.add(id));
        if ((updates as any).sfsBookProjects) (updates as any).sfsBookProjects.forEach((id: string) => projectIds.add(id));
        if ((updates as any).goldenRecordProjects) (updates as any).goldenRecordProjects.forEach((id: string) => projectIds.add(id));
        if (projectIds.size > 0) {
          try {
            const existing = await base!(airtableConfig.tables.contacts).find(id);
            const existingProjects: string[] = (existing.fields["Projects"] || []) as string[];
            existingProjects.forEach((pid) => projectIds.add(pid));
          } catch (e) {
            console.warn("Could not load existing contact to merge Projects; proceeding with provided ids only", e);
          }
          updateFields["Projects"] = Array.from(projectIds);
        }
      }
      if (updates.copyTitle1 !== undefined)
        updateFields["Copy Title 1"] = updates.copyTitle1;
      if (updates.copyTitle2 !== undefined)
        updateFields["Copy Title 2"] = updates.copyTitle2;
      if (updates.copyMainText !== undefined)
        updateFields["Copy Main Text"] = updates.copyMainText;
      if (updates.character !== undefined)
        updateFields["Character"] = updates.character;
      if (updates.headline !== undefined)
        updateFields["Headline Text"] = updates.headline;
      if (updates.subheadline !== undefined)
        updateFields["Subheadline Text"] = updates.subheadline;
      if (updates.flavorText !== undefined)
        updateFields["Flavor Text"] = updates.flavorText;
      if (updates.copyStatus !== undefined)
        updateFields["Copy Status"] = updates.copyStatus;
      if (updates.copyTitle3 !== undefined)
        updateFields["Copy Title 3"] = updates.copyTitle3;
      if (updates.imageDirection !== undefined)
        updateFields["Image Direction"] = updates.imageDirection;
      if (updates.artDirection !== undefined)
        updateFields["Art Direction"] = updates.artDirection;
      if (updates.round1Draft !== undefined)
        updateFields["Round 1 Draft"] = updates.round1Draft;
      if (updates.round1DraftFeedback !== undefined)
        updateFields["Round 1 Draft Feedback"] = updates.round1DraftFeedback;
      if (updates.rejectRound1 !== undefined)
        updateFields["Reject Round 1"] = updates.rejectRound1;
      if (updates.round2Draft !== undefined)
        updateFields["Round 2 Draft"] = updates.round2Draft;
      if (updates.round2DraftFeedback !== undefined)
        updateFields["Round 2 Draft Feedback"] = updates.round2DraftFeedback;
      if (updates.rejectRound2 !== undefined)
        updateFields["Reject Round 2"] = updates.rejectRound2;
      if (updates.round3Draft !== undefined)
        updateFields["Round 3 Draft"] = updates.round3Draft;
      if (updates.headshot !== undefined)
        updateFields["Headshot"] = updates.headshot;
      if (updates.companyLogo !== undefined)
        updateFields["Company Logo"] = updates.companyLogo;
      if (updates.contactReview !== undefined)
        updateFields["Contact Review"] = updates.contactReview;
      if (updates.contactReviewFeedback !== undefined)
        updateFields["Contact Review Feedback"] = updates.contactReviewFeedback;
      if (updates.latestTrackingNumber !== undefined)
        updateFields["Latest Tracking Number"] = updates.latestTrackingNumber;
      if (updates.latestShipDate !== undefined)
        updateFields["Latest Ship Date"] = updates.latestShipDate;
      if (updates.fulfillFlag !== undefined)
        updateFields["Fulfill Flag"] = updates.fulfillFlag;

      const record = await base(airtableConfig.tables.contacts).update(
        id,
        updateFields
      );
      return transformAirtableContact(record);
    } catch (error) {
      console.error("Error updating contact:", error);
      return null;
    }
  }

  static async deleteContact(id: string): Promise<boolean> {
    if (!base) {
      console.warn("Airtable not configured");
      return false;
    }

    try {
      await base(airtableConfig.tables.contacts).destroy(id);
      return true;
    } catch (error) {
      console.error("Error deleting contact:", error);
      return false;
    }
  }

  // Helper method to link a contact to a project
  static async linkContactToProject(
    projectId: string,
    contactId: string
  ): Promise<boolean> {
    if (!base) {
      console.warn("Airtable not configured");
      return false;
    }

    try {
      // First, get the current project to see existing linked contacts
      const project = await this.getProject(projectId);
      if (!project) return false;

      // Add the new contact ID to the existing linked contacts
      const updatedLinkedContacts = [
        ...(project.linkedContacts || []),
        contactId,
      ];

      // Update the project with the new linked contacts
      const updatedProject = await this.updateProject(projectId, {
        linkedContacts: updatedLinkedContacts,
      });

      return !!updatedProject;
    } catch (error) {
      console.error("Error linking contact to project:", error);
      return false;
    }
  }

  // Helper method to unlink a contact from a project
  static async unlinkContactFromProject(
    projectId: string,
    contactId: string
  ): Promise<boolean> {
    if (!base) {
      console.warn("Airtable not configured");
      return false;
    }

    try {
      // First, get the current project to see existing linked contacts
      const project = await this.getProject(projectId);
      if (!project) return false;

      // Remove the contact ID from the existing linked contacts
      const updatedLinkedContacts = (project.linkedContacts || []).filter(
        (id) => id !== contactId
      );

      // Update the project with the updated linked contacts
      const updatedProject = await this.updateProject(projectId, {
        linkedContacts: updatedLinkedContacts,
      });

      return !!updatedProject;
    } catch (error) {
      console.error("Error unlinking contact from project:", error);
      return false;
    }
  }
}
