import { Request, Response } from "express";
import { IdentityLinkingService } from "../services/identityLinkingService";
import { validateIdentifyRequest } from "../utils/validation";
import {
  formatIdentifySuccess,
  addApiHeaders,
  ResponseTimer,
} from "../utils/responseFormatter";
import {
  ValidationError,
  DatabaseError,
  BusinessLogicError,
} from "../middleware/errorHandler";
import { ContactResponse } from "../types/contact";

export class IdentifyController {
  private identityLinkingService: IdentityLinkingService;

  constructor() {
    this.identityLinkingService = new IdentityLinkingService();
  }

  /**
   * Handle POST /identify requests
   */
  async identify(req: Request, res: Response): Promise<void> {
    const timer = new ResponseTimer();

    try {
      // Add API headers
      addApiHeaders(res);

      // Validate request body
      let validatedRequest;
      try {
        validatedRequest = validateIdentifyRequest(req.body);
      } catch (error) {
        throw new ValidationError(
          error instanceof Error ? error.message : "Invalid request format"
        );
      }

      // Log incoming request (development only)
      if (process.env.NODE_ENV === "development") {
        console.log("Identify request:", {
          email: validatedRequest.email || null,
          phoneNumber: validatedRequest.phoneNumber || null,
          timestamp: new Date().toISOString(),
          ip: req.ip,
        });
      }

      // Process identity linking
      let consolidatedContact;
      try {
        consolidatedContact = await this.identityLinkingService.identifyContact(
          validatedRequest.email,
          validatedRequest.phoneNumber
        );
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.message.includes("Database") ||
            error.message.includes("connection")
          ) {
            throw new DatabaseError("Database operation failed", error);
          }
          throw new BusinessLogicError(error.message);
        }
        throw error;
      }

      // Format response according to specification
      const response: ContactResponse = formatIdentifySuccess(
        consolidatedContact,
        timer.getElapsedTime()
      );

      // Add timing header
      timer.addTimingHeader(res);

      // Log successful response (development only)
      if (process.env.NODE_ENV === "development") {
        console.log("Identify success:", {
          primaryContactId: response.contact.primaryContactId,
          emailCount: response.contact.emails.length,
          phoneCount: response.contact.phoneNumbers.length,
          secondaryCount: response.contact.secondaryContactIds.length,
          processingTime: timer.getElapsedTime(),
        });
      }

      // Send response
      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, timer);
    }
  }

  /**
   * Handle errors with proper error types and responses
   */
  private handleError(
    error: unknown,
    req: Request,
    res: Response,
    timer: ResponseTimer
  ): void {
    // Add timing header even for errors
    timer.addTimingHeader(res);

    // Log error with context
    console.error("Identify endpoint error:", {
      error: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      stack:
        error instanceof Error && process.env.NODE_ENV === "development"
          ? error.stack
          : undefined,
      requestBody: req.body,
      processingTime: timer.getElapsedTime(),
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    // Handle specific error types
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: "Bad Request",
        message: error.message,
        field: error.field,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error instanceof DatabaseError) {
      res.status(500).json({
        error: "Internal Server Error",
        message: "Database operation failed",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error instanceof BusinessLogicError) {
      res.status(422).json({
        error: "Unprocessable Entity",
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle unknown errors
    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      details:
        process.env.NODE_ENV === "development" && error instanceof Error
          ? error.message
          : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Enhanced health check for the identify service
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    const timer = new ResponseTimer();

    try {
      addApiHeaders(res);

      // Basic health status
      const healthStatus = {
        status: "healthy",
        service: "identity-reconciliation",
        version: process.env.npm_package_version || "1.0.0",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
      };

      timer.addTimingHeader(res);
      res.status(200).json(healthStatus);
    } catch (error) {
      timer.addTimingHeader(res);

      res.status(503).json({
        status: "unhealthy",
        service: "identity-reconciliation",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
