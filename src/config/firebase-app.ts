/**
 * FirebaseApp Configuration
 *
 * Provides a configuration system for Firebase services with support for
 * custom endpoints, enabling use with the Firebase emulator suite or
 * alternative Firebase-compatible backends.
 */

import { ConfigError } from '../errors/index.js'

// ============================================================================
// Service Endpoint Types
// ============================================================================

/**
 * Configuration for a single service endpoint
 */
export interface ServiceEndpoint {
  /** Base URL for the service (e.g., "http://localhost:9099") */
  url: string
  /** Optional path prefix (e.g., "/v1" or "/identitytoolkit/v3") */
  pathPrefix?: string
}

/**
 * Custom endpoints for all Firebase services
 */
export interface ServiceEndpoints {
  /** Authentication service endpoint */
  auth?: ServiceEndpoint
  /** Firestore database endpoint */
  firestore?: ServiceEndpoint
  /** Cloud Storage endpoint */
  storage?: ServiceEndpoint
  /** Cloud Functions endpoint */
  functions?: ServiceEndpoint
  /** Realtime Database endpoint */
  database?: ServiceEndpoint
}

// ============================================================================
// FirebaseApp Configuration
// ============================================================================

/**
 * Firebase application configuration options
 */
export interface FirebaseAppConfig {
  /** Firebase project ID (required) */
  projectId: string

  /** Firebase API key (optional, for client SDKs) */
  apiKey?: string

  /** Firebase app ID (optional) */
  appId?: string

  /** Auth domain for Firebase Auth (optional) */
  authDomain?: string

  /** Storage bucket name (optional, defaults to "{projectId}.appspot.com") */
  storageBucket?: string

  /** Messaging sender ID (optional) */
  messagingSenderId?: string

  /** Measurement ID for Analytics (optional) */
  measurementId?: string

  /** Database URL for Realtime Database (optional) */
  databaseURL?: string

  /**
   * Custom service endpoints for connecting to emulators or
   * alternative Firebase-compatible backends
   */
  endpoints?: ServiceEndpoints

  /**
   * Whether to use emulator mode (relaxed security, local endpoints)
   * When true, uses default emulator ports if endpoints not specified
   */
  useEmulator?: boolean

  /**
   * Emulator host (default: "localhost")
   * Used when useEmulator is true and specific endpoints are not set
   */
  emulatorHost?: string
}

/**
 * Default emulator ports for each service
 */
export const DEFAULT_EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
  database: 9000,
} as const

/**
 * Production Firebase service URLs
 */
export const PRODUCTION_ENDPOINTS = {
  auth: {
    url: 'https://identitytoolkit.googleapis.com',
    pathPrefix: '/v1',
  },
  firestore: {
    url: 'https://firestore.googleapis.com',
    pathPrefix: '/v1',
  },
  storage: {
    url: 'https://storage.googleapis.com',
    pathPrefix: '/v0',
  },
  functions: {
    url: 'https://cloudfunctions.googleapis.com',
    pathPrefix: '/v1',
  },
  database: {
    url: '', // Database URL is project-specific: https://{projectId}.firebaseio.com
  },
} as const

// ============================================================================
// FirebaseApp Instance
// ============================================================================

/**
 * Represents an initialized Firebase application
 */
export interface FirebaseApp {
  /** Application name (default: "[DEFAULT]") */
  readonly name: string
  /** Application configuration */
  readonly config: Readonly<FirebaseAppConfig>
  /** Resolved service endpoints */
  readonly endpoints: Readonly<Required<ServiceEndpoints>>
  /** Get the endpoint URL for a specific service */
  getEndpoint(service: keyof ServiceEndpoints): ServiceEndpoint
  /** Check if app is configured for emulator mode */
  isEmulatorMode(): boolean
}

// ============================================================================
// App Registry
// ============================================================================

/**
 * Registry of initialized Firebase apps
 */
const apps = new Map<string, FirebaseApp>()

/**
 * Default app name
 */
const DEFAULT_APP_NAME = '[DEFAULT]'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build emulator endpoint for a service
 */
function buildEmulatorEndpoint(
  host: string,
  service: keyof typeof DEFAULT_EMULATOR_PORTS
): ServiceEndpoint {
  const port = DEFAULT_EMULATOR_PORTS[service]
  return {
    url: `http://${host}:${port}`,
    pathPrefix: service === 'auth' ? '/identitytoolkit/v3' : undefined,
  }
}

/**
 * Build production endpoint for a service
 */
function buildProductionEndpoint(
  service: keyof ServiceEndpoints,
  projectId: string
): ServiceEndpoint {
  if (service === 'database') {
    return {
      url: `https://${projectId}-default-rtdb.firebaseio.com`,
    }
  }
  return { ...PRODUCTION_ENDPOINTS[service] }
}

/**
 * Resolve endpoints based on configuration
 */
