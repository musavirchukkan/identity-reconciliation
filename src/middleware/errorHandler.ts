import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

// Custom error types
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class BusinessLogicError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "BusinessLogicError";
  }
}

/**
 * Centralized error handling middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error details
  console.error("Error occurred:", {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    url: req.url,
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString(),
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
      code: err.code,
    }));

    res.status(400).json({
      error: "Validation Error",
      message: "Request validation failed",
      details: validationErrors,
    });
    return;
  }

  // Handle custom validation errors
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: "Validation Error",
      message: error.message,
      field: error.field,
    });
    return;
  }

  // Handle database errors
  if (error instanceof DatabaseError) {
    res.status(500).json({
      error: "Database Error",
      message: "Database operation failed",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
    return;
  }

  // Handle business logic errors
  if (error instanceof BusinessLogicError) {
    res.status(422).json({
      error: "Business Logic Error",
      message: error.message,
      code: error.code,
    });
    return;
  }

  // Handle known error patterns
  if (error.message.includes("ECONNREFUSED")) {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Database connection failed",
    });
    return;
  }

  if (error.message.includes("timeout")) {
    res.status(504).json({
      error: "Gateway Timeout",
      message: "Request timed out",
    });
    return;
  }

  // Generic internal server error
  res.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
    details: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      "POST /identify",
      "GET /identify/health",
      "GET /health",
    ],
  });
};
