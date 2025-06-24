import { Request, Response, NextFunction } from "express";

/**
 * Request logging middleware for API endpoints
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Log request start (development only)
  if (process.env.NODE_ENV === "development") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
      contentType: req.get("Content-Type"),
      bodySize: req.get("Content-Length") || "unknown",
    });
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (body: any) {
    const responseTime = Date.now() - startTime;

    // Log response (development only)
    if (process.env.NODE_ENV === "development") {
      console.log(`[${new Date().toISOString()}] Response ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
      });
    }

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
};
