/**
 * Centralized logging utility with different log levels
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  stack?: string;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    // Set log level based on environment
    this.logLevel = this.getLogLevelFromEnv();
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case "ERROR":
        return LogLevel.ERROR;
      case "WARN":
        return LogLevel.WARN;
      case "INFO":
        return LogLevel.INFO;
      case "DEBUG":
        return LogLevel.DEBUG;
      default:
        return process.env.NODE_ENV === "production"
          ? LogLevel.INFO
          : LogLevel.DEBUG;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLogEntry(entry: LogEntry): string {
    const { level, message, timestamp, context, stack } = entry;
    const levelName = LogLevel[level];

    let logString = `[${timestamp}] ${levelName}: ${message}`;

    if (context && Object.keys(context).length > 0) {
      logString += ` | Context: ${JSON.stringify(context)}`;
    }

    if (stack && process.env.NODE_ENV === "development") {
      logString += `\nStack: ${stack}`;
    }

    return logString;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      stack: error?.stack,
    };

    const formattedLog = this.formatLogEntry(entry);

    // Output to appropriate stream based on level
    if (level <= LogLevel.ERROR) {
      console.error(formattedLog);
    } else if (level === LogLevel.WARN) {
      console.warn(formattedLog);
    } else {
      console.log(formattedLog);
    }

    // In production, you might want to send logs to external service
    if (process.env.NODE_ENV === "production" && level <= LogLevel.ERROR) {
      this.sendToExternalLogging(entry);
    }
  }

  private sendToExternalLogging(entry: LogEntry): void {
    // Placeholder for external logging service (e.g., Winston, LogRocket, etc.)
    // This would be implemented based on your logging infrastructure
  }

  // Public logging methods
  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  // Specialized logging methods for common use cases
  httpRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    context?: Record<string, any>
  ): void {
    this.info("HTTP Request", {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
      ...context,
    });
  }

  databaseOperation(
    operation: string,
    table: string,
    duration: number,
    context?: Record<string, any>
  ): void {
    this.debug("Database Operation", {
      operation,
      table,
      duration: `${duration}ms`,
      ...context,
    });
  }

  businessLogic(
    operation: string,
    result: string,
    context?: Record<string, any>
  ): void {
    this.info("Business Logic", {
      operation,
      result,
      ...context,
    });
  }

  identityOperation(
    operation: "create" | "link" | "consolidate" | "search",
    contactId: number,
    details: Record<string, any>
  ): void {
    this.info("Identity Operation", {
      operation,
      contactId,
      ...details,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export specialized loggers for different modules
export const createModuleLogger = (moduleName: string) => ({
  error: (message: string, context?: Record<string, any>, error?: Error) =>
    logger.error(`[${moduleName}] ${message}`, context, error),
  warn: (message: string, context?: Record<string, any>) =>
    logger.warn(`[${moduleName}] ${message}`, context),
  info: (message: string, context?: Record<string, any>) =>
    logger.info(`[${moduleName}] ${message}`, context),
  debug: (message: string, context?: Record<string, any>) =>
    logger.debug(`[${moduleName}] ${message}`, context),
});

// Performance monitoring utilities
export class PerformanceMonitor {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
    logger.debug(`Starting operation: ${operation}`);
  }

  end(context?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    logger.debug(`Completed operation: ${this.operation}`, {
      duration: `${duration}ms`,
      ...context,
    });
    return duration;
  }
}

// Request context utility for tracking requests across services
export class RequestContext {
  public readonly requestId: string;
  public readonly startTime: number;
  private logger = createModuleLogger("RequestContext");

  constructor(requestId?: string) {
    this.requestId = requestId || this.generateRequestId();
    this.startTime = Date.now();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  log(
    level: "error" | "warn" | "info" | "debug",
    message: string,
    context?: Record<string, any>
  ): void {
    this.logger[level](message, {
      requestId: this.requestId,
      elapsedTime: `${Date.now() - this.startTime}ms`,
      ...context,
    });
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }
}
