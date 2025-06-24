import { z } from "zod";

// Email validation regex (RFC 5322 compliant)
const emailRegex =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Phone number validation (flexible international format)
const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;

// Zod schema for identify request validation
export const identifyRequestSchema = z
  .object({
    email: z
      .string()
      .email("Invalid email format")
      .optional()
      .or(z.literal("")),
    phoneNumber: z
      .union([
        z.string().regex(phoneRegex, "Invalid phone number format"),
        z.number().int().positive("Phone number must be positive"),
      ])
      .optional(),
  })
  .refine((data) => data.email || data.phoneNumber, {
    message: "Either email or phoneNumber must be provided",
    path: ["email", "phoneNumber"],
  });

// Type for validated request
export type ValidatedIdentifyRequest = z.infer<typeof identifyRequestSchema>;

/**
 * Validate and normalize email
 */
export const validateEmail = (email?: string): string | null => {
  if (!email || email.trim() === "") return null;

  const trimmedEmail = email.trim().toLowerCase();

  if (!emailRegex.test(trimmedEmail)) {
    throw new Error("Invalid email format");
  }

  return trimmedEmail;
};

/**
 * Validate and normalize phone number
 */
export const validatePhoneNumber = (
  phoneNumber?: string | number
): string | null => {
  if (phoneNumber === undefined || phoneNumber === null || phoneNumber === "") {
    return null;
  }

  const phoneStr = phoneNumber.toString().trim();

  if (phoneStr === "") return null;

  // Remove common phone number formatting
  const cleanPhone = phoneStr.replace(/[\s\-\(\)\.]/g, "");

  if (!phoneRegex.test(cleanPhone)) {
    throw new Error("Invalid phone number format");
  }

  return cleanPhone;
};

/**
 * Validate identify request and return normalized data
 */
export const validateIdentifyRequest = (
  data: any
): ValidatedIdentifyRequest => {
  // Parse with Zod schema
  const parsed = identifyRequestSchema.parse(data);

  return {
    email: validateEmail(parsed.email) || undefined,
    phoneNumber: validatePhoneNumber(parsed.phoneNumber) || undefined,
  };
};

/**
 * Check if two contacts have matching identifiers
 */
export const contactsMatch = (
  contact1: { email?: string | null; phoneNumber?: string | null },
  contact2: { email?: string | null; phoneNumber?: string | null }
): boolean => {
  // Email match
  if (contact1.email && contact2.email && contact1.email === contact2.email) {
    return true;
  }

  // Phone number match
  if (
    contact1.phoneNumber &&
    contact2.phoneNumber &&
    contact1.phoneNumber === contact2.phoneNumber
  ) {
    return true;
  }

  return false;
};

/**
 * Extract unique values from an array, filtering out null/undefined
 */
export const getUniqueValues = <T>(arr: (T | null | undefined)[]): T[] => {
  return Array.from(
    new Set(
      arr.filter((item): item is T => item !== null && item !== undefined)
    )
  );
};
