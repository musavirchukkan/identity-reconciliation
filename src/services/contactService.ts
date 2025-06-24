import { PrismaClient, Contact } from '@prisma/client';

const prisma = new PrismaClient();

export class ContactService {
  async identifyContact(email?: string, phoneNumber?: string) {
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
          email,
          phoneNumber,
          linkPrecedence: 'primary'
        }
      });
      return {
        primaryContact: newContact,
        allLinkedContacts: [newContact]
      };
    }

    // Find the primary contact (oldest one)
    const primaryContact = existingContacts.find(c => c.linkPrecedence === 'primary') || existingContacts[0];
    
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
    const hasNewInfo = (email && !allLinkedContacts.some(c => c.email === email)) ||
                      (phoneNumber && !allLinkedContacts.some(c => c.phoneNumber === phoneNumber));

    let newSecondaryContact = null;
    if (hasNewInfo) {
      newSecondaryContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
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
}
