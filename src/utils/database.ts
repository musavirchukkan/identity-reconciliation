import { PrismaClient } from "@prisma/client";

// Global Prisma client instance
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client with configuration
const createPrismaClient = () => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
    errorFormat: "pretty",
  });
};

// Use global instance in development to prevent multiple connections
const prisma = globalThis.__prisma || createPrismaClient();

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Database connection health check
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
};

// Graceful database disconnection
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log("Database disconnected successfully");
  } catch (error) {
    console.error("Error disconnecting from database:", error);
  }
};

export { prisma };
export default prisma;
