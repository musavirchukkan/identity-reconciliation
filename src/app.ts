import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import identifyRoutes from "./routes/identifyRoutes";
import { checkDatabaseConnection } from "./utils/database";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { logger, createModuleLogger } from "./utils/logger";

const appLogger = createModuleLogger("App");
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://your-frontend-domain.com"]
        : ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })
);

// Request parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Enhanced logging middleware
app.use(
  morgan(
    process.env.NODE_ENV === "production"
      ? "combined"
      : ":method :url :status :res[content-length] - :response-time ms",
    {
      stream: {
        write: (message: string) => {
          logger.httpRequest(
            message.split(" ")[0] || "UNKNOWN",
            message.split(" ")[1] || "UNKNOWN",
            parseInt(message.split(" ")[2]) || 0,
            parseFloat(message.split(" ")[6]) || 0
          );
        },
      },
    }
  )
);

// Health check endpoint with database connectivity
app.get("/health", async (req, res) => {
  const startTime = Date.now();

  try {
    const dbHealthy = await checkDatabaseConnection();
    const responseTime = Date.now() - startTime;

    const healthStatus = {
      status: dbHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: dbHealthy ? "connected" : "disconnected",
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || "1.0.0",
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
      environment: process.env.NODE_ENV || "development",
      database: "error",
      responseTime: `${responseTime}ms`,
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

// API routes
app.use("/", identifyRoutes);

// 404 handler for undefined routes
app.use("*", notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  appLogger.info("Server started successfully", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    pid: process.pid,
  });

  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Identify endpoint: http://localhost:${PORT}/identify`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});

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

  // Force close after 30 seconds
  setTimeout(() => {
    appLogger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

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

export default app;
