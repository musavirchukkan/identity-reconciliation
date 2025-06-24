import { Contact, LinkPrecedence } from "@prisma/client";
import { ContactRepository } from "../models/contactRepository";
import { ContactSearchService } from "./contactSearchService";
import { ContactInput, ConsolidatedContact } from "../types/contact";
import { validateEmail, validatePhoneNumber } from "../utils/validation";

export class IdentityLinkingService {
  private contactRepository: ContactRepository;
  private contactSearchService: ContactSearchService;

  constructor() {
    this.contactRepository = new ContactRepository();
    this.contactSearchService = new ContactSearchService();
  }

  /**
   * Main method to identify and link contacts based on email/phone
   */
  async identifyContact(
    email?: string,
    phoneNumber?: string
  ): Promise<ConsolidatedContact> {
    // Validate and normalize input
    const normalizedEmail = validateEmail(email);
    const normalizedPhone = validatePhoneNumber(phoneNumber);

    if (!normalizedEmail && !normalizedPhone) {
      throw new Error("Either email or phone number must be provided");
    }

    // Check for exact match first
    const exactMatch = await this.contactSearchService.findExactContactMatch(
      normalizedEmail,
      normalizedPhone
    );

    if (exactMatch) {
      // Return consolidated view of existing contact
      return this.getConsolidatedContact(exactMatch);
    }

    // Find partial matches
    const partialMatches = await this.contactSearchService.findPartialMatches(
      normalizedEmail,
      normalizedPhone
    );

    // Determine the linking scenario
    return this.handleLinkingScenario(
      normalizedEmail,
      normalizedPhone,
      partialMatches
    );
  }

  /**
   * Handle different linking scenarios based on existing matches
   */
  private async handleLinkingScenario(
    email: string | null,
    phoneNumber: string | null,
    partialMatches: {
      emailMatches: Contact[];
      phoneMatches: Contact[];
      hasEmailMatch: boolean;
      hasPhoneMatch: boolean;
    }
  ): Promise<ConsolidatedContact> {
    const { emailMatches, phoneMatches, hasEmailMatch, hasPhoneMatch } =
      partialMatches;

    // Scenario 1: No existing matches - create new primary contact
    if (!hasEmailMatch && !hasPhoneMatch) {
      return this.createNewPrimaryContact(email, phoneNumber);
    }

    // Scenario 2: Partial match - create secondary contact
    if (
      (hasEmailMatch && !hasPhoneMatch) ||
      (!hasEmailMatch && hasPhoneMatch)
    ) {
      return this.createSecondaryContact(email, phoneNumber, [
        ...emailMatches,
        ...phoneMatches,
      ]);
    }

    // Scenario 3: Both email and phone match existing contacts
    if (hasEmailMatch && hasPhoneMatch) {
      return this.handleComplexLinking(
        email,
        phoneNumber,
        emailMatches,
        phoneMatches
      );
    }

    throw new Error("Unexpected linking scenario encountered");
  }

  /**
   * Create a new primary contact
   */
  private async createNewPrimaryContact(
    email: string | null,
    phoneNumber: string | null
  ): Promise<ConsolidatedContact> {
    const newContact = await this.contactRepository.create({
      email,
      phoneNumber,
      linkPrecedence: LinkPrecedence.primary,
    });

    return {
      primaryContact: newContact,
      secondaryContacts: [],
      allEmails: email ? [email] : [],
      allPhoneNumbers: phoneNumber ? [phoneNumber] : [],
    };
  }

  /**
   * Create a secondary contact linked to existing primary
   */
  private async createSecondaryContact(
    email: string | null,
    phoneNumber: string | null,
    existingContacts: Contact[]
  ): Promise<ConsolidatedContact> {
    if (existingContacts.length === 0) {
      throw new Error("No existing contacts found for secondary linking");
    }

    // Find all related contacts to determine the primary
    const allRelated = await this.contactSearchService.findAllRelatedContacts(
      existingContacts
    );

    // Get the primary contact (oldest primary in the group)
    const primaryContact = allRelated
      .filter((contact) => contact.linkPrecedence === "primary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    if (!primaryContact) {
      throw new Error("No primary contact found in existing contacts");
    }

    // Create new secondary contact
    const newSecondaryContact = await this.contactRepository.create({
      email,
      phoneNumber,
      linkedId: primaryContact.id,
      linkPrecedence: LinkPrecedence.secondary,
    });

    // Return updated consolidated view
    return this.getConsolidatedContact(newSecondaryContact);
  }

