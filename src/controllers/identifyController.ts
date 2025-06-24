import { Request, Response } from "express";
import { IdentityLinkingService } from "../services/identityLinkingService";
import { validateIdentifyRequest } from "../utils/validation";
import {
  formatContactResponse,
  createContactDebugInfo,
} from "../utils/contactUtils";
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
    const startTime = Date.now();

    try {
      // Validate request body
      const validatedRequest = validateIdentifyRequest(req.body);

      // Log incoming request (development only)
      if (process.env.NODE_ENV === "development") {
        console.log("Identify request:", {
          email: validatedRequest.email,
          phoneNumber: validatedRequest.phoneNumber,
          timestamp: new Date().toISOString(),
        });
      }

      // Process identity linking
      const consolidatedContact =
        await this.identityLinkingService.identifyContact(
          validatedRequest.email,
          validatedRequest.phoneNumber
        );

      // Format response
      const response: ContactResponse =
        formatContactResponse(consolidatedContact);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Log debug information (development only)
      if (process.env.NODE_ENV === "development") {
        const debugInfo = createContactDebugInfo(
          "identify",
          validatedRequest,
          consolidatedContact,
          processingTime
        );
        console.log("Identify response:", debugInfo);
      }

      // Send response
      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, Date.now() - startTime);
    }
  }

  /**
   * Handle errors and send appropriate responses
   */
  private handleError(
    error: unknown,
    req: Request,
    res: Response,
    processingTime: number
  ): void {
    console.error("Identify endpoint error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: req.body,
      processingTime,
      timestamp: new Date().toISOString(),
    });

    if (error instanceof Error) {
      // Validation errors
      if (
        error.message.includes("Invalid") ||
        error.message.includes("must be provided")
      ) {
        res.status(400).json({
          error: "Bad Request",
          message: error.message,
          details: "Please check your email and phoneNumber format",
        });
        return;
      }

      // Database or service errors
      if (
        error.message.includes("Database") ||
        error.message.includes("not found")
      ) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Database operation failed",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
        return;
      }
    }

    // Generic error response
    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      details:
        process.env.NODE_ENV === "development" && error instanceof Error
          ? error.message
          : undefined,
    });
  }

  /**
   * Health check for the identify service
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      // You could add database connectivity check here
      res.status(200).json({
        status: "healthy",
        service: "identity-reconciliation",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        service: "identity-reconciliation",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
