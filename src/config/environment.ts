import { z } from "zod";
import { createModuleLogger } from "../utils/logger";

const logger = createModuleLogger("Environment");

/**
 * Environment configuration with validation
 */

// Environment validation schema
const environmentSchema = z.object({
  // Application settings
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database configuration
  DATABASE_URL: z.string().url().min(1),

  // Redis configuration (optional)
  REDIS_URL: z.string().url().optional(),

  // Logging configuration
  LOG_LEVEL: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]).default("INFO"),

  // Security settings
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),
  API_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_IDENTIFY_MAX: z.coerce.number().int().positive().default(10),

  // Performance settings
  MAX_CONTACTS_PER_OPERATION: z.coerce.number().int().positive().default(1000),
  MAX_CONTACT_CHAIN_DEPTH: z.coerce.number().int().positive().default(10),

  // Request limits
  MAX_REQUEST_BODY_SIZE: z.string().default("1mb"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Database connection settings
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),

  // Monitoring and metrics
  ENABLE_METRICS: z.coerce.boolean().default(false),
  METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9090),

  // External service URLs (if needed)
  WEBHOOK_URL: z.string().url().optional(),
  NOTIFICATION_SERVICE_URL: z.string().url().optional(),

  // Feature flags
  ENABLE_ENHANCED_VALIDATION: z.coerce.boolean().default(true),
  ENABLE_BUSINESS_RULES: z.coerce.boolean().default(true),
  ENABLE_CONTACT_VERIFICATION: z.coerce.boolean().default(false),

  // Development settings
  ENABLE_DEBUG_ENDPOINTS: z.coerce.boolean().default(false),
  ENABLE_SWAGGER_DOCS: z.coerce.boolean().default(false),
});

// Parse and validate environment variables
function parseEnvironment(): z.infer<typeof environmentSchema> {
  try {
    const parsed = environmentSchema.parse(process.env);

    logger.info("Environment configuration loaded successfully", {
      nodeEnv: parsed.NODE_ENV,
      port: parsed.PORT,
      logLevel: parsed.LOG_LEVEL,
      hasDatabaseUrl: Boolean(parsed.DATABASE_URL),
      hasRedisUrl: Boolean(parsed.REDIS_URL),
    });

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );

      logger.error("Environment validation failed", {
        errors: errorMessages,
      });

      throw new Error(
        `Environment validation failed:\n${errorMessages.join("\n")}`
      );
    }

    throw error;
  }
}

// Export validated environment configuration
export const env = parseEnvironment();

// Helper functions for environment-specific logic
export const isDevelopment = () => env.NODE_ENV === "development";
export const isProduction = () => env.NODE_ENV === "production";
export const isTest = () => env.NODE_ENV === "test";

// Database configuration
export const getDatabaseConfig = () => ({
  url: env.DATABASE_URL,
  connectionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
  maxConnections: env.DB_MAX_CONNECTIONS,
});

// Redis configuration
export const getRedisConfig = () => ({
  url: env.REDIS_URL,
  enabled: Boolean(env.REDIS_URL),
});

// CORS configuration
export const getCorsConfig = () => ({
  origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  credentials: true,
});

// Rate limiting configuration
export const getRateLimitConfig = () => ({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  identifyMaxRequests: env.RATE_LIMIT_IDENTIFY_MAX,
});

// Performance configuration
export const getPerformanceConfig = () => ({
  maxContactsPerOperation: env.MAX_CONTACTS_PER_OPERATION,
  maxContactChainDepth: env.MAX_CONTACT_CHAIN_DEPTH,
  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
  maxRequestBodySize: env.MAX_REQUEST_BODY_SIZE,
});

// Security configuration
export const getSecurityConfig = () => ({
  apiKey: env.API_KEY,
  jwtSecret: env.JWT_SECRET,
  enableEnhancedValidation: env.ENABLE_ENHANCED_VALIDATION,
  enableBusinessRules: env.ENABLE_BUSINESS_RULES,
});

// Feature flags
export const getFeatureFlags = () => ({
  enhancedValidation: env.ENABLE_ENHANCED_VALIDATION,
  businessRules: env.ENABLE_BUSINESS_RULES,
  contactVerification: env.ENABLE_CONTACT_VERIFICATION,
  debugEndpoints: env.ENABLE_DEBUG_ENDPOINTS && isDevelopment(),
  swaggerDocs: env.ENABLE_SWAGGER_DOCS && isDevelopment(),
  metrics: env.ENABLE_METRICS,
});

// Monitoring configuration
export const getMonitoringConfig = () => ({
  enabled: env.ENABLE_METRICS,
  port: env.METRICS_PORT,
});

// Validate critical environment variables at startup
export const validateCriticalConfig = (): void => {
  const criticalErrors: string[] = [];

  // Check database URL format
  try {
    new URL(env.DATABASE_URL);
  } catch {
    criticalErrors.push("DATABASE_URL must be a valid URL");
  }

  // Check Redis URL format if provided
  if (env.REDIS_URL) {
    try {
      new URL(env.REDIS_URL);
    } catch {
      criticalErrors.push("REDIS_URL must be a valid URL if provided");
    }
  }

  // Check JWT secret in production
  if (isProduction() && !env.JWT_SECRET) {
    criticalErrors.push("JWT_SECRET is required in production");
  }

  // Check API key in production
  if (isProduction() && !env.API_KEY) {
    logger.warn(
      "API_KEY not set in production - consider adding for enhanced security"
    );
  }

  if (criticalErrors.length > 0) {
    logger.error("Critical configuration errors detected", {
      errors: criticalErrors,
    });
    throw new Error(
      `Critical configuration errors:\n${criticalErrors.join("\n")}`
    );
  }

  logger.info("Critical configuration validation passed");
};

// Export configuration summary for debugging
export const getConfigSummary = () => ({
  environment: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  database: {
    connected: Boolean(env.DATABASE_URL),
    timeout: env.DB_CONNECTION_TIMEOUT_MS,
    maxConnections: env.DB_MAX_CONNECTIONS,
  },
  redis: {
    enabled: Boolean(env.REDIS_URL),
  },
  security: {
    hasApiKey: Boolean(env.API_KEY),
    hasJwtSecret: Boolean(env.JWT_SECRET),
    enhancedValidation: env.ENABLE_ENHANCED_VALIDATION,
  },
  performance: {
    maxContactsPerOperation: env.MAX_CONTACTS_PER_OPERATION,
    maxChainDepth: env.MAX_CONTACT_CHAIN_DEPTH,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
  },
  features: getFeatureFlags(),
});
