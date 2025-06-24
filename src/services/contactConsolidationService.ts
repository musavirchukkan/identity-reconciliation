import { Contact, LinkPrecedence } from "@prisma/client";
import { ContactRepository } from "../models/contactRepository";
import { ContactSearchService } from "./contactSearchService";
import { ConsolidatedContact } from "../types/contact";
import {
  findOldestPrimary,
  sortContactsByCreation,
} from "../utils/contactUtils";

export class ContactConsolidationService {
  private contactRepository: ContactRepository;
  private contactSearchService: ContactSearchService;

  constructor() {
    this.contactRepository = new ContactRepository();
    this.contactSearchService = new ContactSearchService();
  }

  /**
   * Consolidate multiple primary contacts into a single group
   * This happens when a new contact request links previously separate primary contacts
   */
  async consolidatePrimaryContacts(
    primaryContacts: Contact[],
    newEmail?: string | null,
    newPhoneNumber?: string | null
  ): Promise<ConsolidatedContact> {
    if (primaryContacts.length === 0) {
      throw new Error("No primary contacts provided for consolidation");
    }

    if (primaryContacts.length === 1) {
      // Only one primary - handle as normal secondary creation
      return this.handleSinglePrimaryConsolidation(
        primaryContacts[0],
        newEmail,
        newPhoneNumber
      );
    }

    // Multiple primaries - need to merge them
    return this.mergePrimaryContacts(primaryContacts, newEmail, newPhoneNumber);
  }

  /**
   * Handle consolidation when there's only one primary contact
   */
  private async handleSinglePrimaryConsolidation(
    primaryContact: Contact,
    newEmail?: string | null,
    newPhoneNumber?: string | null
  ): Promise<ConsolidatedContact> {
    // Check if we need to create a new secondary contact
    const needsNewContact = this.shouldCreateNewContact(
      primaryContact,
      newEmail,
      newPhoneNumber
    );

    if (needsNewContact) {
      await this.contactRepository.create({
        email: newEmail,
        phoneNumber: newPhoneNumber,
        linkedId: primaryContact.id,
        linkPrecedence: LinkPrecedence.secondary,
      });
    }

    // Return consolidated view
    return this.buildConsolidatedContact(primaryContact.id);
  }

  /**
   * Merge multiple primary contacts into a single group
   */
  private async mergePrimaryContacts(
    primaryContacts: Contact[],
    newEmail?: string | null,
    newPhoneNumber?: string | null
  ): Promise<ConsolidatedContact> {
    // Find the oldest primary contact (will remain primary)
    const oldestPrimary = findOldestPrimary(primaryContacts);
    if (!oldestPrimary) {
      throw new Error("No valid primary contact found for consolidation");
    }

    // Get all contacts that need to be relinked
    const contactsToRelink = await this.getAllContactsToRelink(
      primaryContacts,
      oldestPrimary.id
    );

    // Convert other primaries to secondary and relink their children
    await this.relinkContactHierarchies(contactsToRelink, oldestPrimary.id);

    // Create new secondary contact if needed
    const needsNewContact = this.shouldCreateNewContact(
      oldestPrimary,
      newEmail,
      newPhoneNumber
    );

    if (needsNewContact) {
      await this.contactRepository.create({
        email: newEmail,
        phoneNumber: newPhoneNumber,
        linkedId: oldestPrimary.id,
        linkPrecedence: LinkPrecedence.secondary,
      });
    }

    // Return consolidated view
    return this.buildConsolidatedContact(oldestPrimary.id);
  }

  /**
   * Get all contacts that need to be relinked during consolidation
   */
  private async getAllContactsToRelink(
    primaryContacts: Contact[],
    keepPrimaryId: number
  ): Promise<RelinkingGroup[]> {
    const relinkingGroups: RelinkingGroup[] = [];

    for (const primary of primaryContacts) {
      if (primary.id === keepPrimaryId) continue;

      // Get all secondary contacts linked to this primary
      const secondaryContacts = await this.contactRepository.findLinkedContacts(
        primary.id
      );
      const secondaries = secondaryContacts.filter(
        (c) => c.linkPrecedence === "secondary"
      );

      relinkingGroups.push({
        oldPrimaryContact: primary,
        secondaryContacts: secondaries,
        newPrimaryId: keepPrimaryId,
      });
    }

    return relinkingGroups;
  }

  /**
   * Relink contact hierarchies to the new primary
   */
  private async relinkContactHierarchies(
    relinkingGroups: RelinkingGroup[],
    newPrimaryId: number
  ): Promise<void> {
    for (const group of relinkingGroups) {
      // Convert old primary to secondary
      await this.contactRepository.convertToSecondary(
        group.oldPrimaryContact.id,
        newPrimaryId
      );

      // Relink all secondary contacts to the new primary
      for (const secondary of group.secondaryContacts) {
        await this.contactRepository.update(secondary.id, {
          linkedId: newPrimaryId,
        });
      }
    }
  }

