import { Request, Response, NextFunction } from "express";

// Simple in-memory rate limiter for demonstration
// In production, use Redis or a proper rate limiting service
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per IP

/**
 * Simple rate limiting middleware
 */
export const rateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === "test") {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  // Clean up expired entries
  cleanupExpiredEntries(now);

  // Get or create rate limit entry for this IP
  let rateLimitEntry = requestCounts.get(clientIp);

  if (!rateLimitEntry || now > rateLimitEntry.resetTime) {
    // Create new rate limit window
    rateLimitEntry = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    requestCounts.set(clientIp, rateLimitEntry);
  } else {
    // Increment count in existing window
    rateLimitEntry.count++;
  }

  // Check if rate limit exceeded
  if (rateLimitEntry.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((rateLimitEntry.resetTime - now) / 1000);

    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter,
      limit: MAX_REQUESTS_PER_WINDOW,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  // Add rate limit headers
  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - rateLimitEntry.count);
  const resetTime = Math.ceil(rateLimitEntry.resetTime / 1000);

  res.set({
    "X-RateLimit-Limit": MAX_REQUESTS_PER_WINDOW.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": resetTime.toString(),
  });

  next();
};

/**
 * Clean up expired rate limit entries to prevent memory leaks
 */
function cleanupExpiredEntries(now: number): void {
  const expiredKeys: string[] = [];

  for (const [key, entry] of requestCounts.entries()) {
    if (now > entry.resetTime) {
      expiredKeys.push(key);
    }
  }

  for (const key of expiredKeys) {
    requestCounts.delete(key);
  }
}

/**
 * Get current rate limit stats (for monitoring)
 */
export const getRateLimitStats = (): {
  activeIPs: number;
  totalRequests: number;
  memoryUsage: string;
} => {
  let totalRequests = 0;

  for (const entry of requestCounts.values()) {
    totalRequests += entry.count;
  }

  return {
    activeIPs: requestCounts.size,
    totalRequests,
    memoryUsage: `${process.memoryUsage().heapUsed / 1024 / 1024} MB`,
  };
};
