import { Contact } from "@prisma/client";
import {
  ValidationError,
  BusinessLogicError,
} from "../middleware/errorHandler";
import { createModuleLogger } from "./logger";

const logger = createModuleLogger("EdgeCaseHandler");

/**
 * Handle edge cases and data validation for identity reconciliation
 */

export class EdgeCaseHandler {
  /**
   * Validate contact data integrity
   */
  static validateContactIntegrity(contact: Contact): void {
    // Check for orphaned secondary contacts
    if (contact.linkPrecedence === "secondary" && !contact.linkedId) {
      logger.error("Orphaned secondary contact detected", {
        contactId: contact.id,
      });
      throw new BusinessLogicError(
        "Invalid contact state: secondary contact without linkedId"
      );
    }

    // Check for primary contacts with linkedId
    if (contact.linkPrecedence === "primary" && contact.linkedId) {
      logger.error("Primary contact with linkedId detected", {
        contactId: contact.id,
      });
      throw new BusinessLogicError(
        "Invalid contact state: primary contact cannot have linkedId"
      );
    }

    // Check for self-referencing contacts
    if (contact.linkedId === contact.id) {
      logger.error("Self-referencing contact detected", {
        contactId: contact.id,
      });
      throw new BusinessLogicError(
        "Invalid contact state: contact cannot link to itself"
      );
    }

    // Check for soft-deleted contacts in active operations
    if (contact.deletedAt && contact.deletedAt <= new Date()) {
      logger.warn("Deleted contact in active operation", {
        contactId: contact.id,
      });
      throw new BusinessLogicError("Cannot operate on deleted contact");
    }

    // Validate that contact has at least one identifier
    if (!contact.email && !contact.phoneNumber) {
      logger.error("Contact without identifiers detected", {
        contactId: contact.id,
      });
      throw new BusinessLogicError(
        "Contact must have at least one identifier (email or phone)"
      );
    }
  }

  /**
   * Handle circular reference detection in contact chains
   */
  static detectCircularReferences(contacts: Contact[]): void {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    const dfs = (contactId: number): boolean => {
      if (recursionStack.has(contactId)) {
        logger.error("Circular reference detected in contact chain", {
          contactId,
          chain: Array.from(recursionStack),
        });
        return true;
      }

      if (visited.has(contactId)) {
        return false;
      }

      visited.add(contactId);
      recursionStack.add(contactId);

      // Find contacts that link to this one
      const linkedContacts = contacts.filter((c) => c.linkedId === contactId);

      for (const linkedContact of linkedContacts) {
        if (dfs(linkedContact.id)) {
          return true;
        }
      }

      recursionStack.delete(contactId);
      return false;
    };

    // Check each contact for circular references
    for (const contact of contacts) {
      if (contact.linkPrecedence === "primary" && dfs(contact.id)) {
        throw new BusinessLogicError(
          "Circular reference detected in contact hierarchy"
        );
      }
    }
  }

  /**
   * Handle maximum depth validation for contact chains
   */
  static validateContactChainDepth(
    contacts: Contact[],
    maxDepth: number = 10
  ): void {
    const getChainDepth = (
      contactId: number,
      visited: Set<number> = new Set()
    ): number => {
      if (visited.has(contactId)) {
        throw new BusinessLogicError("Circular reference in contact chain");
      }

      visited.add(contactId);

      const secondaryContacts = contacts.filter(
        (c) => c.linkedId === contactId
      );

      if (secondaryContacts.length === 0) {
        return 1;
      }

      let maxChildDepth = 0;
      for (const secondary of secondaryContacts) {
        const childDepth = getChainDepth(secondary.id, new Set(visited));
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }

      return 1 + maxChildDepth;
    };

    const primaryContacts = contacts.filter(
      (c) => c.linkPrecedence === "primary"
    );

    for (const primary of primaryContacts) {
      const depth = getChainDepth(primary.id);

      if (depth > maxDepth) {
        logger.error("Contact chain exceeds maximum depth", {
          primaryContactId: primary.id,
          depth,
          maxDepth,
        });
        throw new BusinessLogicError(
          `Contact chain depth (${depth}) exceeds maximum allowed (${maxDepth})`
        );
      }
    }
  }

