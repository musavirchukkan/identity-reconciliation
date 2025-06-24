import { Contact } from "@prisma/client";
import { ContactResponse, ConsolidatedContact } from "../types/contact";

/**
 * Format consolidated contact data for API response
 */
export const formatContactResponse = (
  consolidatedContact: ConsolidatedContact
): ContactResponse => {
  return {
    contact: {
      primaryContactId: consolidatedContact.primaryContact.id,
      emails: consolidatedContact.allEmails,
      phoneNumbers: consolidatedContact.allPhoneNumbers,
      secondaryContactIds: consolidatedContact.secondaryContacts.map(
        (contact) => contact.id
      ),
    },
  };
};

/**
 * Check if a contact is valid (not deleted)
 */
export const isValidContact = (contact: Contact): boolean => {
  return contact.deletedAt === null;
};

/**
 * Sort contacts by creation date (oldest first)
 */
export const sortContactsByCreation = (contacts: Contact[]): Contact[] => {
  return [...contacts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
};

/**
 * Group contacts by their link precedence
 */
export const groupContactsByPrecedence = (
  contacts: Contact[]
): {
  primary: Contact[];
  secondary: Contact[];
} => {
  return contacts.reduce(
    (groups, contact) => {
      if (contact.linkPrecedence === "primary") {
        groups.primary.push(contact);
      } else {
        groups.secondary.push(contact);
      }
      return groups;
    },
    { primary: [] as Contact[], secondary: [] as Contact[] }
  );
};

/**
 * Extract unique contact identifiers (emails and phone numbers)
 */
export const extractContactIdentifiers = (
  contacts: Contact[]
): {
  emails: string[];
  phoneNumbers: string[];
} => {
  const emails = new Set<string>();
  const phoneNumbers = new Set<string>();

  for (const contact of contacts) {
    if (contact.email) emails.add(contact.email);
    if (contact.phoneNumber) phoneNumbers.add(contact.phoneNumber);
  }

  return {
    emails: Array.from(emails),
    phoneNumbers: Array.from(phoneNumbers),
  };
};

/**
 * Find the oldest primary contact from a list
 */
export const findOldestPrimary = (contacts: Contact[]): Contact | null => {
  const primaryContacts = contacts.filter(
    (contact) => contact.linkPrecedence === "primary"
  );

  if (primaryContacts.length === 0) return null;

  return sortContactsByCreation(primaryContacts)[0];
};

/**
 * Check if two contacts have overlapping information
 */
export const contactsHaveOverlap = (
  contact1: Contact,
  contact2: Contact
): boolean => {
  // Email overlap
  if (contact1.email && contact2.email && contact1.email === contact2.email) {
    return true;
  }

  // Phone overlap
  if (
    contact1.phoneNumber &&
    contact2.phoneNumber &&
    contact1.phoneNumber === contact2.phoneNumber
  ) {
    return true;
  }

  return false;
};

/**
 * Generate a summary of contact relationships
 */
export const generateContactSummary = (
  consolidatedContact: ConsolidatedContact
): string => {
  const { primaryContact, secondaryContacts, allEmails, allPhoneNumbers } =
    consolidatedContact;

  const summary = [
    `Primary Contact: ID ${
      primaryContact.id
    } (created: ${primaryContact.createdAt.toISOString()})`,
    `Secondary Contacts: ${secondaryContacts.length} (IDs: ${secondaryContacts
      .map((c) => c.id)
      .join(", ")})`,
    `Total Emails: ${allEmails.length} (${allEmails.join(", ")})`,
    `Total Phone Numbers: ${allPhoneNumbers.length} (${allPhoneNumbers.join(
      ", "
    )})`,
  ];

  return summary.join("\n");
};

/**
 * Validate contact response format
 */
export const validateContactResponse = (response: ContactResponse): boolean => {
  try {
    const { contact } = response;

    // Check required fields
    if (typeof contact.primaryContactId !== "number") return false;
    if (!Array.isArray(contact.emails)) return false;
    if (!Array.isArray(contact.phoneNumbers)) return false;
    if (!Array.isArray(contact.secondaryContactIds)) return false;

    // Check array contents
    if (!contact.emails.every((email) => typeof email === "string"))
      return false;
    if (!contact.phoneNumbers.every((phone) => typeof phone === "string"))
      return false;
    if (!contact.secondaryContactIds.every((id) => typeof id === "number"))
      return false;

    return true;
  } catch {
    return false;
  }
};

/**
 * Create debug information for contact operations
 */
export const createContactDebugInfo = (
  operation: string,
  input: { email?: string; phoneNumber?: string },
  result: ConsolidatedContact,
  processingTime?: number
): Record<string, any> => {
  return {
    operation,
    timestamp: new Date().toISOString(),
    input: {
      email: input.email || null,
      phoneNumber: input.phoneNumber || null,
    },
    result: {
      primaryContactId: result.primaryContact.id,
      totalLinkedContacts: result.secondaryContacts.length + 1,
      uniqueEmails: result.allEmails.length,
      uniquePhoneNumbers: result.allPhoneNumbers.length,
    },
    performance: {
      processingTimeMs: processingTime || null,
    },
  };
};
