import { Contact, LinkPrecedence } from "@prisma/client";

// Input types for API requests
export interface IdentifyRequest {
  email?: string;
  phoneNumber?: string;
}

// Response types for API responses
export interface ContactResponse {
  contact: {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

// Internal types for business logic
export interface ContactInput {
  email?: string | null;
  phoneNumber?: string | null;
  linkedId?: number | null;
  linkPrecedence: LinkPrecedence;
}

export interface ContactWithRelations extends Contact {
  linkedContact?: Contact | null;
  linkedContacts?: Contact[];
}

// Search criteria for finding contacts
export interface ContactSearchCriteria {
  email?: string;
  phoneNumber?: string;
  includeDeleted?: boolean;
}

// Consolidated contact information
export interface ConsolidatedContact {
  primaryContact: Contact;
  secondaryContacts: Contact[];
  allEmails: string[];
  allPhoneNumbers: string[];
}

export { Contact, LinkPrecedence };
