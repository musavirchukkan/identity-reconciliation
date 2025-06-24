/**
 * Test setup configuration
 */

// Set test environment
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "ERROR"; // Reduce log noise during tests

// Mock console methods to avoid noise in test output
const originalConsole = { ...console };

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.debug = jest.fn();
  // Keep console.error for important test failures
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test timeout
jest.setTimeout(10000);

// Mock external dependencies if needed
jest.mock("../src/utils/database", () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
  checkDatabaseConnection: jest.fn(() => Promise.resolve(true)),
  disconnectDatabase: jest.fn(() => Promise.resolve()),
}));
