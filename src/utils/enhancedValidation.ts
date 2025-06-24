import { z } from "zod";
import { ValidationError } from "../middleware/errorHandler";
import { EdgeCaseHandler } from "./edgeCaseHandler";

/**
 * Enhanced validation with comprehensive email and phone number validation
 */

// Enhanced email validation schema
const enhancedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email cannot be empty")
  .max(254, "Email too long (max 254 characters)")
  .email("Invalid email format")
  .refine(
    (email) => {
      // Additional RFC 5322 compliant checks
      const localPart = email.split("@")[0];
      const domain = email.split("@")[1];

      // Local part validation
      if (localPart.length > 64) return false;
      if (localPart.startsWith(".") || localPart.endsWith(".")) return false;
      if (localPart.includes("..")) return false;

      // Domain validation
      if (domain.length > 253) return false;
      if (domain.startsWith("-") || domain.endsWith("-")) return false;
      if (domain.includes("..")) return false;

      // Check for valid TLD (at least 2 characters)
      const tld = domain.split(".").pop();
      if (!tld || tld.length < 2) return false;

      return true;
    },
    { message: "Email format violates RFC standards" }
  )
  .refine(
    (email) => {
      // Security: Block potentially dangerous email patterns
      const dangerousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /<script/i,
        /[<>'"]/,
      ];

      return !dangerousPatterns.some((pattern) => pattern.test(email));
    },
    { message: "Email contains invalid characters" }
  );

// Enhanced phone number validation schema
const enhancedPhoneSchema = z
  .union([z.string(), z.number()])
  .transform((val) => val.toString().trim())
  .refine(
    (phone) => {
      // Remove formatting characters
      const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");

      // Must contain only digits and optional leading +
      if (!/^[\+]?[\d]{1,15}$/.test(cleaned)) return false;

      // Minimum reasonable length (e.g., 7 digits for local numbers)
      if (cleaned.replace(/^\+/, "").length < 7) return false;

      // Maximum length as per E.164 standard
      if (cleaned.replace(/^\+/, "").length > 15) return false;

      return true;
    },
    { message: "Invalid phone number format" }
  )
  .transform((phone) => {
    // Clean and normalize phone number
    return phone.replace(/[\s\-\(\)\.]/g, "");
  });

// Enhanced identify request schema
export const enhancedIdentifyRequestSchema = z
  .object({
    email: enhancedEmailSchema.optional().or(z.literal("")),
    phoneNumber: enhancedPhoneSchema.optional(),
  })
  .transform((data) => {
    // Apply input sanitization
    const sanitized = EdgeCaseHandler.sanitizeContactInput(
      data.email || undefined,
      data.phoneNumber
    );

    return {
      email: sanitized.email || undefined,
      phoneNumber: sanitized.phoneNumber || undefined,
    };
  })
  .refine((data) => data.email || data.phoneNumber, {
    message: "Either email or phoneNumber must be provided",
    path: ["email", "phoneNumber"],
  });

/**
 * Comprehensive email validation with detailed error messages
 */
export const validateEmailEnhanced = (email?: string): string | null => {
  if (!email || email.trim() === "") return null;

  try {
    return enhancedEmailSchema.parse(email);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map((e) => e.message).join(", ");
      throw new ValidationError(
        `Email validation failed: ${errorMessage}`,
        "email"
      );
    }
    throw new ValidationError("Email validation failed", "email");
  }
};

/**
 * Comprehensive phone number validation with detailed error messages
 */
export const validatePhoneNumberEnhanced = (
  phoneNumber?: string | number
): string | null => {
  if (phoneNumber === undefined || phoneNumber === null || phoneNumber === "") {
    return null;
  }

  try {
    return enhancedPhoneSchema.parse(phoneNumber);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map((e) => e.message).join(", ");
      throw new ValidationError(
        `Phone validation failed: ${errorMessage}`,
        "phoneNumber"
      );
    }
    throw new ValidationError("Phone validation failed", "phoneNumber");
  }
};

