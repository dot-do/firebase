/**
 * @fileoverview Main router for Firebase services
 *
 * Routes incoming requests to the appropriate Firebase service handlers
 * (auth, firestore, storage, functions) based on URL patterns.
 */

/**
 * Supported Firebase service types
 */
export type ServiceType = 'auth' | 'firestore' | 'storage' | 'functions' | null

/**
 * HTTP methods supported by the router
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

/**
 * Incoming request structure for routing
 */
export interface RouterRequest {
  method: HttpMethod
  path: string
  headers: Record<string, string>
  body?: unknown
  query?: Record<string, string>
}

/**
 * Response structure from routed handlers
 */
export interface RouterResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

/**
 * Service handler interface that each service adapter should implement
 */
export interface ServiceHandler {
  handle(request: RouterRequest): Promise<RouterResponse>
}

/**
 * ServiceRouter interface for routing requests to Firebase services
 */
export interface IServiceRouter {
  route(request: RouterRequest): Promise<RouterResponse>
  getServiceForPath(path: string, method: string): ServiceType
}

/**
 * Main router implementation that routes requests to Firebase service handlers
 */
export class ServiceRouter implements IServiceRouter {
  private handlers: Map<ServiceType, ServiceHandler> = new Map()

  /**
   * Register a service handler for a specific service type
   */
  registerHandler(service: Exclude<ServiceType, null>, handler: ServiceHandler): void {
    this.handlers.set(service, handler)
  }

  /**
   * Route an incoming request to the appropriate service handler
   */
  async route(request: RouterRequest): Promise<RouterResponse> {
    const service = this.getServiceForPath(request.path, request.method)

    if (!service) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: { error: { code: 404, message: 'Not Found', status: 'NOT_FOUND' } },
      }
    }

    const handler = this.handlers.get(service)
    if (handler) {
      return handler.handle(request)
    }

    // Return a response indicating which service would handle this
    // (useful for testing route matching without full handler implementation)
    return {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-routed-to': service },
      body: { service, path: request.path, method: request.method },
    }
  }

  /**
   * Determine which service should handle a given path and method
   *
   * Route matching priority:
   * 1. Auth routes (Identity Toolkit and Secure Token)
   * 2. Storage routes (upload and object operations)
   * 3. Firestore routes (document and database operations)
   * 4. Functions routes (callable and HTTP functions)
   */
  getServiceForPath(path: string, method: string): ServiceType {
    // Auth service routes - Identity Toolkit API
    if (
      path.includes('identitytoolkit.googleapis.com') ||
      path.includes('securetoken.googleapis.com')
    ) {
      return 'auth'
    }

    // Storage routes - must check before firestore to avoid conflicts
    // Storage paths use /storage/v1/b/ or /upload/storage/
    if (path.includes('/storage/v1/b/') || path.includes('/upload/storage/')) {
      return 'storage'
    }

    // Firestore routes - document and database operations
    // Pattern: /v1/projects/:projectId/databases/:databaseId/documents
    if (path.includes('/databases/') && path.includes('/documents')) {
      return 'firestore'
    }

    // Functions routes - callable functions with :call suffix
    // Pattern: /v1/projects/:projectId/locations/:location/functions/:functionName:call
    if (path.includes('/functions/') && path.includes(':call')) {
      return 'functions'
    }

    // Functions routes - HTTP functions
    // Pattern: /:projectId/:region/:functionName
    // Must be exactly 3 path segments with valid characters
    const httpFunctionPattern = /^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-zA-Z0-9_-]+$/
    if (httpFunctionPattern.test(path)) {
      return 'functions'
    }

    return null
  }
}

/**
 * Create a new ServiceRouter instance
 */
export function createRouter(): ServiceRouter {
  return new ServiceRouter()
}

/**
 * Default router instance for convenience
 */
export const defaultRouter = new ServiceRouter()