  /**
   * Handle duplicate email/phone validation across contacts
   */
  static validateNoDuplicateIdentifiers(contacts: Contact[]): void {
    const emailMap = new Map<string, number[]>();
    const phoneMap = new Map<string, number[]>();

    // Build maps of email/phone to contact IDs
    for (const contact of contacts) {
      if (contact.email) {
        const existing = emailMap.get(contact.email) || [];
        existing.push(contact.id);
        emailMap.set(contact.email, existing);
      }

      if (contact.phoneNumber) {
        const existing = phoneMap.get(contact.phoneNumber) || [];
        existing.push(contact.id);
        phoneMap.set(contact.phoneNumber, existing);
      }
    }

    // Check for duplicates within unlinked contacts
    for (const [email, contactIds] of emailMap.entries()) {
      if (contactIds.length > 1) {
        const contactsWithEmail = contacts.filter((c) =>
          contactIds.includes(c.id)
        );
        const linkedGroups = this.groupContactsByPrimaryLink(contactsWithEmail);

        if (linkedGroups.length > 1) {
          logger.error("Email appears in multiple unlinked contact groups", {
            email,
            contactIds,
            groups: linkedGroups.length,
          });
          throw new BusinessLogicError(
            `Email ${email} exists in multiple unlinked contact groups`
          );
        }
      }
    }

    for (const [phone, contactIds] of phoneMap.entries()) {
      if (contactIds.length > 1) {
        const contactsWithPhone = contacts.filter((c) =>
          contactIds.includes(c.id)
        );
        const linkedGroups = this.groupContactsByPrimaryLink(contactsWithPhone);

        if (linkedGroups.length > 1) {
          logger.error(
            "Phone number appears in multiple unlinked contact groups",
            {
              phone,
              contactIds,
              groups: linkedGroups.length,
            }
          );
          throw new BusinessLogicError(
            `Phone ${phone} exists in multiple unlinked contact groups`
          );
        }
      }
    }
  }