  /**
   * Handle complex linking where both email and phone have existing matches
   */
  private async handleComplexLinking(
    email: string | null,
    phoneNumber: string | null,
    emailMatches: Contact[],
    phoneMatches: Contact[]
  ): Promise<ConsolidatedContact> {
    // Get all related contacts for both email and phone matches
    const emailRelated = await this.contactSearchService.findAllRelatedContacts(
      emailMatches
    );
    const phoneRelated = await this.contactSearchService.findAllRelatedContacts(
      phoneMatches
    );

    // Find primary contacts from both groups
    const emailPrimaries = emailRelated.filter(
      (c) => c.linkPrecedence === "primary"
    );
    const phonePrimaries = phoneRelated.filter(
      (c) => c.linkPrecedence === "primary"
    );

    // Check if email and phone belong to the same contact group
    const emailPrimaryIds = new Set(emailPrimaries.map((c) => c.id));
    const phoneInSameGroup = phonePrimaries.some((p) =>
      emailPrimaryIds.has(p.id)
    );

    if (phoneInSameGroup) {
      // Same contact group - just return consolidated view
      const primaryContact = emailPrimaries.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      return this.getConsolidatedContact(primaryContact);
    }

    // Different contact groups - need to merge them
    return this.mergeContactGroups(
      email,
      phoneNumber,
      emailPrimaries,
      phonePrimaries
    );
  }

  /**
   * Merge two separate contact groups into one
   */
  private async mergeContactGroups(
    email: string | null,
    phoneNumber: string | null,
    emailPrimaries: Contact[],
    phonePrimaries: Contact[]
  ): Promise<ConsolidatedContact> {
    // Find the oldest primary contact (will remain primary)
    const allPrimaries = [...emailPrimaries, ...phonePrimaries];
    const oldestPrimary = allPrimaries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0];

    // Find primaries that need to become secondary
    const primariesToConvert = allPrimaries.filter(
      (p) => p.id !== oldestPrimary.id
    );

    // Convert other primaries to secondary
    for (const primary of primariesToConvert) {
      await this.contactRepository.convertToSecondary(
        primary.id,
        oldestPrimary.id
      );
    }

    // Create new secondary contact for the new email/phone combination
    if (email || phoneNumber) {
      await this.contactRepository.create({
        email,
        phoneNumber,
        linkedId: oldestPrimary.id,
        linkPrecedence: LinkPrecedence.secondary,
      });
    }

    // Return consolidated view
    return this.getConsolidatedContact(oldestPrimary);
  }

  /**
   * Get consolidated view of a contact and all its linked contacts
   */
  private async getConsolidatedContact(
    contact: Contact
  ): Promise<ConsolidatedContact> {
    // Find primary contact
    let primaryContact: Contact;

    if (contact.linkPrecedence === "primary") {
      primaryContact = contact;
    } else if (contact.linkedId) {
      const found = await this.contactRepository.findPrimaryContact(
        contact.linkedId
      );
      if (!found) {
        throw new Error("Primary contact not found for secondary contact");
      }
      primaryContact = found;
    } else {
      throw new Error(
        "Invalid contact state: secondary contact without linkedId"
      );
    }

    // Get all linked contacts
    const allLinkedContacts = await this.contactRepository.findLinkedContacts(
      primaryContact.id
    );

    // Separate primary and secondary contacts
    const secondaryContacts = allLinkedContacts
      .filter((c) => c.linkPrecedence === "secondary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Collect unique emails and phone numbers
    const allEmails: string[] = [];
    const allPhoneNumbers: string[] = [];

    // Add primary contact's information first
    if (primaryContact.email) allEmails.push(primaryContact.email);
    if (primaryContact.phoneNumber)
      allPhoneNumbers.push(primaryContact.phoneNumber);

    // Add secondary contacts' information
    for (const secondary of secondaryContacts) {
      if (secondary.email && !allEmails.includes(secondary.email)) {
        allEmails.push(secondary.email);
      }
      if (
        secondary.phoneNumber &&
        !allPhoneNumbers.includes(secondary.phoneNumber)
      ) {
        allPhoneNumbers.push(secondary.phoneNumber);
      }
    }

    return {
      primaryContact,
      secondaryContacts,
      allEmails,
      allPhoneNumbers,
    };
  }
}