/**
 * Enhanced identify request validation
 */
export const validateIdentifyRequestEnhanced = (
  data: any
): {
  email?: string;
  phoneNumber?: string;
} => {
  try {
    return enhancedIdentifyRequestSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`
      );
      throw new ValidationError(
        `Request validation failed: ${errorMessages.join(", ")}`
      );
    }
    throw new ValidationError("Request validation failed");
  }
};

/**
 * Validate request rate and size limits
 */
export const validateRequestLimits = (req: any): void => {
  // Check request body size
  const bodySize = JSON.stringify(req.body || {}).length;
  const maxBodySize = 1024; // 1KB limit for identify requests

  if (bodySize > maxBodySize) {
    throw new ValidationError(
      `Request body too large: ${bodySize} bytes (max: ${maxBodySize})`
    );
  }

  // Check for suspicious request patterns
  const userAgent = req.get("User-Agent") || "";
  const suspiciousPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i];

  if (suspiciousPatterns.some((pattern) => pattern.test(userAgent))) {
    throw new ValidationError("Automated requests not allowed");
  }

  // Check for required headers
  const contentType = req.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw new ValidationError("Content-Type must be application/json");
  }
};

/**
 * Business rule validation
 */
export const validateBusinessRules = (data: {
  email?: string;
  phoneNumber?: string;
}): void => {
  // Check for obviously fake emails
  if (data.email) {
    const fakeEmailPatterns = [
      /test@test\.com/i,
      /example@example\.com/i,
      /fake@fake\.com/i,
      /noreply@/i,
      /donotreply@/i,
    ];

    if (fakeEmailPatterns.some((pattern) => pattern.test(data.email!))) {
      throw new ValidationError(
        "Invalid email: appears to be a test or fake address"
      );
    }
  }

  // Check for obviously fake phone numbers
  if (data.phoneNumber) {
    const fakePhonePatterns = [
      /^1{7,}$/, // All 1s
      /^0{7,}$/, // All 0s
      /^123456789/,
      /^1234567890/,
    ];

    if (fakePhonePatterns.some((pattern) => pattern.test(data.phoneNumber!))) {
      throw new ValidationError(
        "Invalid phone number: appears to be a test number"
      );
    }
  }
};

/**
 * International phone number validation
 */
export const validateInternationalPhone = (
  phoneNumber: string
): {
  isValid: boolean;
  country?: string;
  format: "international" | "national" | "unknown";
} => {
  const cleaned = phoneNumber.replace(/[\s\-\(\)\.]/g, "");

  // International format (starts with +)
  if (cleaned.startsWith("+")) {
    const digits = cleaned.substring(1);

    // Basic country code validation (1-3 digits)
    const countryCodeMatch = digits.match(/^(\d{1,3})/);
    if (!countryCodeMatch) {
      return { isValid: false, format: "unknown" };
    }

    const countryCode = countryCodeMatch[1];
    const remainingDigits = digits.substring(countryCode.length);

    // Validate remaining digits length
    if (remainingDigits.length < 4 || remainingDigits.length > 12) {
      return { isValid: false, format: "international" };
    }

    return {
      isValid: true,
      country: getCountryFromCode(countryCode),
      format: "international",
    };
  }

  // National format
  if (/^\d{7,15}$/.test(cleaned)) {
    return {
      isValid: true,
      format: "national",
    };
  }

  return { isValid: false, format: "unknown" };
};

/**
 * Helper function to get country from phone code
 */
const getCountryFromCode = (code: string): string | undefined => {
  const countryMappings: Record<string, string> = {
    "1": "US/CA",
    "44": "GB",
    "33": "FR",
    "49": "DE",
    "39": "IT",
    "34": "ES",
    "91": "IN",
    "86": "CN",
    "81": "JP",
    // Add more as needed
  };

  return countryMappings[code];
};
