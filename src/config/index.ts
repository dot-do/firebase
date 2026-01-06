/**
 * Firebase Configuration Module
 *
 * Re-exports all public APIs from the config module.
 */

export {
  // Core functions
  initializeApp,
  getApp,
  getApps,
  deleteApp,
  clearApps,
  // URL builders
  buildServiceUrl,
  buildFirestoreUrl,
  buildStorageUrl,
  // Constants
  DEFAULT_EMULATOR_PORTS,
  PRODUCTION_ENDPOINTS,
  // Types
  type ServiceEndpoint,
  type ServiceEndpoints,
  type FirebaseAppConfig,
  type FirebaseApp,
} from './firebase-app.js'
