import { Response } from "express";
import { ContactResponse, ConsolidatedContact } from "../types/contact";

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    processingTime?: number;
  };
}

/**
 * Format successful identify response
 */
export const formatIdentifySuccess = (
  consolidatedContact: ConsolidatedContact,
  processingTime?: number
): ContactResponse => {
  // Ensure emails array has primary contact's email first
  const emails = [...consolidatedContact.allEmails];
  if (consolidatedContact.primaryContact.email) {
    // Remove primary email if it exists elsewhere and add it to the beginning
    const primaryEmail = consolidatedContact.primaryContact.email;
    const emailIndex = emails.indexOf(primaryEmail);
    if (emailIndex > 0) {
      emails.splice(emailIndex, 1);
      emails.unshift(primaryEmail);
    }
  }

  // Ensure phone numbers array has primary contact's phone first
  const phoneNumbers = [...consolidatedContact.allPhoneNumbers];
  if (consolidatedContact.primaryContact.phoneNumber) {
    // Remove primary phone if it exists elsewhere and add it to the beginning
    const primaryPhone = consolidatedContact.primaryContact.phoneNumber;
    const phoneIndex = phoneNumbers.indexOf(primaryPhone);
    if (phoneIndex > 0) {
      phoneNumbers.splice(phoneIndex, 1);
      phoneNumbers.unshift(primaryPhone);
    }
  }

  return {
    contact: {
      primaryContactId: consolidatedContact.primaryContact.id,
      emails,
      phoneNumbers,
      secondaryContactIds: consolidatedContact.secondaryContacts.map(
        (contact) => contact.id
      ),
    },
  };
};

/**
 * Format error response
 */
export const formatError = (
  error: Error,
  code: string = "INTERNAL_ERROR",
  details?: any
): ApiResponse => {
  return {
    success: false,
    error: {
      code,
      message: error.message,
      details: process.env.NODE_ENV === "development" ? details : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
};

/**
 * Send success response with proper formatting
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: Partial<ApiResponse["meta"]>
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Send error response with proper formatting
 */
export const sendError = (
  res: Response,
  error: Error | string,
  statusCode: number = 500,
  code: string = "INTERNAL_ERROR",
  details?: any
): void => {
  const errorMessage = typeof error === "string" ? error : error.message;

  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message: errorMessage,
      details: process.env.NODE_ENV === "development" ? details : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Validate contact response format before sending
 */
export const validateContactResponseFormat = (
  response: ContactResponse
): boolean => {
  try {
    const { contact } = response;

    // Check required fields exist
    if (typeof contact.primaryContactId !== "number") return false;
    if (!Array.isArray(contact.emails)) return false;
    if (!Array.isArray(contact.phoneNumbers)) return false;
    if (!Array.isArray(contact.secondaryContactIds)) return false;

    // Check array content types
    if (!contact.emails.every((email) => typeof email === "string"))
      return false;
    if (!contact.phoneNumbers.every((phone) => typeof phone === "string"))
      return false;
    if (!contact.secondaryContactIds.every((id) => typeof id === "number"))
      return false;

    // Check that at least one identifier exists
    if (contact.emails.length === 0 && contact.phoneNumbers.length === 0)
      return false;

    return true;
  } catch {
    return false;
  }
};

/**
 * Add response headers for API best practices
 */
export const addApiHeaders = (res: Response): void => {
  res.set({
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
  });
};

/**
 * Response timing utility
 */
export class ResponseTimer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  addTimingHeader(res: Response): void {
    res.set("X-Response-Time", `${this.getElapsedTime()}ms`);
  }
}
