import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContactService } from '../services/contactService';

const contactService = new ContactService();

// Phone number validation (basic - can be enhanced)
const phoneRegex = /^\+?[\d\s\-\(\)]{7,}$/;

const identifyRequestSchema = z.object({
  email: z.string().email().nullable().optional(),
  phoneNumber: z.string().regex(phoneRegex, "Invalid phone number format").nullable().optional(),
}).refine(data => data.email || data.phoneNumber, {
  message: "At least one of email or phoneNumber must be provided"
});

export async function identifyContact(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = identifyRequestSchema.parse(req.body);
    const { email, phoneNumber } = validatedData;
    
    // Convert empty strings to null
    const cleanEmail = email === '' ? null : email;
    const cleanPhoneNumber = phoneNumber === '' ? null : phoneNumber;
    
    const { primaryContact, allLinkedContacts } = await contactService.identifyContact(cleanEmail, cleanPhoneNumber);

    // Collect all emails and phone numbers
    const emails = [...new Set(allLinkedContacts.map((c: any) => c.email).filter(Boolean))];
    const phoneNumbers = [...new Set(allLinkedContacts.map((c: any) => c.phoneNumber).filter(Boolean))];
    const secondaryContactIds = allLinkedContacts
      .filter((c: any) => c.id !== primaryContact.id)
      .map((c: any) => c.id);

    return res.status(200).json({
      contact: {
        primaryContactId: primaryContact.id,
        emails,
        phoneNumbers,
        secondaryContactIds
      }
    });
  } catch (err) {
    next(err);
  }
}