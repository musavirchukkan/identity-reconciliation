import { Contact, LinkPrecedence } from "@prisma/client";
import { prisma } from "../utils/database";
import {
  ContactInput,
  ContactSearchCriteria,
  ContactWithRelations,
} from "../types/contact";

export class ContactRepository {
  /**
   * Find contacts by email or phone number
   */
  async findByEmailOrPhone(
    criteria: ContactSearchCriteria
  ): Promise<Contact[]> {
    const whereClause: any = {
      deletedAt: criteria.includeDeleted ? undefined : null,
    };

    // Build OR condition for email or phone
    const orConditions: any[] = [];

    if (criteria.email) {
      orConditions.push({ email: criteria.email });
    }

    if (criteria.phoneNumber) {
      orConditions.push({ phoneNumber: criteria.phoneNumber });
    }

    if (orConditions.length > 0) {
      whereClause.OR = orConditions;
    }

    return prisma.contact.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Find all contacts in a linked group (primary + all secondaries)
   */
  async findLinkedContacts(primaryContactId: number): Promise<Contact[]> {
    return prisma.contact.findMany({
      where: {
        OR: [{ id: primaryContactId }, { linkedId: primaryContactId }],
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Find primary contact by ID
   */
  async findPrimaryContact(contactId: number): Promise<Contact | null> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId, deletedAt: null },
    });

    if (!contact) return null;

    // If it's already primary, return it
    if (contact.linkPrecedence === "primary") {
      return contact;
    }

    // If it's secondary, find its primary
    if (contact.linkedId) {
      return this.findPrimaryContact(contact.linkedId);
    }

    return null;
  }

  /**
   * Create a new contact
   */
  async create(contactData: ContactInput): Promise<Contact> {
    return prisma.contact.create({
      data: {
        email: contactData.email,
        phoneNumber: contactData.phoneNumber,
        linkedId: contactData.linkedId,
        linkPrecedence: contactData.linkPrecedence,
      },
    });
  }

  /**
   * Update an existing contact
   */
  async update(
    id: number,
    contactData: Partial<ContactInput>
  ): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data: {
        ...contactData,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Convert a primary contact to secondary
   */
  async convertToSecondary(
    contactId: number,
    primaryContactId: number
  ): Promise<Contact> {
    return prisma.contact.update({
      where: { id: contactId },
      data: {
        linkedId: primaryContactId,
        linkPrecedence: "secondary",
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Check if exact contact already exists
   */
  async findExactMatch(
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<Contact | null> {
    if (!email && !phoneNumber) return null;

    return prisma.contact.findFirst({
      where: {
        email: email || null,
        phoneNumber: phoneNumber || null,
        deletedAt: null,
      },
    });
  }

  /**
   * Get all contacts for debugging (development only)
   */
  async findAll(): Promise<Contact[]> {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("This method is only available in development mode");
    }

    return prisma.contact.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Delete a contact (soft delete)
   */
  async softDelete(id: number): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}
