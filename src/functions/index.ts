/**
 * Firebase Functions Module
 *
 * Re-exports all public APIs from the functions module.
 */

// Callable function protocol
export {
  handleCallable,
  registerFunction,
  clearFunctions,
  CallableError,
  type CallableRequest,
  type CallableResponse,
  type CallableContext,
  type CallableFunction,
} from './callable.js'

// Test function implementations
export {
  testFunction,
  echoFunction,
  errorFunction,
  authFunction,
  publicFunction,
  slowFunction,
} from './test-functions.js'
