import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ContactService {
  async identifyContact(email?: string | null, phoneNumber?: string | null) {
    // Find existing contacts that match email or phone
    const existingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : [])
        ],
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    if (existingContacts.length === 0) {
      // Create new primary contact
      const newContact = await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkPrecedence: 'primary'
        }
      });
      return {
        primaryContact: newContact,
        allLinkedContacts: [newContact]
      };
    }

    // Get all contact groups that need to be merged
    const contactGroups = await this.getContactGroups(existingContacts);
    
    // If we have multiple groups, merge them
    if (contactGroups.length > 1) {
      return await this.mergeContactGroups(contactGroups, email, phoneNumber);
    }

    // Single group - find the primary contact
    const primaryContact = contactGroups[0].find((c: any) => c.linkPrecedence === 'primary') || contactGroups[0][0];
    
    // Get all linked contacts
    const allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primaryContact.id },
          { linkedId: primaryContact.id }
        ],
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    // Check if we need to create a new secondary contact
    const hasNewInfo = (email && !allLinkedContacts.some((c: any) => c.email === email)) ||
                      (phoneNumber && !allLinkedContacts.some((c: any) => c.phoneNumber === phoneNumber));

    if (hasNewInfo) {
      const newSecondaryContact = await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkedId: primaryContact.id,
          linkPrecedence: 'secondary'
        }
      });
      allLinkedContacts.push(newSecondaryContact);
    }

    return {
      primaryContact,
      allLinkedContacts
    };
  }

  private async getContactGroups(contacts: any[]) {
    const groups: any[][] = [];
    const visited = new Set();

    for (const contact of contacts) {
      if (visited.has(contact.id)) continue;

      const group = await this.getLinkedContacts(contact);
      groups.push(group);
      
      for (const c of group) {
        visited.add(c.id);
      }
    }

    return groups;
  }

  private async getLinkedContacts(contact: any) {
    const linkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: contact.id },
          { linkedId: contact.id }
        ],
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    // Also find contacts that link to this one
    const linkingContacts = await prisma.contact.findMany({
      where: {
        linkedId: contact.id,
        deletedAt: null
      }
    });

    return [...linkedContacts, ...linkingContacts];
  }

  private async mergeContactGroups(contactGroups: any[][], email?: string | null, phoneNumber?: string | null) {
    // Find the oldest contact across all groups (this becomes primary)
    const allContacts = contactGroups.flat();
    const oldestContact = allContacts.reduce((oldest: any, current: any) => 
      current.createdAt < oldest.createdAt ? current : oldest
    );

    // Update the oldest contact to be primary
    await prisma.contact.update({
      where: { id: oldestContact.id },
      data: { 
        linkPrecedence: 'primary',
        linkedId: null
      }
    });

    // Update all other contacts to be secondary and link to the oldest
    for (const contact of allContacts) {
      if (contact.id !== oldestContact.id) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { 
            linkPrecedence: 'secondary',
            linkedId: oldestContact.id
          }
        });
      }
    }

    // Check if we need to create a new secondary contact with the new info
    const hasNewInfo = (email && !allContacts.some((c: any) => c.email === email)) ||
                      (phoneNumber && !allContacts.some((c: any) => c.phoneNumber === phoneNumber));

    if (hasNewInfo) {
      await prisma.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkedId: oldestContact.id,
          linkPrecedence: 'secondary'
        }
      });
    }

    // Get all linked contacts after merging
    const allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: oldestContact.id },
          { linkedId: oldestContact.id }
        ],
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    return {
      primaryContact: oldestContact,
      allLinkedContacts
    };
  }
}
