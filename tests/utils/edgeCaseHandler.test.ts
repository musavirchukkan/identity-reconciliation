import { EdgeCaseHandler } from "../../src/utils/edgeCaseHandler";
import { Contact, LinkPrecedence } from "@prisma/client";
import {
  BusinessLogicError,
  ValidationError,
} from "../../src/middleware/errorHandler";

describe("EdgeCaseHandler", () => {
  // Sample contact data
  const validPrimaryContact: Contact = {
    id: 1,
    email: "primary@example.com",
    phoneNumber: "123456789",
    linkedId: null,
    linkPrecedence: LinkPrecedence.primary,
    createdAt: new Date("2023-04-01T00:00:00.374Z"),
    updatedAt: new Date("2023-04-01T00:00:00.374Z"),
    deletedAt: null,
  };

  const validSecondaryContact: Contact = {
    id: 2,
    email: "secondary@example.com",
    phoneNumber: "987654321",
    linkedId: 1,
    linkPrecedence: LinkPrecedence.secondary,
    createdAt: new Date("2023-04-02T00:00:00.374Z"),
    updatedAt: new Date("2023-04-02T00:00:00.374Z"),
    deletedAt: null,
  };

  describe("validateContactIntegrity", () => {
    it("should pass validation for valid primary contact", () => {
      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(validPrimaryContact)
      ).not.toThrow();
    });

    it("should pass validation for valid secondary contact", () => {
      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(validSecondaryContact)
      ).not.toThrow();
    });

    it("should throw error for orphaned secondary contact", () => {
      const orphanedSecondary = { ...validSecondaryContact, linkedId: null };

      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(orphanedSecondary)
      ).toThrow(BusinessLogicError);
    });

    it("should throw error for primary contact with linkedId", () => {
      const invalidPrimary = { ...validPrimaryContact, linkedId: 2 };

      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(invalidPrimary)
      ).toThrow(BusinessLogicError);
    });

    it("should throw error for self-referencing contact", () => {
      const selfReferencing = { ...validSecondaryContact, linkedId: 2 }; // links to itself

      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(selfReferencing)
      ).toThrow(BusinessLogicError);
    });

    it("should throw error for deleted contact in active operation", () => {
      const deletedContact = { ...validPrimaryContact, deletedAt: new Date() };

      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(deletedContact)
      ).toThrow(BusinessLogicError);
    });

    it("should throw error for contact without identifiers", () => {
      const noIdentifiers = {
        ...validPrimaryContact,
        email: null,
        phoneNumber: null,
      };

      expect(() =>
        EdgeCaseHandler.validateContactIntegrity(noIdentifiers)
      ).toThrow(BusinessLogicError);
    });
  });

  describe("detectCircularReferences", () => {
    it("should pass for valid contact hierarchy", () => {
      const contacts = [validPrimaryContact, validSecondaryContact];

      expect(() =>
        EdgeCaseHandler.detectCircularReferences(contacts)
      ).not.toThrow();
    });

    it("should detect circular references", () => {
      const contact1 = { ...validPrimaryContact, id: 1 };
      const contact2 = { ...validSecondaryContact, id: 2, linkedId: 1 };
      const contact3 = { ...validSecondaryContact, id: 3, linkedId: 2 };
      const circularContact = { ...validSecondaryContact, id: 1, linkedId: 3 }; // Creates circle

      const contacts = [contact1, contact2, contact3, circularContact];

      expect(() => EdgeCaseHandler.detectCircularReferences(contacts)).toThrow(
        BusinessLogicError
      );
    });
  });

  describe("validateContactChainDepth", () => {
    it("should pass for normal depth chains", () => {
      const contacts = [validPrimaryContact, validSecondaryContact];

      expect(() =>
        EdgeCaseHandler.validateContactChainDepth(contacts, 10)
      ).not.toThrow();
    });

    it("should throw error for chains exceeding max depth", () => {
      const primary = { ...validPrimaryContact, id: 1 };
      const secondary1 = { ...validSecondaryContact, id: 2, linkedId: 1 };
      const secondary2 = { ...validSecondaryContact, id: 3, linkedId: 2 };

      const contacts = [primary, secondary1, secondary2];

      expect(() =>
        EdgeCaseHandler.validateContactChainDepth(contacts, 1)
      ).toThrow(BusinessLogicError);
    });
  });

  describe("validateNoDuplicateIdentifiers", () => {
    it("should pass for unique identifiers within linked groups", () => {
      const contacts = [validPrimaryContact, validSecondaryContact];

      expect(() =>
        EdgeCaseHandler.validateNoDuplicateIdentifiers(contacts)
      ).not.toThrow();
    });

    it("should throw error for duplicate emails in unlinked groups", () => {
      const primary1 = {
        ...validPrimaryContact,
        id: 1,
        email: "same@example.com",
      };
      const primary2 = {
        ...validPrimaryContact,
        id: 2,
        email: "same@example.com",
        phoneNumber: "999",
      };

      const contacts = [primary1, primary2];

      expect(() =>
        EdgeCaseHandler.validateNoDuplicateIdentifiers(contacts)
      ).toThrow(BusinessLogicError);
    });

    it("should throw error for duplicate phones in unlinked groups", () => {
      const primary1 = { ...validPrimaryContact, id: 1, phoneNumber: "123456" };
      const primary2 = {
        ...validPrimaryContact,
        id: 2,
        email: "different@test.com",
        phoneNumber: "123456",
      };

      const contacts = [primary1, primary2];

      expect(() =>
        EdgeCaseHandler.validateNoDuplicateIdentifiers(contacts)
      ).toThrow(BusinessLogicError);
    });
  });

  describe("validateContactTimestamps", () => {
    it("should pass for valid timestamps", () => {
      expect(() =>
        EdgeCaseHandler.validateContactTimestamps(validPrimaryContact)
      ).not.toThrow();
    });

    it("should throw error for future creation date", () => {
      const futureContact = {
        ...validPrimaryContact,
        createdAt: new Date(Date.now() + 86400000), // Tomorrow
      };

      expect(() =>
        EdgeCaseHandler.validateContactTimestamps(futureContact)
      ).toThrow(ValidationError);
    });

    it("should throw error for invalid timestamp order", () => {
      const invalidOrder = {
        ...validPrimaryContact,
        createdAt: new Date("2023-04-02T00:00:00.374Z"),
        updatedAt: new Date("2023-04-01T00:00:00.374Z"), // Before creation
      };

      expect(() =>
        EdgeCaseHandler.validateContactTimestamps(invalidOrder)
      ).toThrow(ValidationError);
    });

    it("should throw error for invalid deletion timestamp", () => {
      const invalidDeletion = {
        ...validPrimaryContact,
        deletedAt: new Date("2023-03-01T00:00:00.374Z"), // Before creation
      };

      expect(() =>
        EdgeCaseHandler.validateContactTimestamps(invalidDeletion)
      ).toThrow(ValidationError);
    });
  });

  describe("validatePerformanceConstraints", () => {
    it("should pass for reasonable number of contacts", () => {
      const contacts = Array(10).fill(validPrimaryContact);

      expect(() =>
        EdgeCaseHandler.validatePerformanceConstraints(contacts)
      ).not.toThrow();
    });

    it("should throw error for too many contacts", () => {
      const contacts = Array(1001).fill(validPrimaryContact);

      expect(() =>
        EdgeCaseHandler.validatePerformanceConstraints(contacts)
      ).toThrow(BusinessLogicError);
    });
  });

  describe("sanitizeContactInput", () => {
    it("should sanitize email correctly", () => {
      const result = EdgeCaseHandler.sanitizeContactInput(
        "  TEST@EXAMPLE.COM  ",
        null
      );

      expect(result.email).toBe("test@example.com");
      expect(result.phoneNumber).toBeNull();
    });

    it("should sanitize phone number correctly", () => {
      const result = EdgeCaseHandler.sanitizeContactInput(
        null,
        "(123) 456-7890"
      );

      expect(result.email).toBeNull();
      expect(result.phoneNumber).toBe("(123) 456-7890");
    });

    it("should remove dangerous characters from email", () => {
      const result = EdgeCaseHandler.sanitizeContactInput(
        "test<script>@example.com",
        null
      );

      expect(result.email).toBe("testscript@example.com");
    });

    it("should handle null/undefined inputs", () => {
      const result = EdgeCaseHandler.sanitizeContactInput(null, undefined);

      expect(result.email).toBeNull();
      expect(result.phoneNumber).toBeNull();
    });

    it("should truncate overly long inputs", () => {
      const longEmail = "a".repeat(300) + "@example.com";
      const result = EdgeCaseHandler.sanitizeContactInput(longEmail, null);

      expect(result.email!.length).toBeLessThanOrEqual(254);
    });
  });

  describe("validateConcurrentModification", () => {
    it("should pass for unchanged contact", () => {
      expect(() =>
        EdgeCaseHandler.validateConcurrentModification(
          validPrimaryContact,
          validPrimaryContact
        )
      ).not.toThrow();
    });

    it("should throw error for modified contact", () => {
      const modifiedContact = {
        ...validPrimaryContact,
        updatedAt: new Date("2023-04-03T00:00:00.374Z"),
      };

      expect(() =>
        EdgeCaseHandler.validateConcurrentModification(
          validPrimaryContact,
          modifiedContact
        )
      ).toThrow(BusinessLogicError);
    });
  });

  describe("handleDatabaseConstraintError", () => {
    it("should handle unique constraint violation", () => {
      const error = new Error("UNIQUE constraint violation");

      expect(() =>
        EdgeCaseHandler.handleDatabaseConstraintError(error)
      ).toThrow(BusinessLogicError);
    });

    it("should handle foreign key constraint violation", () => {
      const error = new Error("FOREIGN KEY constraint failed");

      expect(() =>
        EdgeCaseHandler.handleDatabaseConstraintError(error)
      ).toThrow(BusinessLogicError);
    });

    it("should handle not null constraint violation", () => {
      const error = new Error("NOT NULL constraint failed");

      expect(() =>
        EdgeCaseHandler.handleDatabaseConstraintError(error)
      ).toThrow(ValidationError);
    });

    it("should handle check constraint violation", () => {
      const error = new Error("CHECK constraint failed");

      expect(() =>
        EdgeCaseHandler.handleDatabaseConstraintError(error)
      ).toThrow(ValidationError);
    });

    it("should handle generic database errors", () => {
      const error = new Error("Some other database error");

      expect(() =>
        EdgeCaseHandler.handleDatabaseConstraintError(error)
      ).toThrow(BusinessLogicError);
    });
  });
});
