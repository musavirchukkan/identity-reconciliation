import { Contact } from "@prisma/client";
import { ConsolidatedContact } from "../types/contact";
import { logger, createModuleLogger } from "./logger";

const debugLogger = createModuleLogger("Debug");

/**
 * Debug utilities for development and troubleshooting
 */

export interface ContactDebugInfo {
  contactId: number;
  linkPrecedence: string;
  linkedId: number | null;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string;
  hasLinkedContacts: boolean;
  linkedContactsCount: number;
}

export interface OperationDebugInfo {
  operation: string;
  timestamp: string;
  input: Record<string, any>;
  output: Record<string, any>;
  processingTime: number;
  intermediateSteps: Array<{
    step: string;
    timestamp: string;
    data: any;
  }>;
}

/**
 * Create detailed debug information for a contact
 */
export const createContactDebugInfo = (
  contact: Contact,
  linkedContacts?: Contact[]
): ContactDebugInfo => {
  return {
    contactId: contact.id,
    linkPrecedence: contact.linkPrecedence,
    linkedId: contact.linkedId,
    email: contact.email,
    phoneNumber: contact.phoneNumber,
    createdAt: contact.createdAt.toISOString(),
    hasLinkedContacts: Boolean(linkedContacts && linkedContacts.length > 0),
    linkedContactsCount: linkedContacts ? linkedContacts.length : 0,
  };
};

/**
 * Create debug information for consolidated contact result
 */
export const createConsolidatedContactDebugInfo = (
  consolidatedContact: ConsolidatedContact
): Record<string, any> => {
  return {
    primaryContact: createContactDebugInfo(consolidatedContact.primaryContact),
    secondaryContacts: consolidatedContact.secondaryContacts.map((contact) =>
      createContactDebugInfo(contact)
    ),
    totalEmails: consolidatedContact.allEmails.length,
    totalPhoneNumbers: consolidatedContact.allPhoneNumbers.length,
    emails: consolidatedContact.allEmails,
    phoneNumbers: consolidatedContact.allPhoneNumbers,
    contactHierarchy: {
      primaryId: consolidatedContact.primaryContact.id,
      secondaryIds: consolidatedContact.secondaryContacts.map((c) => c.id),
      totalContacts: consolidatedContact.secondaryContacts.length + 1,
    },
  };
};

/**
 * Operation debugger for tracking complex operations
 */
export class OperationDebugger {
  private operation: string;
  private startTime: number;
  private steps: Array<{ step: string; timestamp: string; data: any }> = [];
  private input: Record<string, any>;

  constructor(operation: string, input: Record<string, any>) {
    this.operation = operation;
    this.startTime = Date.now();
    this.input = input;

    debugLogger.debug(`Starting operation: ${operation}`, { input });
  }

  addStep(step: string, data: any): void {
    this.steps.push({
      step,
      timestamp: new Date().toISOString(),
      data,
    });

    debugLogger.debug(`Operation step: ${this.operation} - ${step}`, { data });
  }

  complete(output: Record<string, any>): OperationDebugInfo {
    const processingTime = Date.now() - this.startTime;

    const debugInfo: OperationDebugInfo = {
      operation: this.operation,
      timestamp: new Date().toISOString(),
      input: this.input,
      output,
      processingTime,
      intermediateSteps: this.steps,
    };

    debugLogger.info(`Completed operation: ${this.operation}`, {
      processingTime: `${processingTime}ms`,
      stepsCount: this.steps.length,
      outputKeys: Object.keys(output),
    });

    return debugInfo;
  }
}

/**
 * Database query debugger
 */
export class DatabaseQueryDebugger {
  private queries: Array<{
    query: string;
    duration: number;
    timestamp: string;
    resultCount?: number;
  }> = [];

  logQuery(query: string, duration: number, resultCount?: number): void {
    const queryInfo = {
      query,
      duration,
      timestamp: new Date().toISOString(),
      resultCount,
    };

    this.queries.push(queryInfo);

    if (process.env.NODE_ENV === "development") {
      debugLogger.debug("Database Query", {
        query,
        duration: `${duration}ms`,
        resultCount,
      });
    }
  }

