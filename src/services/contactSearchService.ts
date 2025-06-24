import { Contact } from "@prisma/client";
import { ContactRepository } from "../models/contactRepository";
import { ContactSearchCriteria, ConsolidatedContact } from "../types/contact";
import { getUniqueValues } from "../utils/validation";

export class ContactSearchService {
  private contactRepository: ContactRepository;

  constructor() {
    this.contactRepository = new ContactRepository();
  }

  /**
   * Search for contacts by email or phone number
   */
  async searchContacts(criteria: ContactSearchCriteria): Promise<Contact[]> {
    if (!criteria.email && !criteria.phoneNumber) {
      throw new Error(
        "Either email or phone number must be provided for search"
      );
    }

    return this.contactRepository.findByEmailOrPhone(criteria);
  }

  /**
   * Find all related contacts (primary + secondaries) for given contacts
   */
  async findAllRelatedContacts(contacts: Contact[]): Promise<Contact[]> {
    if (contacts.length === 0) return [];

    const allRelatedContacts = new Map<number, Contact>();

    for (const contact of contacts) {
      // Find the primary contact for this contact
      let primaryContact: Contact;

      if (contact.linkPrecedence === "primary") {
        primaryContact = contact;
      } else if (contact.linkedId) {
        const found = await this.contactRepository.findPrimaryContact(
          contact.linkedId
        );
        if (!found) continue;
        primaryContact = found;
      } else {
        continue;
      }

      // Add primary contact
      allRelatedContacts.set(primaryContact.id, primaryContact);

      // Find all secondary contacts linked to this primary
      const linkedContacts = await this.contactRepository.findLinkedContacts(
        primaryContact.id
      );

      for (const linkedContact of linkedContacts) {
        allRelatedContacts.set(linkedContact.id, linkedContact);
      }
    }

    return Array.from(allRelatedContacts.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  /**
   * Consolidate contacts into primary and secondary groups
   */
  async consolidateContacts(
    searchEmail?: string,
    searchPhone?: string
  ): Promise<ConsolidatedContact | null> {
    // Search for matching contacts
    const matchingContacts = await this.searchContacts({
      email: searchEmail,
      phoneNumber: searchPhone,
    });

    if (matchingContacts.length === 0) {
      return null;
    }

    // Get all related contacts
    const allRelatedContacts = await this.findAllRelatedContacts(
      matchingContacts
    );

    if (allRelatedContacts.length === 0) {
      return null;
    }

    // Find the primary contact (oldest one with primary precedence)
    const primaryContact = allRelatedContacts
      .filter((contact) => contact.linkPrecedence === "primary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    if (!primaryContact) {
      throw new Error("No primary contact found in related contacts");
    }

    // Get secondary contacts
    const secondaryContacts = allRelatedContacts
      .filter((contact) => contact.linkPrecedence === "secondary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Collect all unique emails and phone numbers
    const allEmails = getUniqueValues([
      primaryContact.email,
      ...secondaryContacts.map((c) => c.email),
    ]);

    const allPhoneNumbers = getUniqueValues([
      primaryContact.phoneNumber,
      ...secondaryContacts.map((c) => c.phoneNumber),
    ]);

    return {
      primaryContact,
      secondaryContacts,
      allEmails,
      allPhoneNumbers,
    };
  }

  /**
   * Check if a contact with exact email/phone combination already exists
   */
  async findExactContactMatch(
    email?: string,
    phoneNumber?: string
  ): Promise<Contact | null> {
    if (!email && !phoneNumber) return null;

    return this.contactRepository.findExactMatch(email, phoneNumber);
  }

  /**
   * Find contacts that share either email or phone with the given criteria
   */
  async findPartialMatches(
    email?: string,
    phoneNumber?: string
  ): Promise<{
    emailMatches: Contact[];
    phoneMatches: Contact[];
    hasEmailMatch: boolean;
    hasPhoneMatch: boolean;
  }> {
    const emailMatches: Contact[] = [];
    const phoneMatches: Contact[] = [];

    if (email) {
      const emailResults = await this.contactRepository.findByEmailOrPhone({
        email,
      });
      emailMatches.push(...emailResults);
    }

    if (phoneNumber) {
      const phoneResults = await this.contactRepository.findByEmailOrPhone({
        phoneNumber,
      });
      phoneMatches.push(...phoneResults);
    }

    return {
      emailMatches,
      phoneMatches,
      hasEmailMatch: emailMatches.length > 0,
      hasPhoneMatch: phoneMatches.length > 0,
    };
  }

  /**
   * Get contact statistics (for debugging)
   */
  async getContactStats(): Promise<{
    totalContacts: number;
    primaryContacts: number;
    secondaryContacts: number;
  }> {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Contact stats are only available in development mode");
    }

    const allContacts = await this.contactRepository.findAll();

    return {
      totalContacts: allContacts.length,
      primaryContacts: allContacts.filter((c) => c.linkPrecedence === "primary")
        .length,
      secondaryContacts: allContacts.filter(
        (c) => c.linkPrecedence === "secondary"
      ).length,
    };
  }
}
