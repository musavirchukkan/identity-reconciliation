import {
  validateEmail,
  validatePhoneNumber,
  validateIdentifyRequest,
  contactsMatch,
  getUniqueValues,
} from "../../src/utils/validation";

describe("Validation Utils", () => {
  describe("validateEmail", () => {
    it("should validate correct email formats", () => {
      expect(validateEmail("test@example.com")).toBe("test@example.com");
      expect(validateEmail("user.name+tag@domain.co.uk")).toBe(
        "user.name+tag@domain.co.uk"
      );
      expect(validateEmail("  test@EXAMPLE.COM  ")).toBe("test@example.com");
    });

    it("should return null for empty or invalid emails", () => {
      expect(validateEmail("")).toBeNull();
      expect(validateEmail("   ")).toBeNull();
      expect(validateEmail(undefined)).toBeNull();
    });

    it("should throw error for invalid email formats", () => {
      expect(() => validateEmail("invalid-email")).toThrow(
        "Invalid email format"
      );
      expect(() => validateEmail("test@")).toThrow("Invalid email format");
      expect(() => validateEmail("@domain.com")).toThrow(
        "Invalid email format"
      );
    });
  });

  describe("validatePhoneNumber", () => {
    it("should validate correct phone number formats", () => {
      expect(validatePhoneNumber("1234567890")).toBe("1234567890");
      expect(validatePhoneNumber("+1234567890")).toBe("+1234567890");
      expect(validatePhoneNumber(91234567890)).toBe("91234567890");
    });

    it("should clean phone number formatting", () => {
      expect(validatePhoneNumber("123-456-7890")).toBe("1234567890");
      expect(validatePhoneNumber("(123) 456-7890")).toBe("1234567890");
      expect(validatePhoneNumber("123.456.7890")).toBe("1234567890");
      expect(validatePhoneNumber("123 456 7890")).toBe("1234567890");
    });

    it("should return null for empty phone numbers", () => {
      expect(validatePhoneNumber("")).toBeNull();
      expect(validatePhoneNumber("   ")).toBeNull();
      expect(validatePhoneNumber(undefined)).toBeNull();
      expect(validatePhoneNumber(null)).toBeNull();
    });

    it("should throw error for invalid phone formats", () => {
      expect(() => validatePhoneNumber("abc123")).toThrow(
        "Invalid phone number format"
      );
      expect(() => validatePhoneNumber("++123")).toThrow(
        "Invalid phone number format"
      );
      expect(() => validatePhoneNumber("0")).toThrow(
        "Invalid phone number format"
      );
    });
  });

  describe("validateIdentifyRequest", () => {
    it("should validate requests with both email and phone", () => {
      const result = validateIdentifyRequest({
        email: "test@example.com",
        phoneNumber: "1234567890",
      });

      expect(result).toEqual({
        email: "test@example.com",
        phoneNumber: "1234567890",
      });
    });

    it("should validate requests with only email", () => {
      const result = validateIdentifyRequest({
        email: "test@example.com",
      });

      expect(result).toEqual({
        email: "test@example.com",
        phoneNumber: undefined,
      });
    });

    it("should validate requests with only phone", () => {
      const result = validateIdentifyRequest({
        phoneNumber: 1234567890,
      });

      expect(result).toEqual({
        email: undefined,
        phoneNumber: "1234567890",
      });
    });

    it("should throw error when neither email nor phone provided", () => {
      expect(() => validateIdentifyRequest({})).toThrow();
      expect(() =>
        validateIdentifyRequest({
          email: "",
          phoneNumber: "",
        })
      ).toThrow();
    });

    it("should handle invalid email/phone formats", () => {
      expect(() =>
        validateIdentifyRequest({
          email: "invalid-email",
        })
      ).toThrow();

      expect(() =>
        validateIdentifyRequest({
          phoneNumber: "invalid-phone",
        })
      ).toThrow();
    });
  });

  describe("contactsMatch", () => {
    it("should match contacts with same email", () => {
      const contact1 = { email: "test@example.com", phoneNumber: "123" };
      const contact2 = { email: "test@example.com", phoneNumber: "456" };

      expect(contactsMatch(contact1, contact2)).toBe(true);
    });

    it("should match contacts with same phone number", () => {
      const contact1 = { email: "test1@example.com", phoneNumber: "123456" };
      const contact2 = { email: "test2@example.com", phoneNumber: "123456" };

      expect(contactsMatch(contact1, contact2)).toBe(true);
    });

    it("should not match contacts with different email and phone", () => {
      const contact1 = { email: "test1@example.com", phoneNumber: "123" };
      const contact2 = { email: "test2@example.com", phoneNumber: "456" };

      expect(contactsMatch(contact1, contact2)).toBe(false);
    });

    it("should handle null/undefined values", () => {
      const contact1 = { email: null, phoneNumber: "123" };
      const contact2 = { email: "test@example.com", phoneNumber: null };

      expect(contactsMatch(contact1, contact2)).toBe(false);
    });
  });

  describe("getUniqueValues", () => {
    it("should return unique values filtering out null/undefined", () => {
      const input = ["a", "b", "a", null, "c", undefined, "b"];
      const result = getUniqueValues(input);

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle empty arrays", () => {
      expect(getUniqueValues([])).toEqual([]);
    });

    it("should handle arrays with only null/undefined", () => {
      expect(getUniqueValues([null, undefined, null])).toEqual([]);
    });
  });
});
