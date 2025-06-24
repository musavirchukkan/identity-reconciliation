import { IdentityLinkingService } from "../../src/services/identityLinkingService";
import { ContactRepository } from "../../src/models/contactRepository";
import { ContactSearchService } from "../../src/services/contactSearchService";
import { Contact, LinkPrecedence } from "@prisma/client";

// Mock the dependencies
jest.mock("../../src/models/contactRepository");
jest.mock("../../src/services/contactSearchService");

describe("IdentityLinkingService", () => {
  let service: IdentityLinkingService;
  let mockContactRepository: jest.Mocked<ContactRepository>;
  let mockContactSearchService: jest.Mocked<ContactSearchService>;

  // Sample contact data
  const mockPrimaryContact: Contact = {
    id: 1,
    email: "lorraine@hillvalley.edu",
    phoneNumber: "123456",
    linkedId: null,
    linkPrecedence: LinkPrecedence.primary,
    createdAt: new Date("2023-04-01T00:00:00.374Z"),
    updatedAt: new Date("2023-04-01T00:00:00.374Z"),
    deletedAt: null,
  };

  const mockSecondaryContact: Contact = {
    id: 2,
    email: "mcfly@hillvalley.edu",
    phoneNumber: "123456",
    linkedId: 1,
    linkPrecedence: LinkPrecedence.secondary,
    createdAt: new Date("2023-04-20T05:30:00.110Z"),
    updatedAt: new Date("2023-04-20T05:30:00.110Z"),
    deletedAt: null,
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    service = new IdentityLinkingService();

    // Get mocked instances
    mockContactRepository = (
      ContactRepository as jest.MockedClass<typeof ContactRepository>
    ).mock.instances[0] as jest.Mocked<ContactRepository>;
    mockContactSearchService = (
      ContactSearchService as jest.MockedClass<typeof ContactSearchService>
    ).mock.instances[0] as jest.Mocked<ContactSearchService>;
  });

  describe("identifyContact", () => {
    it("should throw error when neither email nor phone provided", async () => {
      await expect(service.identifyContact()).rejects.toThrow(
        "Either email or phone number must be provided"
      );
      await expect(service.identifyContact("", "")).rejects.toThrow(
        "Either email or phone number must be provided"
      );
    });

    it("should return existing contact when exact match found", async () => {
      // Setup mocks
      mockContactSearchService.findExactContactMatch.mockResolvedValue(
        mockPrimaryContact
      );
      mockContactRepository.findLinkedContacts.mockResolvedValue([
        mockPrimaryContact,
        mockSecondaryContact,
      ]);

      const result = await service.identifyContact(
        "lorraine@hillvalley.edu",
        "123456"
      );

      expect(result.primaryContact).toEqual(mockPrimaryContact);
      expect(result.secondaryContacts).toEqual([mockSecondaryContact]);
      expect(result.allEmails).toEqual([
        "lorraine@hillvalley.edu",
        "mcfly@hillvalley.edu",
      ]);
      expect(result.allPhoneNumbers).toEqual(["123456"]);
    });

    it("should create new primary contact when no matches found", async () => {
      // Setup mocks
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockResolvedValue({
        emailMatches: [],
        phoneMatches: [],
        hasEmailMatch: false,
        hasPhoneMatch: false,
      });

      const newContact = {
        ...mockPrimaryContact,
        id: 3,
        email: "new@test.com",
      };
      mockContactRepository.create.mockResolvedValue(newContact);

      const result = await service.identifyContact("new@test.com", "789012");

      expect(mockContactRepository.create).toHaveBeenCalledWith({
        email: "new@test.com",
        phoneNumber: "789012",
        linkPrecedence: LinkPrecedence.primary,
      });

      expect(result.primaryContact).toEqual(newContact);
      expect(result.secondaryContacts).toEqual([]);
      expect(result.allEmails).toEqual(["new@test.com"]);
      expect(result.allPhoneNumbers).toEqual(["789012"]);
    });

    it("should create secondary contact when partial match found", async () => {
      // Setup mocks
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockResolvedValue({
        emailMatches: [],
        phoneMatches: [mockPrimaryContact],
        hasEmailMatch: false,
        hasPhoneMatch: true,
      });
      mockContactSearchService.findAllRelatedContacts.mockResolvedValue([
        mockPrimaryContact,
      ]);

      const newSecondaryContact = {
        ...mockSecondaryContact,
        id: 4,
        email: "new@test.com",
        linkedId: 1,
      };
      mockContactRepository.create.mockResolvedValue(newSecondaryContact);
      mockContactRepository.findLinkedContacts.mockResolvedValue([
        mockPrimaryContact,
        newSecondaryContact,
      ]);

      const result = await service.identifyContact("new@test.com", "123456");

      expect(mockContactRepository.create).toHaveBeenCalledWith({
        email: "new@test.com",
        phoneNumber: "123456",
        linkedId: 1,
        linkPrecedence: LinkPrecedence.secondary,
      });

      expect(result.primaryContact.id).toBe(1);
      expect(result.secondaryContacts).toHaveLength(1);
    });

    it("should handle complex linking scenario with multiple primary contacts", async () => {
      const anotherPrimaryContact: Contact = {
        id: 5,
        email: "george@hillvalley.edu",
        phoneNumber: "789012",
        linkedId: null,
        linkPrecedence: LinkPrecedence.primary,
        createdAt: new Date("2023-04-11T00:00:00.374Z"),
        updatedAt: new Date("2023-04-11T00:00:00.374Z"),
        deletedAt: null,
      };

      // Setup mocks for complex linking
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockResolvedValue({
        emailMatches: [mockPrimaryContact],
        phoneMatches: [anotherPrimaryContact],
        hasEmailMatch: true,
        hasPhoneMatch: true,
      });

      mockContactSearchService.findAllRelatedContacts
        .mockResolvedValueOnce([mockPrimaryContact, mockSecondaryContact]) // For email matches
        .mockResolvedValueOnce([anotherPrimaryContact]); // For phone matches

      mockContactRepository.convertToSecondary.mockResolvedValue(
        anotherPrimaryContact
      );
      mockContactRepository.create.mockResolvedValue(mockSecondaryContact);
      mockContactRepository.findLinkedContacts.mockResolvedValue([
        mockPrimaryContact,
        mockSecondaryContact,
      ]);

      const result = await service.identifyContact(
        "lorraine@hillvalley.edu",
        "789012"
      );

      // Should merge the two primary contacts
      expect(mockContactRepository.convertToSecondary).toHaveBeenCalledWith(
        5,
        1
      );
      expect(result.primaryContact.id).toBe(1); // Oldest primary remains primary
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockContactSearchService.findExactContactMatch.mockRejectedValue(
        new Error("Database connection failed")
      );

      await expect(
        service.identifyContact("test@example.com", "123456")
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle validation errors from dependencies", async () => {
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockRejectedValue(
        new Error("Invalid input format")
      );

      await expect(
        service.identifyContact("test@example.com", "123456")
      ).rejects.toThrow("Invalid input format");
    });
  });

  describe("edge cases", () => {
    it("should handle email-only requests", async () => {
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockResolvedValue({
        emailMatches: [],
        phoneMatches: [],
        hasEmailMatch: false,
        hasPhoneMatch: false,
      });

      const newContact = { ...mockPrimaryContact, phoneNumber: null };
      mockContactRepository.create.mockResolvedValue(newContact);

      const result = await service.identifyContact("test@example.com");

      expect(result.allPhoneNumbers).toEqual([]);
      expect(result.allEmails).toEqual(["test@example.com"]);
    });

    it("should handle phone-only requests", async () => {
      mockContactSearchService.findExactContactMatch.mockResolvedValue(null);
      mockContactSearchService.findPartialMatches.mockResolvedValue({
        emailMatches: [],
        phoneMatches: [],
        hasEmailMatch: false,
        hasPhoneMatch: false,
      });

      const newContact = { ...mockPrimaryContact, email: null };
      mockContactRepository.create.mockResolvedValue(newContact);

      const result = await service.identifyContact(undefined, "123456");

      expect(result.allEmails).toEqual([]);
      expect(result.allPhoneNumbers).toEqual(["123456"]);
    });

    it("should handle contacts with null email/phone values", async () => {
      const contactWithNulls: Contact = {
        ...mockPrimaryContact,
        email: null,
        phoneNumber: null,
      };

      mockContactSearchService.findExactContactMatch.mockResolvedValue(
        contactWithNulls
      );
      mockContactRepository.findLinkedContacts.mockResolvedValue([
        contactWithNulls,
      ]);

      const result = await service.identifyContact(
        "test@example.com",
        "123456"
      );

      expect(result.allEmails).toEqual([]);
      expect(result.allPhoneNumbers).toEqual([]);
    });
  });
});
