import {
  formatContactResponse,
  isValidContact,
  sortContactsByCreation,
  groupContactsByPrecedence,
  extractContactIdentifiers,
  findOldestPrimary,
  contactsHaveOverlap,
  validateContactResponse,
} from "../../src/utils/contactUtils";
import { Contact, LinkPrecedence } from "@prisma/client";
import { ConsolidatedContact, ContactResponse } from "../../src/types/contact";

describe("Contact Utils", () => {
  // Sample contact data
  const primaryContact: Contact = {
    id: 1,
    email: "primary@example.com",
    phoneNumber: "123456",
    linkedId: null,
    linkPrecedence: LinkPrecedence.primary,
    createdAt: new Date("2023-04-01T00:00:00.374Z"),
    updatedAt: new Date("2023-04-01T00:00:00.374Z"),
    deletedAt: null,
  };

  const secondaryContact: Contact = {
    id: 2,
    email: "secondary@example.com",
    phoneNumber: "789012",
    linkedId: 1,
    linkPrecedence: LinkPrecedence.secondary,
    createdAt: new Date("2023-04-20T05:30:00.110Z"),
    updatedAt: new Date("2023-04-20T05:30:00.110Z"),
    deletedAt: null,
  };

  const consolidatedContact: ConsolidatedContact = {
    primaryContact,
    secondaryContacts: [secondaryContact],
    allEmails: ["primary@example.com", "secondary@example.com"],
    allPhoneNumbers: ["123456", "789012"],
  };

  describe("formatContactResponse", () => {
    it("should format consolidated contact correctly", () => {
      const result = formatContactResponse(consolidatedContact);

      expect(result).toEqual({
        contact: {
          primaryContactId: 1,
          emails: ["primary@example.com", "secondary@example.com"],
          phoneNumbers: ["123456", "789012"],
          secondaryContactIds: [2],
        },
      });
    });

    it("should handle empty secondary contacts", () => {
      const singleContact: ConsolidatedContact = {
        primaryContact,
        secondaryContacts: [],
        allEmails: ["primary@example.com"],
        allPhoneNumbers: ["123456"],
      };

      const result = formatContactResponse(singleContact);

      expect(result.contact.secondaryContactIds).toEqual([]);
      expect(result.contact.emails).toEqual(["primary@example.com"]);
    });

    it("should prioritize primary contact email and phone", () => {
      const consolidatedWithReordering: ConsolidatedContact = {
        primaryContact,
        secondaryContacts: [secondaryContact],
        allEmails: ["secondary@example.com", "primary@example.com"], // Secondary first
        allPhoneNumbers: ["789012", "123456"], // Secondary first
      };

      const result = formatContactResponse(consolidatedWithReordering);

      expect(result.contact.emails[0]).toBe("primary@example.com");
      expect(result.contact.phoneNumbers[0]).toBe("123456");
    });
  });

  describe("isValidContact", () => {
    it("should return true for non-deleted contacts", () => {
      expect(isValidContact(primaryContact)).toBe(true);
    });

    it("should return false for deleted contacts", () => {
      const deletedContact = { ...primaryContact, deletedAt: new Date() };
      expect(isValidContact(deletedContact)).toBe(false);
    });
  });

  describe("sortContactsByCreation", () => {
    it("should sort contacts by creation date (oldest first)", () => {
      const olderContact = {
        ...primaryContact,
        createdAt: new Date("2023-01-01"),
      };
      const newerContact = {
        ...secondaryContact,
        createdAt: new Date("2023-12-01"),
      };

      const contacts = [newerContact, olderContact];
      const sorted = sortContactsByCreation(contacts);

      expect(sorted[0]).toEqual(olderContact);
      expect(sorted[1]).toEqual(newerContact);
    });

    it("should not mutate original array", () => {
      const contacts = [secondaryContact, primaryContact];
      const originalOrder = [...contacts];

      sortContactsByCreation(contacts);

      expect(contacts).toEqual(originalOrder);
    });
  });

  describe("groupContactsByPrecedence", () => {
    it("should group contacts by primary and secondary", () => {
      const contacts = [primaryContact, secondaryContact];
      const grouped = groupContactsByPrecedence(contacts);

      expect(grouped.primary).toEqual([primaryContact]);
      expect(grouped.secondary).toEqual([secondaryContact]);
    });

    it("should handle empty arrays", () => {
      const grouped = groupContactsByPrecedence([]);

      expect(grouped.primary).toEqual([]);
      expect(grouped.secondary).toEqual([]);
    });
  });

  describe("extractContactIdentifiers", () => {
    it("should extract unique emails and phone numbers", () => {
      const contacts = [
        primaryContact,
        secondaryContact,
        { ...primaryContact, id: 3, email: "primary@example.com" }, // Duplicate email
      ];

      const result = extractContactIdentifiers(contacts);

      expect(result.emails).toEqual([
        "primary@example.com",
        "secondary@example.com",
      ]);
      expect(result.phoneNumbers).toEqual(["123456", "789012"]);
    });

    it("should handle contacts with null email/phone", () => {
      const contactWithNulls = {
        ...primaryContact,
        email: null,
        phoneNumber: null,
      };
      const result = extractContactIdentifiers([contactWithNulls]);

      expect(result.emails).toEqual([]);
      expect(result.phoneNumbers).toEqual([]);
    });
  });

  describe("findOldestPrimary", () => {
    it("should find the oldest primary contact", () => {
      const olderPrimary = {
        ...primaryContact,
        id: 3,
        createdAt: new Date("2023-01-01"),
      };
      const newerPrimary = {
        ...primaryContact,
        id: 4,
        createdAt: new Date("2023-12-01"),
      };

      const contacts = [newerPrimary, secondaryContact, olderPrimary];
      const oldest = findOldestPrimary(contacts);

      expect(oldest).toEqual(olderPrimary);
    });

    it("should return null when no primary contacts exist", () => {
      const contacts = [secondaryContact];
      const oldest = findOldestPrimary(contacts);

      expect(oldest).toBeNull();
    });

    it("should return null for empty array", () => {
      const oldest = findOldestPrimary([]);
      expect(oldest).toBeNull();
    });
  });

  describe("contactsHaveOverlap", () => {
    it("should detect email overlap", () => {
      const contact1 = { ...primaryContact, email: "same@example.com" };
      const contact2 = { ...secondaryContact, email: "same@example.com" };

      expect(contactsHaveOverlap(contact1, contact2)).toBe(true);
    });

    it("should detect phone number overlap", () => {
      const contact1 = { ...primaryContact, phoneNumber: "123456" };
      const contact2 = { ...secondaryContact, phoneNumber: "123456" };

      expect(contactsHaveOverlap(contact1, contact2)).toBe(true);
    });

    it("should return false when no overlap", () => {
      expect(contactsHaveOverlap(primaryContact, secondaryContact)).toBe(false);
    });

    it("should handle null values", () => {
      const contactWithNulls = {
        ...primaryContact,
        email: null,
        phoneNumber: null,
      };

      expect(contactsHaveOverlap(contactWithNulls, secondaryContact)).toBe(
        false
      );
    });
  });

  describe("validateContactResponse", () => {
    it("should validate correct contact response format", () => {
      const validResponse: ContactResponse = {
        contact: {
          primaryContactId: 1,
          emails: ["test@example.com"],
          phoneNumbers: ["123456"],
          secondaryContactIds: [2, 3],
        },
      };

      expect(validateContactResponse(validResponse)).toBe(true);
    });

    it("should reject response with missing primaryContactId", () => {
      const invalidResponse = {
        contact: {
          emails: ["test@example.com"],
          phoneNumbers: ["123456"],
          secondaryContactIds: [2],
        },
      } as any;

      expect(validateContactResponse(invalidResponse)).toBe(false);
    });

    it("should reject response with non-array emails", () => {
      const invalidResponse = {
        contact: {
          primaryContactId: 1,
          emails: "not-an-array",
          phoneNumbers: ["123456"],
          secondaryContactIds: [2],
        },
      } as any;

      expect(validateContactResponse(invalidResponse)).toBe(false);
    });

    it("should reject response with invalid array contents", () => {
      const invalidResponse = {
        contact: {
          primaryContactId: 1,
          emails: [123], // Should be strings
          phoneNumbers: ["123456"],
          secondaryContactIds: [2],
        },
      } as any;

      expect(validateContactResponse(invalidResponse)).toBe(false);
    });

    it("should reject response with no identifiers", () => {
      const invalidResponse = {
        contact: {
          primaryContactId: 1,
          emails: [],
          phoneNumbers: [],
          secondaryContactIds: [2],
        },
      };

      expect(validateContactResponse(invalidResponse)).toBe(false);
    });

    it("should handle malformed responses gracefully", () => {
      expect(validateContactResponse(null as any)).toBe(false);
      expect(validateContactResponse(undefined as any)).toBe(false);
      expect(validateContactResponse({} as any)).toBe(false);
    });
  });
});
