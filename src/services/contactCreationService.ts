import { Contact, LinkPrecedence } from "@prisma/client";
import { ContactRepository } from "../models/contactRepository";
import { ContactSearchService } from "./contactSearchService";
import { ContactInput, ConsolidatedContact } from "../types/contact";

export class ContactCreationService {
  private contactRepository: ContactRepository;
  private contactSearchService: ContactSearchService;

  constructor() {
    this.contactRepository = new ContactRepository();
    this.contactSearchService = new ContactSearchService();
  }

  /**
   * Create a new contact based on the scenario analysis
   */
  async createContact(
    email: string | null,
    phoneNumber: string | null,
    scenario: ContactCreationScenario
  ): Promise<Contact> {
    switch (scenario.type) {
      case "new_primary":
        return this.createPrimaryContact(email, phoneNumber);

      case "new_secondary":
        return this.createSecondaryContact(
          email,
          phoneNumber,
          scenario.primaryContactId
        );

      default:
        throw new Error(
          `Unknown contact creation scenario: ${(scenario as any).type}`
        );
    }
  }

  /**
   * Create a new primary contact
   */
  private async createPrimaryContact(
    email: string | null,
    phoneNumber: string | null
  ): Promise<Contact> {
    const contactData: ContactInput = {
      email,
      phoneNumber,
      linkPrecedence: LinkPrecedence.primary,
    };

    return this.contactRepository.create(contactData);
  }

  /**
   * Create a new secondary contact linked to a primary
   */
  private async createSecondaryContact(
    email: string | null,
    phoneNumber: string | null,
    primaryContactId: number
  ): Promise<Contact> {
    // Verify the primary contact exists
    const primaryContact = await this.contactRepository.findPrimaryContact(
      primaryContactId
    );
    if (!primaryContact) {
      throw new Error(`Primary contact with ID ${primaryContactId} not found`);
    }

    const contactData: ContactInput = {
      email,
      phoneNumber,
      linkedId: primaryContactId,
      linkPrecedence: LinkPrecedence.secondary,
    };

    return this.contactRepository.create(contactData);
  }

  /**
   * Analyze what type of contact should be created based on existing data
   */
  async analyzeCreationScenario(
    email: string | null,
    phoneNumber: string | null
  ): Promise<ContactCreationScenario> {
    // Check for exact match first
    const exactMatch = await this.contactSearchService.findExactContactMatch(
      email,
      phoneNumber
    );
    if (exactMatch) {
      return {
        type: "existing_contact",
        existingContact: exactMatch,
      };
    }

    // Find partial matches
    const partialMatches = await this.contactSearchService.findPartialMatches(
      email,
      phoneNumber
    );

    // No matches - create new primary
    if (!partialMatches.hasEmailMatch && !partialMatches.hasPhoneMatch) {
      return { type: "new_primary" };
    }

    // Has matches - need to determine primary contact
    const allMatches = [
      ...partialMatches.emailMatches,
      ...partialMatches.phoneMatches,
    ];
    const relatedContacts =
      await this.contactSearchService.findAllRelatedContacts(allMatches);

    const primaryContact = relatedContacts
      .filter((contact) => contact.linkPrecedence === "primary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    if (!primaryContact) {
      throw new Error("No primary contact found in related contacts");
    }

    return {
      type: "new_secondary",
      primaryContactId: primaryContact.id,
    };
  }

  /**
   * Validate contact data before creation
   */
  validateContactData(email: string | null, phoneNumber: string | null): void {
    if (!email && !phoneNumber) {
      throw new Error("Either email or phone number must be provided");
    }

    if (email && typeof email !== "string") {
      throw new Error("Email must be a string");
    }

    if (phoneNumber && typeof phoneNumber !== "string") {
      throw new Error("Phone number must be a string");
    }

    // Additional validation can be added here
    // (email format, phone format, etc. - handled in validation utils)
  }

  /**
   * Check if creating this contact would result in duplicate information
   */
  async checkForDuplicates(
    email: string | null,
    phoneNumber: string | null
  ): Promise<{
    hasDuplicateEmail: boolean;
    hasDuplicatePhone: boolean;
    duplicateContacts: Contact[];
  }> {
    const results = await this.contactSearchService.findPartialMatches(
      email,
      phoneNumber
    );

    const duplicateContacts = [
      ...results.emailMatches,
      ...results.phoneMatches,
    ];

    // Remove duplicates
    const uniqueContacts = duplicateContacts.filter(
      (contact, index, self) =>
        index === self.findIndex((c) => c.id === contact.id)
    );

    return {
      hasDuplicateEmail: results.hasEmailMatch,
      hasDuplicatePhone: results.hasPhoneMatch,
      duplicateContacts: uniqueContacts,
    };
  }

  /**
   * Get creation statistics (for monitoring)
   */
  async getCreationStats(): Promise<{
    totalContactsCreated: number;
    primaryContactsCreated: number;
    secondaryContactsCreated: number;
  }> {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Creation stats are only available in development mode");
    }

    const allContacts = await this.contactRepository.findAll();

    return {
      totalContactsCreated: allContacts.length,
      primaryContactsCreated: allContacts.filter(
        (c) => c.linkPrecedence === "primary"
      ).length,
      secondaryContactsCreated: allContacts.filter(
        (c) => c.linkPrecedence === "secondary"
      ).length,
    };
  }

  /**
   * Bulk create contacts (for testing/seeding)
   */
  async bulkCreateContacts(contactsData: ContactInput[]): Promise<Contact[]> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Bulk creation is not allowed in production");
    }

    const createdContacts: Contact[] = [];

    for (const contactData of contactsData) {
      this.validateContactData(contactData.email, contactData.phoneNumber);
      const contact = await this.contactRepository.create(contactData);
      createdContacts.push(contact);
    }

    return createdContacts;
  }
}

// Types for contact creation scenarios
export interface ContactCreationScenario {
  type: "new_primary" | "new_secondary" | "existing_contact";
  primaryContactId?: number;
  existingContact?: Contact;
}

export interface NewPrimaryScenario {
  type: "new_primary";
}

export interface NewSecondaryScenario {
  type: "new_secondary";
  primaryContactId: number;
}

export interface ExistingContactScenario {
  type: "existing_contact";
  existingContact: Contact;
}