  /**
   * Group contacts by their primary link (helper method)
   */
  private static groupContactsByPrimaryLink(contacts: Contact[]): Contact[][] {
    const groups: Contact[][] = [];
    const processed = new Set<number>();

    for (const contact of contacts) {
      if (processed.has(contact.id)) continue;

      const group: Contact[] = [];

      // Find the primary contact for this group
      let primaryContact = contact;
      if (contact.linkPrecedence === "secondary" && contact.linkedId) {
        primaryContact =
          contacts.find((c) => c.id === contact.linkedId) || contact;
      }

      // Add all contacts in this group
      group.push(primaryContact);
      processed.add(primaryContact.id);

      // Add all secondary contacts linked to this primary
      for (const otherContact of contacts) {
        if (
          otherContact.linkedId === primaryContact.id &&
          !processed.has(otherContact.id)
        ) {
          group.push(otherContact);
          processed.add(otherContact.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Handle timezone-related edge cases for createdAt/updatedAt
   */
  static validateContactTimestamps(contact: Contact): void {
    const now = new Date();

    // Check for future timestamps
    if (contact.createdAt > now) {
      logger.warn("Contact with future creation date", {
        contactId: contact.id,
        createdAt: contact.createdAt.toISOString(),
        now: now.toISOString(),
      });
      throw new ValidationError(
        "Contact creation date cannot be in the future"
      );
    }

    // Check for invalid timestamp order
    if (contact.updatedAt < contact.createdAt) {
      logger.error("Contact with invalid timestamp order", {
        contactId: contact.id,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      });
      throw new ValidationError(
        "Contact updated date cannot be before creation date"
      );
    }

    // Check deleted timestamp validity
    if (contact.deletedAt) {
      if (contact.deletedAt < contact.createdAt) {
        throw new ValidationError(
          "Contact deletion date cannot be before creation date"
        );
      }
      if (contact.deletedAt > now) {
        throw new ValidationError(
          "Contact deletion date cannot be in the future"
        );
      }
    }
  }

  /**
   * Handle memory and performance edge cases
   */
  static validatePerformanceConstraints(contacts: Contact[]): void {
    const maxContactsPerOperation = 1000; // Configurable limit

    if (contacts.length > maxContactsPerOperation) {
      logger.error("Too many contacts in single operation", {
        contactCount: contacts.length,
        maxAllowed: maxContactsPerOperation,
      });
      throw new BusinessLogicError(
        `Operation involves too many contacts (${contacts.length}). Maximum allowed: ${maxContactsPerOperation}`
      );
    }

    // Check for suspicious patterns that might indicate data corruption
    const uniqueEmails = new Set(contacts.map((c) => c.email).filter(Boolean));
    const uniquePhones = new Set(
      contacts.map((c) => c.phoneNumber).filter(Boolean)
    );

    // If we have way more contacts than unique identifiers, something might be wrong
    const identifierRatio =
      contacts.length / (uniqueEmails.size + uniquePhones.size);

    if (identifierRatio > 5) {
      logger.warn("Suspicious contact-to-identifier ratio detected", {
        contactCount: contacts.length,
        uniqueEmails: uniqueEmails.size,
        uniquePhones: uniquePhones.size,
        ratio: identifierRatio,
      });
    }
  }

  /**
   * Handle input sanitization for security
   */
  static sanitizeContactInput(
    email?: string | null,
    phoneNumber?: string | null
  ): {
    email: string | null;
    phoneNumber: string | null;
  } {
    // Sanitize email
    let sanitizedEmail: string | null = null;
    if (email && typeof email === "string") {
      // Remove dangerous characters, trim whitespace
      sanitizedEmail = email
        .trim()
        .toLowerCase()
        .replace(/[<>'"]/g, "") // Remove potential XSS characters
        .substring(0, 254); // RFC 5321 limit

      // Validate it's still a valid email after sanitization
      if (sanitizedEmail.length === 0 || !sanitizedEmail.includes("@")) {
        sanitizedEmail = null;
      }
    }

    // Sanitize phone number
    let sanitizedPhone: string | null = null;
    if (
      phoneNumber &&
      (typeof phoneNumber === "string" || typeof phoneNumber === "number")
    ) {
      sanitizedPhone = phoneNumber
        .toString()
        .replace(/[^\d\+\-\s\(\)\.]/g, "") // Remove non-phone characters
        .trim()
        .substring(0, 20); // Reasonable length limit

      if (sanitizedPhone.length === 0) {
        sanitizedPhone = null;
      }
    }

    return {
      email: sanitizedEmail,
      phoneNumber: sanitizedPhone,
    };
  }

  /**
   * Handle concurrent modification detection
   */
  static validateConcurrentModification(
    originalContact: Contact,
    currentContact: Contact
  ): void {
    // Check if the contact was modified since we last read it
    if (
      originalContact.updatedAt.getTime() !== currentContact.updatedAt.getTime()
    ) {
      logger.warn("Concurrent modification detected", {
        contactId: originalContact.id,
        originalUpdatedAt: originalContact.updatedAt.toISOString(),
        currentUpdatedAt: currentContact.updatedAt.toISOString(),
      });
      throw new BusinessLogicError(
        "Contact was modified by another process. Please retry the operation."
      );
    }
  }

  /**
   * Handle database constraint violations gracefully
   */
  static handleDatabaseConstraintError(error: Error): never {
    const errorMessage = error.message.toLowerCase();

    if (
      errorMessage.includes("unique constraint") ||
      errorMessage.includes("duplicate")
    ) {
      throw new BusinessLogicError("Duplicate contact information detected");
    }

    if (errorMessage.includes("foreign key constraint")) {
      throw new BusinessLogicError("Invalid contact relationship detected");
    }

    if (errorMessage.includes("not null constraint")) {
      throw new ValidationError("Required contact information is missing");
    }

    if (errorMessage.includes("check constraint")) {
      throw new ValidationError("Contact data violates business rules");
    }

    // Re-throw as generic business logic error
    throw new BusinessLogicError(`Database operation failed: ${error.message}`);
  }
}
