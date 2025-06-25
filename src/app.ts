import express from "express";
import cors from "cors";
import { config } from "./config/environment";
import { applySecurity } from "./middleware/security";
import { applyLogger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import { identifyRouter } from "./routes/identify";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

// Security headers
applySecurity(app);
// Logger
applyLogger(app);
// CORS
app.use(cors());
// JSON body parser
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/", identifyRouter);

// Health check (with DB check)
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "identity-reconciliation",
    });
  } catch (err) {
    res.status(503).json({
      status: "unhealthy",
      error: "Database connection failed",
    });
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use("*", (_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const server = app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📋 Health check: http://localhost:${config.port}/health`);
  console.log(`🔗 Identify endpoint: http://localhost:${config.port}/identify`);
});

// Graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("Shutting down gracefully...");
  server.close(() => {
    prisma.$disconnect().then(() => {
      console.log("Shutdown complete.");
      process.exit(0);
    });
  });
}

export default app;
