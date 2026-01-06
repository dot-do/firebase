/**
 * Firebase Infrastructure Module
 *
 * Re-exports all public APIs from the infra module.
 */

// Router and request handling
export {
  ServiceRouter,
  createRouter,
  defaultRouter,
  type ServiceType,
  type HttpMethod,
  type RouterRequest,
  type RouterResponse,
  type ServiceHandler,
  type IServiceRouter,
} from './router.js'
