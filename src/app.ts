import express from "express";
import cors from "cors";
import morgan from "morgan";
import identifyRoutes from "./routes/identifyRoutes";
import { checkDatabaseConnection } from "./utils/database";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { logger, createModuleLogger } from "./utils/logger";
import {
  env,
  getCorsConfig,
  validateCriticalConfig,
  getConfigSummary,
  isProduction,
} from "./config/environment";
import { applySecurity, apiKeyAuth } from "./middleware/security";

const appLogger = createModuleLogger("App");

// Validate critical configuration at startup
try {
  validateCriticalConfig();
} catch (error) {
  console.error(
    "❌ Critical configuration error:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}

const app = express();
const PORT = env.PORT;

// Apply comprehensive security middleware
applySecurity(app);

// CORS configuration with environment-specific origins
app.use(cors(getCorsConfig()));

// Request parsing middleware
app.use(
  express.json({
    limit: env.MAX_REQUEST_BODY_SIZE,
    strict: true,
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: env.MAX_REQUEST_BODY_SIZE,
  })
);

// Enhanced logging middleware
app.use(
  morgan(
    isProduction()
      ? "combined"
      : ":method :url :status :res[content-length] - :response-time ms",
    {
      stream: {
        write: (message: string) => {
          const parts = message.trim().split(" ");
          logger.httpRequest(
            parts[0] || "UNKNOWN",
            parts[1] || "UNKNOWN",
            parseInt(parts[2]) || 0,
            parseFloat(parts[6]) || 0
          );
        },
      },
    }
  )
);

// Health check endpoint with comprehensive status
app.get("/health", async (req, res) => {
  const startTime = Date.now();

  try {
    const dbHealthy = await checkDatabaseConnection();
    const responseTime = Date.now() - startTime;

    const healthStatus = {
      status: dbHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: dbHealthy ? "connected" : "disconnected",
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || "1.0.0",
      config: isProduction() ? undefined : getConfigSummary(),
    };

    appLogger.info("Health check completed", {
      status: healthStatus.status,
      dbStatus: healthStatus.database,
      responseTime: healthStatus.responseTime,
    });

    res.status(dbHealthy ? 200 : 503).json(healthStatus);
  } catch (error) {
    const responseTime = Date.now() - startTime;

    appLogger.error("Health check failed", {
      responseTime: `${responseTime}ms`,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: "error",
      responseTime: `${responseTime}ms`,
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

// Configuration endpoint (development only)
if (!isProduction()) {
  app.get("/config", (req, res) => {
    res.json(getConfigSummary());
  });
}

// API routes with optional API key protection
if (env.API_KEY) {
  app.use("/", apiKeyAuth, identifyRoutes);
} else {
  app.use("/", identifyRoutes);
  if (isProduction()) {
    appLogger.warn("API running without API key protection in production");
  }
}

// 404 handler for undefined routes
app.use("*", notFoundHandler);

// Global error handler
app.use(errorHandler);

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(env.REQUEST_TIMEOUT_MS, () => {
    appLogger.warn("Request timeout", {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    if (!res.headersSent) {
      res.status(408).json({
        error: "Request Timeout",
        message: "Request took too long to process",
      });
    }
  });
  next();
});

// Start server
const server = app.listen(PORT, () => {
  appLogger.info("Server started successfully", {
    port: PORT,
    environment: env.NODE_ENV,
    nodeVersion: process.version,
    pid: process.pid,
    hasApiKey: Boolean(env.API_KEY),
    hasRedis: Boolean(env.REDIS_URL),
  });

  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Identify endpoint: http://localhost:${PORT}/identify`);
  console.log(`🌍 Environment: ${env.NODE_ENV}`);

  if (!isProduction()) {
    console.log(`⚙️  Configuration: http://localhost:${PORT}/config`);
  }
});

// Set server timeout
server.timeout = env.REQUEST_TIMEOUT_MS;

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  appLogger.info(`${signal} received, initiating graceful shutdown`);

  server.close((err) => {
    if (err) {
      appLogger.error("Error during server shutdown", { error: err.message });
      process.exit(1);
    }

    appLogger.info("Server closed successfully");
    process.exit(0);
  });

  // Force close after timeout
  setTimeout(() => {
    appLogger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

// Handle process signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  appLogger.error("Uncaught exception", { error: error.message }, error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  appLogger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Memory usage monitoring
if (!isProduction()) {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const mbUsage = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    if (mbUsage.heapUsed > 200) {
      // Alert if heap usage > 200MB
      appLogger.warn("High memory usage detected", mbUsage);
    }
  }, 60000); // Check every minute
}

export default app;
