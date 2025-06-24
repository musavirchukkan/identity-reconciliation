import { Request, Response } from 'express';
import { IdentityLinkingService } from '../services/identityLinkingService';
import { validateIdentifyRequestEnhanced, validateRequestLimits, validateBusinessRules } from '../utils/enhancedValidation';
import { formatIdentifySuccess, addApiHeaders, ResponseTimer } from '../utils/responseFormatter';
import { ValidationError, DatabaseError, BusinessLogicError } from '../middleware/errorHandler';
import { ContactResponse } from '../types/contact';
import { createModuleLogger, RequestContext, PerformanceMonitor } from '../utils/logger';
import { OperationDebugger, createConsolidatedContactDebugInfo } from '../utils/debugUtils';
import { EdgeCaseHandler } from '../utils/edgeCaseHandler';

const controllerLogger = createModuleLogger('IdentifyController');

export class IdentifyController {
  private identityLinkingService: IdentityLinkingService;

  constructor() {
    this.identityLinkingService = new IdentityLinkingService();
  }

  /**
   * Handle POST /identify requests with enhanced validation
   */
  async identify(req: Request, res: Response): Promise<void> {
    const requestContext = new RequestContext();
    const timer = new ResponseTimer();
    const perfMonitor = new PerformanceMonitor('identify_request');
    
    let debugger: OperationDebugger | undefined;

    try {
      // Add API headers
      addApiHeaders(res);

      // Initialize operation debugger for development
      if (process.env.NODE_ENV === 'development') {
        debugger = new OperationDebugger('identify_contact', {
          requestId: requestContext.requestId,
          body: req.body,
          ip: req.ip,
        });
      }

      requestContext.log('info', 'Starting identify request', {
        body: req.body,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Enhanced request validation
      try {
        validateRequestLimits(req);
        debugger?.addStep('request_limits_validated', { passed: true });
      } catch (error) {
        debugger?.addStep('request_limits_failed', { error: error instanceof Error ? error.message : 'Unknown' });
        throw error;
      }

      // Validate and sanitize request body
      let validatedRequest;
      try {
        validatedRequest = validateIdentifyRequestEnhanced(req.body);
        
        // Apply business rules validation
        validateBusinessRules(validatedRequest);
        
        debugger?.addStep('validation_complete', { validatedRequest });
        
        requestContext.log('debug', 'Request validation successful', { validatedRequest });
      } catch (error) {
        debugger?.addStep('validation_failed', { error: error instanceof Error ? error.message : 'Unknown' });
        throw error;
      }

      // Process identity linking with edge case handling
      let consolidatedContact;
      try {
        controllerLogger.info('Processing identity linking', {
          requestId: requestContext.requestId,
          email: validatedRequest.email ? '***@***.***' : null, // Mask email for privacy
          hasPhone: Boolean(validatedRequest.phoneNumber),
        });

        consolidatedContact = await this.identityLinkingService.identifyContact(
          validatedRequest.email,
          validatedRequest.phoneNumber
        );

        // Validate contact integrity
        EdgeCaseHandler.validateContactIntegrity(consolidatedContact.primaryContact);
        for (const secondary of consolidatedContact.secondaryContacts) {
          EdgeCaseHandler.validateContactIntegrity(secondary);
        }

        debugger?.addStep('identity_linking_complete', {
          primaryContactId: consolidatedContact.primaryContact.id,
          secondaryCount: consolidatedContact.secondaryContacts.length,
        });

        requestContext.log('info', 'Identity linking successful', {
          primaryContactId: consolidatedContact.primaryContact.id,
          totalLinkedContacts: consolidatedContact.secondaryContacts.length + 1,
        });

      } catch (error) {
        debugger?.addStep('identity_linking_failed', { 
          error: error instanceof Error ? error.message : 'Unknown' 
        });

        // Handle database constraint errors
        if (error instanceof Error && error.message.includes('constraint')) {
          EdgeCaseHandler.handleDatabaseConstraintError(error);
        }

        if (error instanceof Error) {
          if (error.message.includes('Database') || error.message.includes('connection')) {
            throw new DatabaseError('Database operation failed', error);
          }
          throw new BusinessLogicError(error.message);
        }
        throw error;
      }

      // Format response according to specification
      const response: ContactResponse = formatIdentifySuccess(
        consolidatedContact,
        timer.getElapsedTime()
      );

      // Validate response format
      if (!this.validateResponseFormat(response)) {
        throw new BusinessLogicError('Invalid response format generated');
      }

      // Complete performance monitoring
      const processingTime = perfMonitor.end({
        primaryContactId: response.contact.primaryContactId,
        emailsCount: response.contact.emails.length,
        phoneNumbersCount: response.contact.phoneNumbers.length,
        secondaryContactsCount: response.contact.secondaryContactIds.length,
      });

      // Add timing header
      timer.addTimingHeader(res);

      // Log successful response
      requestContext.log('info', 'Identify request completed successfully', {
        primaryContactId: response.contact.primaryContactId,
        totalEmails: response.contact.emails.length,
        totalPhones: response.contact.phoneNumbers.length,
        secondaryContacts: response.contact.secondaryContactIds.length,
        processingTime: `${processingTime}ms`,
      });

      // Complete debug operation (development only)
      if (debugger && process.env.NODE_ENV === 'development') {
        const debugInfo = debugger.complete({
          response,
          consolidatedContactDebug: createConsolidatedContactDebugInfo(consolidatedContact),
        });
        
        controllerLogger.debug('Operation debug info', debugInfo);
      }

      // Send response
      res.status(200).json(healthStatus);

    } catch (error) {
      timer.addTimingHeader(res);
      
      requestContext.log('error', 'Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(503).json({
        status: 'unhealthy',
        service: 'identity-reconciliation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
    }
  }
}).json(response);

    } catch (error) {
      this.handleError(error, req, res, timer, requestContext, debugger);
    }
  }

  /**
   * Validate response format before sending
   */
  private validateResponseFormat(response: ContactResponse): boolean {
    try {
      const { contact } = response;
      
      // Check required fields
      if (typeof contact.primaryContactId !== 'number' || contact.primaryContactId <= 0) return false;
      if (!Array.isArray(contact.emails)) return false;
      if (!Array.isArray(contact.phoneNumbers)) return false;
      if (!Array.isArray(contact.secondaryContactIds)) return false;
      
      // Check array content types
      if (!contact.emails.every(email => typeof email === 'string' && email.length > 0)) return false;
      if (!contact.phoneNumbers.every(phone => typeof phone === 'string' && phone.length > 0)) return false;
      if (!contact.secondaryContactIds.every(id => typeof id === 'number' && id > 0)) return false;
      
      // Check that at least one identifier exists
      if (contact.emails.length === 0 && contact.phoneNumbers.length === 0) return false;
      
      // Check for reasonable limits
      if (contact.emails.length > 50 || contact.phoneNumbers.length > 50) return false;
      if (contact.secondaryContactIds.length > 100) return false;
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle errors with comprehensive logging and debugging
   */
  private handleError(
    error: unknown, 
    req: Request, 
    res: Response, 
    timer: ResponseTimer,
    requestContext: RequestContext,
    debugger?: OperationDebugger
  ): void {
    // Add timing header even for errors
    timer.addTimingHeader(res);

    // Log error with full context
    const errorDetails = {
      error: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestBody: req.body,
      processingTime: requestContext.getElapsedTime(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    };

    requestContext.log('error', 'Identify request failed', errorDetails);

    // Complete debug operation with error
    if (debugger) {
      debugger.addStep('error_occurred', errorDetails);
      debugger.complete({ error: errorDetails });
    }

    // Handle specific error types
    if (error instanceof ValidationError) {
      controllerLogger.warn('Validation error', { 
        message: error.message, 
        field: error.field,
        requestId: requestContext.requestId,
      });

      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        field: error.field,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    if (error instanceof DatabaseError) {
      controllerLogger.error('Database error', { 
        message: error.message,
        requestId: requestContext.requestId,
      }, error.originalError);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Database operation failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    if (error instanceof BusinessLogicError) {
      controllerLogger.warn('Business logic error', {
        message: error.message,
        code: error.code,
        requestId: requestContext.requestId,
      });

      res.status(422).json({
        error: 'Unprocessable Entity',
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    // Handle unknown errors
    controllerLogger.error('Unexpected error', errorDetails, error as Error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      timestamp: new Date().toISOString(),
      requestId: requestContext.requestId,
    });
  }

  /**
   * Enhanced health check for the identify service
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    const requestContext = new RequestContext();
    const timer = new ResponseTimer();
    
    try {
      addApiHeaders(res);

      requestContext.log('debug', 'Health check requested');

      // Basic health status
      const healthStatus = {
        status: 'healthy',
        service: 'identity-reconciliation',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        requestId: requestContext.requestId,
      };

      timer.addTimingHeader(res);
      
      requestContext.log('info', 'Health check completed', { 
        status: healthStatus.status,
        uptime: healthStatus.uptime,
      });

      res.status(200import { Request, Response } from 'express';
import { IdentityLinkingService } from '../services/identityLinkingService';
import { validateIdentifyRequest } from '../utils/validation';
import { formatIdentifySuccess, addApiHeaders, ResponseTimer } from '../utils/responseFormatter';
import { ValidationError, DatabaseError, BusinessLogicError } from '../middleware/errorHandler';
import { ContactResponse } from '../types/contact';
import { createModuleLogger, RequestContext, PerformanceMonitor } from '../utils/logger';
import { OperationDebugger, createConsolidatedContactDebugInfo } from '../utils/debugUtils';

const controllerLogger = createModuleLogger('IdentifyController');

export class IdentifyController {
  private identityLinkingService: IdentityLinkingService;

  constructor() {
    this.identityLinkingService = new IdentityLinkingService();
  }

  /**
   * Handle POST /identify requests
   */
  async identify(req: Request, res: Response): Promise<void> {
    const requestContext = new RequestContext();
    const timer = new ResponseTimer();
    const perfMonitor = new PerformanceMonitor('identify_request');
    
    let debugger: OperationDebugger | undefined;

    try {
      // Add API headers
      addApiHeaders(res);

      // Initialize operation debugger for development
      if (process.env.NODE_ENV === 'development') {
        debugger = new OperationDebugger('identify_contact', {
          requestId: requestContext.requestId,
          body: req.body,
          ip: req.ip,
        });
      }

      requestContext.log('info', 'Starting identify request', {
        body: req.body,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Validate request body
      let validatedRequest;
      try {
        validatedRequest = validateIdentifyRequest(req.body);
        debugger?.addStep('validation_complete', { validatedRequest });
        
        requestContext.log('debug', 'Request validation successful', { validatedRequest });
      } catch (error) {
      timer.addTimingHeader(res);
      
      requestContext.log('error', 'Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(503).json({
        status: 'unhealthy',
        service: 'identity-reconciliation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
    }
  }
} (error) {
        debugger?.addStep('validation_failed', { error: error instanceof Error ? error.message : 'Unknown' });
        throw new ValidationError(
          error instanceof Error ? error.message : 'Invalid request format'
        );
      }

      // Process identity linking
      let consolidatedContact;
      try {
        controllerLogger.info('Processing identity linking', {
          requestId: requestContext.requestId,
          email: validatedRequest.email ? '***@***.***' : null, // Mask email for privacy
          hasPhone: Boolean(validatedRequest.phoneNumber),
        });

        consolidatedContact = await this.identityLinkingService.identifyContact(
          validatedRequest.email,
          validatedRequest.phoneNumber
        );

        debugger?.addStep('identity_linking_complete', {
          primaryContactId: consolidatedContact.primaryContact.id,
          secondaryCount: consolidatedContact.secondaryContacts.length,
        });

        requestContext.log('info', 'Identity linking successful', {
          primaryContactId: consolidatedContact.primaryContact.id,
          totalLinkedContacts: consolidatedContact.secondaryContacts.length + 1,
        });

      } catch (error) {
        debugger?.addStep('identity_linking_failed', { 
          error: error instanceof Error ? error.message : 'Unknown' 
        });

        if (error instanceof Error) {
          if (error.message.includes('Database') || error.message.includes('connection')) {
            throw new DatabaseError('Database operation failed', error);
          }
          throw new BusinessLogicError(error.message);
        }
        throw error;
      }

      // Format response according to specification
      const response: ContactResponse = formatIdentifySuccess(
        consolidatedContact,
        timer.getElapsedTime()
      );

      // Complete performance monitoring
      const processingTime = perfMonitor.end({
        primaryContactId: response.contact.primaryContactId,
        emailsCount: response.contact.emails.length,
        phoneNumbersCount: response.contact.phoneNumbers.length,
        secondaryContactsCount: response.contact.secondaryContactIds.length,
      });

      // Add timing header
      timer.addTimingHeader(res);

      // Log successful response
      requestContext.log('info', 'Identify request completed successfully', {
        primaryContactId: response.contact.primaryContactId,
        totalEmails: response.contact.emails.length,
        totalPhones: response.contact.phoneNumbers.length,
        secondaryContacts: response.contact.secondaryContactIds.length,
        processingTime: `${processingTime}ms`,
      });

      // Complete debug operation (development only)
      if (debugger && process.env.NODE_ENV === 'development') {
        const debugInfo = debugger.complete({
          response,
          consolidatedContactDebug: createConsolidatedContactDebugInfo(consolidatedContact),
        });
        
        controllerLogger.debug('Operation debug info', debugInfo);
      }

      // Send response
      res.status(200).json(response);

    } catch (error) {
      this.handleError(error, req, res, timer, requestContext, debugger);
    }
  }

  /**
   * Handle errors with comprehensive logging and debugging
   */
  private handleError(
    error: unknown, 
    req: Request, 
    res: Response, 
    timer: ResponseTimer,
    requestContext: RequestContext,
    debugger?: OperationDebugger
  ): void {
    // Add timing header even for errors
    timer.addTimingHeader(res);

    // Log error with full context
    const errorDetails = {
      error: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestBody: req.body,
      processingTime: requestContext.getElapsedTime(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    };

    requestContext.log('error', 'Identify request failed', errorDetails);

    // Complete debug operation with error
    if (debugger) {
      debugger.addStep('error_occurred', errorDetails);
      debugger.complete({ error: errorDetails });
    }

    // Handle specific error types
    if (error instanceof ValidationError) {
      controllerLogger.warn('Validation error', { 
        message: error.message, 
        field: error.field,
        requestId: requestContext.requestId,
      });

      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        field: error.field,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    if (error instanceof DatabaseError) {
      controllerLogger.error('Database error', { 
        message: error.message,
        requestId: requestContext.requestId,
      }, error.originalError);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Database operation failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    if (error instanceof BusinessLogicError) {
      controllerLogger.warn('Business logic error', {
        message: error.message,
        code: error.code,
        requestId: requestContext.requestId,
      });

      res.status(422).json({
        error: 'Unprocessable Entity',
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
      return;
    }

    // Handle unknown errors
    controllerLogger.error('Unexpected error', errorDetails, error as Error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      timestamp: new Date().toISOString(),
      requestId: requestContext.requestId,
    });
  }

  /**
   * Enhanced health check for the identify service
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    const requestContext = new RequestContext();
    const timer = new ResponseTimer();
    
    try {
      addApiHeaders(res);

      requestContext.log('debug', 'Health check requested');

      // Basic health status
      const healthStatus = {
        status: 'healthy',
        service: 'identity-reconciliation',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        requestId: requestContext.requestId,
      };

      timer.addTimingHeader(res);
      
      requestContext.log('info', 'Health check completed', { 
        status: healthStatus.status,
        uptime: healthStatus.uptime,
      });

      res.status(200).json(healthStatus);

    } catch (error) {
      timer.addTimingHeader(res);
      
      requestContext.log('error', 'Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(503).json({
        status: 'unhealthy',
        service: 'identity-reconciliation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId: requestContext.requestId,
      });
    }
  }
} (error) {
      timer.addTimingHeader(res);
      
      res.status(503).json({
        status: 'unhealthy',
        service: 'identity-reconciliation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}