  getQueryStats(): {
    totalQueries: number;
    totalDuration: number;
    averageDuration: number;
    slowestQuery: string;
    slowestDuration: number;
  } {
    const totalQueries = this.queries.length;
    const totalDuration = this.queries.reduce((sum, q) => sum + q.duration, 0);
    const averageDuration = totalQueries > 0 ? totalDuration / totalQueries : 0;

    const slowest = this.queries.reduce(
      (prev, current) => (current.duration > prev.duration ? current : prev),
      { query: "", duration: 0 }
    );

    return {
      totalQueries,
      totalDuration,
      averageDuration,
      slowestQuery: slowest.query,
      slowestDuration: slowest.duration,
    };
  }
}

/**
 * Memory usage monitor
 */
export const getMemoryUsage = (): Record<string, string> => {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`,
  };
};

/**
 * System health check for debugging
 */
export const getSystemHealth = (): Record<string, any> => {
  return {
    timestamp: new Date().toISOString(),
    uptime: `${Math.round(process.uptime())} seconds`,
    memory: getMemoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    cpuUsage: process.cpuUsage(),
    environment: process.env.NODE_ENV || "development",
    pid: process.pid,
  };
};

/**
 * Contact relationship visualizer (for debugging complex linking)
 */
export const visualizeContactRelationships = (contacts: Contact[]): string => {
  if (contacts.length === 0) return "No contacts to visualize";

  const primaryContacts = contacts.filter(
    (c) => c.linkPrecedence === "primary"
  );
  const secondaryContacts = contacts.filter(
    (c) => c.linkPrecedence === "secondary"
  );

  let visualization = "📊 Contact Relationships:\n\n";

  for (const primary of primaryContacts) {
    visualization += `🔵 PRIMARY: ID ${primary.id}\n`;
    visualization += `   📧 Email: ${primary.email || "N/A"}\n`;
    visualization += `   📱 Phone: ${primary.phoneNumber || "N/A"}\n`;
    visualization += `   📅 Created: ${primary.createdAt.toISOString()}\n`;

    const linkedSecondaries = secondaryContacts.filter(
      (s) => s.linkedId === primary.id
    );

    if (linkedSecondaries.length > 0) {
      visualization += `   └── LINKED SECONDARIES (${linkedSecondaries.length}):\n`;

      for (const secondary of linkedSecondaries) {
        visualization += `       🔸 ID ${secondary.id}\n`;
        visualization += `          📧 ${secondary.email || "N/A"}\n`;
        visualization += `          📱 ${secondary.phoneNumber || "N/A"}\n`;
        visualization += `          📅 ${secondary.createdAt.toISOString()}\n`;
      }
    } else {
      visualization += `   └── No linked secondaries\n`;
    }

    visualization += "\n";
  }

  // Show orphaned secondaries (shouldn't exist but good for debugging)
  const orphanedSecondaries = secondaryContacts.filter(
    (s) => !primaryContacts.some((p) => p.id === s.linkedId)
  );

  if (orphanedSecondaries.length > 0) {
    visualization += "⚠️  ORPHANED SECONDARIES:\n";
    for (const orphaned of orphanedSecondaries) {
      visualization += `   🔸 ID ${orphaned.id} (linked to: ${orphaned.linkedId})\n`;
    }
  }

  return visualization;
};

/**
 * Export debug information to JSON for external analysis
 */
export const exportDebugData = (data: any, filename?: string): string => {
  const exportData = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    systemHealth: getSystemHealth(),
    data,
  };

  const jsonData = JSON.stringify(exportData, null, 2);

  if (filename && process.env.NODE_ENV === "development") {
    // In a real application, you might write to file system
    debugLogger.info(`Debug data exported`, {
      filename,
      dataSize: jsonData.length,
    });
  }

  return jsonData;
};