function resolveEndpoints(config: FirebaseAppConfig): Required<ServiceEndpoints> {
  const emulatorHost = config.emulatorHost || 'localhost'
  const useEmulator = config.useEmulator || false
  const customEndpoints = config.endpoints || {}

  const services: (keyof ServiceEndpoints)[] = ['auth', 'firestore', 'storage', 'functions', 'database']

  const resolved: ServiceEndpoints = {}

  for (const service of services) {
    if (customEndpoints[service]) {
      // Use custom endpoint if provided
      resolved[service] = customEndpoints[service]
    } else if (useEmulator) {
      // Use emulator endpoint
      resolved[service] = buildEmulatorEndpoint(emulatorHost, service)
    } else {
      // Use production endpoint
      resolved[service] = buildProductionEndpoint(service, config.projectId)
    }
  }

  return resolved as Required<ServiceEndpoints>
}

/**
 * Valid URL protocols for endpoints
 */
const VALID_URL_PROTOCOLS = ['http:', 'https:']

/**
 * Maximum project ID length
 */
const MAX_PROJECT_ID_LENGTH = 30

/**
 * Validate project ID
 */
function validateProjectId(projectId: unknown): void {
  // Check for null/undefined
  if (projectId === null || projectId === undefined) {
    throw new ConfigError('invalid-project-id', 'FirebaseAppConfig: projectId is required')
  }

  // Check type
  if (typeof projectId !== 'string') {
    throw new ConfigError('invalid-project-id', 'FirebaseAppConfig: projectId must be a string')
  }

  // Check empty
  if (projectId === '') {
    throw new ConfigError('invalid-project-id', 'FirebaseAppConfig: projectId is required')
  }

  // Check length
  if (projectId.length > MAX_PROJECT_ID_LENGTH) {
    throw new ConfigError(
      'invalid-project-id',
      `FirebaseAppConfig: projectId must be ${MAX_PROJECT_ID_LENGTH} characters or less`
    )
  }

  // Check format (lowercase letters, numbers, hyphens only)
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    throw new ConfigError(
      'invalid-project-id',
      'FirebaseAppConfig: projectId must contain only lowercase letters, numbers, and hyphens'
    )
  }
}

/**
 * Validate endpoint URL
 */
function validateEndpointUrl(url: unknown, serviceName: string): void {
  // Check for null/undefined
  if (url === null || url === undefined) {
    throw new ConfigError('invalid-endpoint', `FirebaseAppConfig: endpoint URL for ${serviceName} cannot be null or undefined`)
  }

  // Check type
  if (typeof url !== 'string') {
    throw new ConfigError('invalid-endpoint', `FirebaseAppConfig: endpoint URL for ${serviceName} must be a string`)
  }

  // Check empty
  if (url === '') {
    throw new ConfigError('invalid-endpoint', `FirebaseAppConfig: endpoint URL for ${serviceName} cannot be empty`)
  }

  // Check for spaces
  if (/\s/.test(url)) {
    throw new ConfigError('invalid-endpoint', `FirebaseAppConfig: endpoint URL for ${serviceName} cannot contain spaces`)
  }

  // Parse URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new ConfigError('invalid-endpoint', `FirebaseAppConfig: invalid URL for ${serviceName} endpoint: ${url}`)
  }

  // Check protocol
  if (!VALID_URL_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new ConfigError(
      'invalid-endpoint',
      `FirebaseAppConfig: endpoint URL for ${serviceName} must use http or https protocol`
    )
  }
}

/**
 * Validate emulator host
 */
function validateEmulatorHost(host: unknown): void {
  // Check for null/undefined (empty is also invalid)
  if (host === null || host === undefined) {
    throw new ConfigError('invalid-emulator-host', 'FirebaseAppConfig: emulatorHost cannot be null or undefined')
  }

  // Check type
  if (typeof host !== 'string') {
    throw new ConfigError('invalid-emulator-host', 'FirebaseAppConfig: emulatorHost must be a string')
  }

  // Check empty
  if (host === '') {
    throw new ConfigError('invalid-emulator-host', 'FirebaseAppConfig: emulatorHost cannot be empty')
  }

  // Check for protocol prefix (should be just hostname, not URL)
  if (host.includes('://')) {
    throw new ConfigError('invalid-emulator-host', 'FirebaseAppConfig: emulatorHost should be a hostname without protocol (e.g., "localhost")')
  }

  // Check for port (should be just hostname)
  if (/:[\d]+$/.test(host)) {
    throw new ConfigError('invalid-emulator-host', 'FirebaseAppConfig: emulatorHost should be a hostname without port (e.g., "localhost")')
  }
}

/**
 * Validate configuration
 */