  /**
   * Check if a new contact should be created
   */
  private shouldCreateNewContact(
    existingContact: Contact,
    newEmail?: string | null,
    newPhoneNumber?: string | null
  ): boolean {
    // Don't create if no new information
    if (!newEmail && !newPhoneNumber) return false;

    // Don't create if exact match exists
    if (
      existingContact.email === newEmail &&
      existingContact.phoneNumber === newPhoneNumber
    ) {
      return false;
    }

    // Create if there's new information
    return (
      (newEmail && newEmail !== existingContact.email) ||
      (newPhoneNumber && newPhoneNumber !== existingContact.phoneNumber)
    );
  }

  /**
   * Build consolidated contact view
   */
  private async buildConsolidatedContact(
    primaryContactId: number
  ): Promise<ConsolidatedContact> {
    // Get primary contact
    const primaryContact = await this.contactRepository.findPrimaryContact(
      primaryContactId
    );
    if (!primaryContact) {
      throw new Error(`Primary contact with ID ${primaryContactId} not found`);
    }

    // Get all linked contacts
    const allLinkedContacts = await this.contactRepository.findLinkedContacts(
      primaryContactId
    );

    // Separate secondary contacts
    const secondaryContacts = allLinkedContacts
      .filter((c) => c.linkPrecedence === "secondary")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Collect unique emails and phone numbers
    const allEmails: string[] = [];
    const allPhoneNumbers: string[] = [];

    // Add primary contact info first
    if (primaryContact.email) allEmails.push(primaryContact.email);
    if (primaryContact.phoneNumber)
      allPhoneNumbers.push(primaryContact.phoneNumber);

    // Add secondary contact info
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

  /**
   * Validate consolidation operation
   */
  async validateConsolidation(
    primaryContacts: Contact[]
  ): Promise<ConsolidationValidation> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check if all contacts are valid primaries
    const invalidPrimaries = primaryContacts.filter(
      (c) => c.linkPrecedence !== "primary"
    );
    if (invalidPrimaries.length > 0) {
      issues.push(
        `Found ${invalidPrimaries.length} non-primary contacts in primary list`
      );
    }

    // Check for deleted contacts
    const deletedContacts = primaryContacts.filter((c) => c.deletedAt !== null);
    if (deletedContacts.length > 0) {
      warnings.push(`Found ${deletedContacts.length} deleted contacts`);
    }

    // Check for orphaned secondary contacts
    for (const primary of primaryContacts) {
      const linkedContacts = await this.contactRepository.findLinkedContacts(
        primary.id
      );
      const orphanedSecondaries = linkedContacts.filter(
        (c) => c.linkPrecedence === "secondary" && c.linkedId !== primary.id
      );

      if (orphanedSecondaries.length > 0) {
        warnings.push(
          `Primary ${primary.id} has ${orphanedSecondaries.length} orphaned secondaries`
        );
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      contactCount: primaryContacts.length,
    };
  }

  /**
   * Get consolidation statistics
   */
  async getConsolidationStats(): Promise<ConsolidationStats> {
    if (process.env.NODE_ENV !== "development") {
      throw new Error(
        "Consolidation stats are only available in development mode"
      );
    }

    const allContacts = await this.contactRepository.findAll();
    const primaryContacts = allContacts.filter(
      (c) => c.linkPrecedence === "primary"
    );

    let totalSecondaries = 0;
    let maxSecondariesPerPrimary = 0;

    for (const primary of primaryContacts) {
      const linkedContacts = await this.contactRepository.findLinkedContacts(
        primary.id
      );
      const secondaryCount = linkedContacts.filter(
        (c) => c.linkPrecedence === "secondary"
      ).length;
      totalSecondaries += secondaryCount;
      maxSecondariesPerPrimary = Math.max(
        maxSecondariesPerPrimary,
        secondaryCount
      );
    }

    return {
      totalPrimaryContacts: primaryContacts.length,
      totalSecondaryContacts: totalSecondaries,
      averageSecondariesPerPrimary:
        primaryContacts.length > 0
          ? totalSecondaries / primaryContacts.length
          : 0,
      maxSecondariesPerPrimary,
    };
  }
}

// Supporting types
interface RelinkingGroup {
  oldPrimaryContact: Contact;
  secondaryContacts: Contact[];
  newPrimaryId: number;
}

interface ConsolidationValidation {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  contactCount: number;
}

interface ConsolidationStats {
  totalPrimaryContacts: number;
  totalSecondaryContacts: number;
  averageSecondariesPerPrimary: number;
  maxSecondariesPerPrimary: number;
}
