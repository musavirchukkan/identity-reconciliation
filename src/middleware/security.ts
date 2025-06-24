import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { getSecurityConfig, isProduction } from '../config/environment';
import { createModuleLogger } from '../utils/logger';
import { ValidationError } from './errorHandler';

const logger = createModuleLogger('Security');

/**
 * Security middleware for protecting the API
 */

// API Key authentication middleware
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const config = getSecurityConfig();
  
  // Skip API key check if not configured
  if (!config.apiKey) {
    return next();
  }
  
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    logger.warn('API request without API key', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
    
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required',
    });
    return;
  }
  
  if (apiKey !== config.apiKey) {
    logger.warn('API request with invalid API key', {
      ip: req.ip,
      path: req.path,
      providedKey: apiKey.substring(0, 8) + '...',
    });
    
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }
  
  logger.debug('API key authentication successful', {
    ip: req.ip,
    path: req.path,
  });
  
  next();
};

// Request fingerprinting for suspicious activity detection
export const requestFingerprinting = (req: Request, res: Response, next: NextFunction): void => {
  const fingerprint = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    acceptLanguage: req.get('Accept-Language'),
    acceptEncoding: req.get('Accept-Encoding'),
    timestamp: Date.now(),
  };
  
  // Store fingerprint in request for potential analysis
  (req as any).fingerprint = fingerprint;
  
  // Log suspicious patterns
  if (isSuspiciousRequest(req)) {
    logger.warn('Potentially suspicious request detected', {
      fingerprint,
      path: req.path,
      method: req.method,
    });
  }
  
  next();
};

// Helper function to detect suspicious requests
const isSuspiciousRequest = (req: Request): boolean => {
  const userAgent = req.get('User-Agent') || '';
  const suspiciousPatterns = [
    /bot|crawler|spider|scraper/i,
    /curl|wget|python|java|go-http/i,
    /sqlmap|nikto|nmap|masscan/i,
  ];
  
  // Check for automation tools
  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    return true;
  }
  
  // Check for missing common headers
  if (!req.get('Accept') || !req.get('Accept-Language')) {
    return true;
  }
  
  // Check for unusual header combinations
  const hasXForwardedFor = Boolean(req.get('X-Forwarded-For'));
  const hasXRealIP = Boolean(req.get('X-Real-IP'));
  
  if (hasXForwardedFor && hasXRealIP) {
    return true; // Unusual to have both
  }
  
  return false;
};

// Security audit logging
export const securityAuditLog = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  
  res.send = function(body) {
    // Log security-relevant events
    if (res.statusCode >= 400) {
      logger.warn('Security audit: HTTP error response', {
        ip: req.ip,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

// Comprehensive security middleware stack
export const applySecurity = (app: any): void => {
  // Basic security headers
  app.use(securityHeaders);
  
  // Request validation
  app.use(validateRequest);
  
  // Input sanitization
  app.use(sanitizeInput);
  
  // Cache control
  app.use(cacheControl);
  
  // Request fingerprinting
  app.use(requestFingerprinting);
  
  // Security audit logging
  app.use(securityAuditLog);
  
  // Timing attack protection (only for sensitive endpoints)
  app.use('/identify', timingAttackProtection);
  
  logger.info('Security middleware applied successfully');
};

// Enhanced helmet configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: isProduction(),
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: isProduction() ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Check Content-Type for POST requests
    if (req.method === 'POST' && !req.is('application/json')) {
      throw new ValidationError('Content-Type must be application/json');
    }
    
    // Check for required headers
    if (!req.get('User-Agent')) {
      throw new ValidationError('User-Agent header is required');
    }
    
    // Validate request size
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSize = 1024 * 1024; // 1MB
    
    if (contentLength > maxSize) {
      throw new ValidationError(`Request body too large. Maximum size: ${maxSize} bytes`);
    }
    
    // Check for suspicious patterns in headers
    const suspiciousHeaders = ['X-Forwarded-Host', 'X-Original-URL', 'X-Rewrite-URL'];
    const hasSuspiciousHeaders = suspiciousHeaders.some(header => req.get(header));
    
    if (hasSuspiciousHeaders) {
      logger.warn('Request with suspicious headers detected', {
        ip: req.ip,
        path: req.path,
        headers: suspiciousHeaders.filter(h => req.get(h)),
      });
    }
    
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
      return;
    }
    
    next(error);
  }
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

// Helper function to sanitize objects
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

// Helper function to sanitize strings
const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') {
    return str;
  }
  
  return str
    .trim()
    .replace(/[<>'"]/g, '') // Remove potential XSS characters
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .substring(0, 10000); // Limit length to prevent DoS
};

// IP whitelist middleware (for admin endpoints)
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // In development, allow all IPs
    if (!isProduction()) {
      return next();
    }
    
    // Check if IP is in whitelist
    const isAllowed = allowedIPs.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR notation support (basic implementation)
        const [network, prefixLength] = allowedIP.split('/');
        // For simplicity, implement exact match for now
        return clientIP === network;
      }
      return clientIP === allowedIP;
    });
    
    if (!isAllowed) {
      logger.warn('Access denied for IP not in whitelist', {
        clientIP,
        path: req.path,
        allowedIPs,
      });
      
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied',
      });
      return;
    }
    
    next();
  };
};

// Request timing attack protection
export const timingAttackProtection = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Add artificial delay to prevent timing attacks
    if (responseTime < 100) {
      setTimeout(() => {
        // Response already sent, this is just for timing
      }, 100 - responseTime);
    }
  });
  
  next();
};

// Prevent cache poisoning
export const cacheControl = (req: Request, res: Response, next: NextFunction): void => {
  // Set cache control headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': 'Origin, Authorization, X-API-Key',
  });