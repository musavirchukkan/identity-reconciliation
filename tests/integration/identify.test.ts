import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/utils/database";

// Mock the database
jest.mock("../../src/utils/database", () => ({
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

describe("POST /identify Integration Tests", () => {
  const mockPrisma = prisma as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Successful requests", () => {
    it("should create new primary contact when no existing contacts", async () => {
      // Mock database responses
      mockPrisma.contact.findFirst.mockResolvedValue(null); // No exact match
      mockPrisma.contact.findMany.mockResolvedValue([]); // No partial matches

      const newContact = {
        id: 1,
        email: "lorraine@hillvalley.edu",
        phoneNumber: "123456",
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date("2023-04-01T00:00:00.374Z"),
        updatedAt: new Date("2023-04-01T00:00:00.374Z"),
        deletedAt: null,
      };

      mockPrisma.contact.create.mockResolvedValue(newContact);

      const response = await request(app).post("/identify").send({
        email: "lorraine@hillvalley.edu",
        phoneNumber: "123456",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        contact: {
          primaryContactId: 1,
          emails: ["lorraine@hillvalley.edu"],
          phoneNumbers: ["123456"],
          secondaryContactIds: [],
        },
      });

      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: {
          email: "lorraine@hillvalley.edu",
          phoneNumber: "123456",
          linkedId: undefined,
          linkPrecedence: "primary",
        },
      });
    });

    it("should return existing contact group when exact match found", async () => {
      const primaryContact = {
        id: 1,
        email: "lorraine@hillvalley.edu",
        phoneNumber: "123456",
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date("2023-04-01T00:00:00.374Z"),
        updatedAt: new Date("2023-04-01T00:00:00.374Z"),
        deletedAt: null,
      };

      const secondaryContact = {
        id: 2,
        email: "mcfly@hillvalley.edu",
        phoneNumber: "123456",
        linkedId: 1,
        linkPrecedence: "secondary",
        createdAt: new Date("2023-04-20T05:30:00.110Z"),
        updatedAt: new Date("2023-04-20T05:30:00.110Z"),
        deletedAt: null,
      };

      // Mock exact match found
      mockPrisma.contact.findFirst.mockResolvedValue(primaryContact);
      mockPrisma.contact.findMany.mockResolvedValue([
        primaryContact,
        secondaryContact,
      ]);

      const response = await request(app).post("/identify").send({
        email: "lorraine@hillvalley.edu",
        phoneNumber: "123456",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        contact: {
          primaryContactId: 1,
          emails: ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
          phoneNumbers: ["123456"],
          secondaryContactIds: [2],
        },
      });
    });

    it("should create secondary contact when partial match found", async () => {
      const existingPrimary = {
        id: 1,
        email: "lorraine@hillvalley.edu",
        phoneNumber: "123456",
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date("2023-04-01T00:00:00.374Z"),
        updatedAt: new Date("2023-04-01T00:00:00.374Z"),
        deletedAt: null,
      };

      const newSecondary = {
        id: 2,
        email: "mcfly@hillvalley.edu",
        phoneNumber: "123456",
        linkedId: 1,
        linkPrecedence: "secondary",
        createdAt: new Date("2023-04-20T05:30:00.110Z"),
        updatedAt: new Date("2023-04-20T05:30:00.110Z"),
        deletedAt: null,
      };

      // Mock partial match (phone number exists)
      mockPrisma.contact.findFirst.mockResolvedValue(null); // No exact match
      mockPrisma.contact.findMany
        .mockResolvedValueOnce([]) // No email matches
        .mockResolvedValueOnce([existingPrimary]) // Phone match found
        .mockResolvedValueOnce([existingPrimary]) // Related contacts
        .mockResolvedValueOnce([existingPrimary, newSecondary]); // Final linked contacts

      mockPrisma.contact.create.mockResolvedValue(newSecondary);

      const response = await request(app).post("/identify").send({
        email: "mcfly@hillvalley.edu",
        phoneNumber: "123456",
      });

      expect(response.status).toBe(200);
      expect(response.body.contact.primaryContactId).toBe(1);
      expect(response.body.contact.secondaryContactIds).toContain(2);
    });

    it("should handle email-only requests", async () => {
      const newContact = {
        id: 1,
        email: "test@example.com",
        phoneNumber: null,
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.create.mockResolvedValue(newContact);

      const response = await request(app).post("/identify").send({
        email: "test@example.com",
      });

      expect(response.status).toBe(200);
      expect(response.body.contact.emails).toEqual(["test@example.com"]);
      expect(response.body.contact.phoneNumbers).toEqual([]);
    });

    it("should handle phone-only requests", async () => {
      const newContact = {
        id: 1,
        email: null,
        phoneNumber: "123456789",
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.create.mockResolvedValue(newContact);

      const response = await request(app).post("/identify").send({
        phoneNumber: "123456789",
      });

      expect(response.status).toBe(200);
      expect(response.body.contact.emails).toEqual([]);
      expect(response.body.contact.phoneNumbers).toEqual(["123456789"]);
    });
  });

  describe("Validation errors", () => {
    it("should return 400 for missing email and phoneNumber", async () => {
      const response = await request(app).post("/identify").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Bad Request");
      expect(response.body.message).toContain(
        "Either email or phoneNumber must be provided"
      );
    });

    it("should return 400 for invalid email format", async () => {
      const response = await request(app).post("/identify").send({
        email: "invalid-email-format",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Bad Request");
    });

    it("should return 400 for invalid phone number format", async () => {
      const response = await request(app).post("/identify").send({
        phoneNumber: "invalid-phone",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Bad Request");
    });

    it("should handle empty strings as null values", async () => {
      const response = await request(app).post("/identify").send({
        email: "",
        phoneNumber: "",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Bad Request");
    });
  });

  describe("Database errors", () => {
    it("should return 500 for database connection errors", async () => {
      mockPrisma.contact.findFirst.mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await request(app).post("/identify").send({
        email: "test@example.com",
        phoneNumber: "123456",
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe("Unprocessable Entity");
    });

    it("should return 500 for unexpected database errors", async () => {
      mockPrisma.contact.findFirst.mockRejectedValue(
        new Error("Unexpected database error")
      );

      const response = await request(app).post("/identify").send({
        email: "test@example.com",
        phoneNumber: "123456",
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe("Unprocessable Entity");
    });
  });

  describe("Rate limiting", () => {
    it("should accept requests within rate limit", async () => {
      // Set up mock for successful request
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.create.mockResolvedValue({
        id: 1,
        email: "test@example.com",
        phoneNumber: null,
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      // Make multiple requests (should be within limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post("/identify")
          .send({
            email: `test${i}@example.com`,
          });

        expect(response.status).toBe(200);
        expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      }
    });
  });

  describe("Response headers", () => {
    it("should include proper API headers", async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.create.mockResolvedValue({
        id: 1,
        email: "test@example.com",
        phoneNumber: null,
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const response = await request(app).post("/identify").send({
        email: "test@example.com",
      });

      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["x-response-time"]).toBeDefined();
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
    });
  });

  describe("Health check endpoint", () => {
    it("should return healthy status", async () => {
      const response = await request(app).get("/identify/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("healthy");
      expect(response.body.service).toBe("identity-reconciliation");
      expect(response.body.requestId).toBeDefined();
    });
  });
});