function validateConfig(config: FirebaseAppConfig): void {
  // Validate projectId
  validateProjectId(config.projectId)

  // Validate emulatorHost if provided
  if ('emulatorHost' in config && config.emulatorHost !== undefined) {
    validateEmulatorHost(config.emulatorHost)
  }

  // Validate custom endpoints if provided
  if (config.endpoints) {
    for (const [service, endpoint] of Object.entries(config.endpoints)) {
      if (endpoint) {
        // URL is required for endpoints
        if (!('url' in endpoint) || endpoint.url === undefined) {
          throw new ConfigError('missing-required-field', `FirebaseAppConfig: endpoint for ${service} must have a url`)
        }
        validateEndpointUrl(endpoint.url, service)
      }
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize a Firebase application with the given configuration
 *
 * @param config - Firebase application configuration
 * @param name - Optional app name (defaults to "[DEFAULT]")
 * @returns The initialized FirebaseApp instance
 * @throws Error if an app with the same name already exists
 *
 * @example
 * // Initialize with production endpoints
 * const app = initializeApp({
 *   projectId: 'my-project',
 *   apiKey: 'AIza...',
 * })
 *
 * @example
 * // Initialize with emulator mode
 * const app = initializeApp({
 *   projectId: 'my-project',
 *   useEmulator: true,
 * })
 *
 * @example
 * // Initialize with custom endpoints
 * const app = initializeApp({
 *   projectId: 'my-project',
 *   endpoints: {
 *     auth: { url: 'https://auth.firebase.do' },
 *     firestore: { url: 'https://firestore.firebase.do' },
 *     storage: { url: 'https://storage.firebase.do' },
 *   },
 * })
 */
export function initializeApp(
  config: FirebaseAppConfig,
  name: string = DEFAULT_APP_NAME
): FirebaseApp {
  // Check if app already exists
  if (apps.has(name)) {
    throw new ConfigError(
      'already-exists',
      `Firebase: Firebase App named "${name}" already exists. ` +
        `Call deleteApp() first or use a different name.`
    )
  }

  // Validate configuration
  validateConfig(config)

  // Resolve endpoints
  const endpoints = resolveEndpoints(config)

  // Set default storage bucket if not provided
  const resolvedConfig: FirebaseAppConfig = {
    ...config,
    storageBucket: config.storageBucket || `${config.projectId}.appspot.com`,
  }

  // Create the app instance
  const app: FirebaseApp = {
    name,
    config: Object.freeze({ ...resolvedConfig }),
    endpoints: Object.freeze(endpoints),

    getEndpoint(service: keyof ServiceEndpoints): ServiceEndpoint {
      return endpoints[service]
    },

    isEmulatorMode(): boolean {
      return config.useEmulator === true
    },
  }

  // Register the app
  apps.set(name, app)

  return app
}

/**
 * Get an existing Firebase app by name
 *
 * @param name - App name (defaults to "[DEFAULT]")
 * @returns The FirebaseApp instance
 * @throws Error if no app with the given name exists
 */
export function getApp(name: string = DEFAULT_APP_NAME): FirebaseApp {
  const app = apps.get(name)
  if (!app) {
    throw new ConfigError(
      'not-found',
      `Firebase: No Firebase App "${name}" has been created - call initializeApp() first`
    )
  }
  return app
}

/**
 * Get all initialized Firebase apps
 *
 * @returns Array of all FirebaseApp instances
 */
export function getApps(): FirebaseApp[] {
  return Array.from(apps.values())
}

/**
 * Delete a Firebase app
 *
 * @param app - The FirebaseApp to delete
 */
export function deleteApp(app: FirebaseApp): void {
  apps.delete(app.name)
}

/**
 * Clear all registered apps (useful for testing)
 */
export function clearApps(): void {
  apps.clear()
}

/**
 * Build a full URL for a service request
 *
 * @param app - The FirebaseApp instance
 * @param service - The service to build URL for
 * @param path - The API path (without prefix)
 * @returns The full URL
 *
 * @example
 * const url = buildServiceUrl(app, 'auth', '/accounts:signUp')
 * // Returns: "https://identitytoolkit.googleapis.com/v1/accounts:signUp"
 */
export function buildServiceUrl(
  app: FirebaseApp,
  service: keyof ServiceEndpoints,
  path: string
): string {
  const endpoint = app.getEndpoint(service)
  const prefix = endpoint.pathPrefix || ''
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${endpoint.url}${prefix}${cleanPath}`
}

/**
 * Build Firestore document URL
 *
 * @param app - The FirebaseApp instance
 * @param documentPath - Document path (e.g., "users/user123")
 * @returns The full Firestore document URL
 */
export function buildFirestoreUrl(app: FirebaseApp, documentPath: string): string {
  const endpoint = app.getEndpoint('firestore')
  const prefix = endpoint.pathPrefix || ''
  const cleanPath = documentPath.startsWith('/') ? documentPath.slice(1) : documentPath
  return `${endpoint.url}${prefix}/projects/${app.config.projectId}/databases/(default)/documents/${cleanPath}`
}

/**
 * Build Storage object URL
 *
 * @param app - The FirebaseApp instance
 * @param objectPath - Object path in storage
 * @param bucket - Optional bucket name (defaults to app's storageBucket)
 * @returns The full Storage object URL
 */
export function buildStorageUrl(
  app: FirebaseApp,
  objectPath: string,
  bucket?: string
): string {
  const endpoint = app.getEndpoint('storage')
  const prefix = endpoint.pathPrefix || ''
  const bucketName = bucket || app.config.storageBucket || `${app.config.projectId}.appspot.com`
  const cleanPath = objectPath.startsWith('/') ? objectPath.slice(1) : objectPath
  const encodedPath = encodeURIComponent(cleanPath)
  return `${endpoint.url}${prefix}/b/${bucketName}/o/${encodedPath}`
}
