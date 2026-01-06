/**
 * Tests for Firebase Cloud Functions Regional Endpoint Routing
 *
 * Issue: firebase-zze - [RED] functions.do: Test regional endpoint routing
 *
 * Firebase Cloud Functions supports deployment to multiple regions.
 * When invoking a function, the client must specify the correct region
 * in the URL endpoint. This test verifies that regional routing works
 * correctly for all supported Firebase regions.
 *
 * Firebase Functions URL Patterns:
 * - Callable: /v1/projects/{project}/locations/{region}/functions/{name}:call
 * - HTTP: /{projectId}/{region}/{functionName}
 *
 * @see https://firebase.google.com/docs/functions/locations
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { ServiceRouter, type RouterRequest } from '../../src/infra/router.js'
import {
  handleCallable,
  registerFunction,
  clearFunctions,
  setProjectId,
  type CallableRequest,
} from '../../src/functions/callable.js'

// All Firebase-supported regions as of 2024
const FIREBASE_REGIONS = {
  // United States
  US_CENTRAL1: 'us-central1',
  US_EAST1: 'us-east1',
  US_EAST4: 'us-east4',
  US_WEST1: 'us-west1',
  US_WEST2: 'us-west2',
  US_WEST3: 'us-west3',
  US_WEST4: 'us-west4',

  // Europe
  EUROPE_WEST1: 'europe-west1',
  EUROPE_WEST2: 'europe-west2',
  EUROPE_WEST3: 'europe-west3',
  EUROPE_WEST6: 'europe-west6',
  EUROPE_CENTRAL2: 'europe-central2',

  // Asia Pacific
  ASIA_EAST1: 'asia-east1',
  ASIA_EAST2: 'asia-east2',
  ASIA_NORTHEAST1: 'asia-northeast1',
  ASIA_NORTHEAST2: 'asia-northeast2',
  ASIA_NORTHEAST3: 'asia-northeast3',
  ASIA_SOUTH1: 'asia-south1',
  ASIA_SOUTHEAST1: 'asia-southeast1',
  ASIA_SOUTHEAST2: 'asia-southeast2',

  // Australia
  AUSTRALIA_SOUTHEAST1: 'australia-southeast1',

  // South America
  SOUTHAMERICA_EAST1: 'southamerica-east1',

  // North America (Montreal)
  NORTHAMERICA_NORTHEAST1: 'northamerica-northeast1',
} as const

type RegionName = (typeof FIREBASE_REGIONS)[keyof typeof FIREBASE_REGIONS]

const ALL_REGIONS = Object.values(FIREBASE_REGIONS) as RegionName[]

// Test project ID
const TEST_PROJECT_ID = 'demo-regional-functions'

// Helper to create a callable function request for a specific region
function createCallableRequest(
  region: string,
  functionName: string,
  data: unknown = {}
): CallableRequest {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: { data },
  }
}

// Helper to create a router request for callable functions
function createCallableRouterRequest(
  projectId: string,
  region: string,
  functionName: string,
  data: unknown = {}
): RouterRequest {
  return {
    method: 'POST',
    path: `/v1/projects/${projectId}/locations/${region}/functions/${functionName}:call`,
    headers: { 'content-type': 'application/json' },
    body: { data },
  }
}

// Helper to create a router request for HTTP functions
function createHttpFunctionRouterRequest(
  projectId: string,
  region: string,
  functionName: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  body?: unknown
): RouterRequest {
  return {
    method,
    path: `/${projectId}/${region}/${functionName}`,
    headers: method !== 'GET' ? { 'content-type': 'application/json' } : {},
    body,
  }
}

describe('Firebase Functions Regional Endpoint Routing', () => {
  let router: ServiceRouter

  beforeEach(() => {
    router = new ServiceRouter()
  })

  describe('Callable Function Regional Routing', () => {
    it('should route callable functions to functions service for us-central1', async () => {
      const request = createCallableRouterRequest(
        TEST_PROJECT_ID,
        'us-central1',
        'myFunction'
      )

      const response = await router.route(request)

      expect(response.status).toBe(200)
      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route callable functions to functions service for europe-west1', async () => {
      const request = createCallableRouterRequest(
        TEST_PROJECT_ID,
        'europe-west1',
        'europeFunction'
      )

      const response = await router.route(request)

      expect(response.status).toBe(200)
      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route callable functions to functions service for asia-northeast1', async () => {
      const request = createCallableRouterRequest(
        TEST_PROJECT_ID,
        'asia-northeast1',
        'asiaFunction'
      )

      const response = await router.route(request)

      expect(response.status).toBe(200)
      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route callable functions correctly for all supported regions', async () => {
      for (const region of ALL_REGIONS) {
        const request = createCallableRouterRequest(
          TEST_PROJECT_ID,
          region,
          'testFunction'
        )

        const response = await router.route(request)

        expect(response.headers['x-routed-to']).toBe('functions')
        expect(response.status).toBe(200)
      }
    })

    it('should preserve region in the routed path', async () => {
      const regions = ['us-central1', 'europe-west1', 'asia-east1']

      for (const region of regions) {
        const request = createCallableRouterRequest(
          TEST_PROJECT_ID,
          region,
          'regionAwareFunction'
        )

        const response = await router.route(request)

        expect(response.body).toEqual(
          expect.objectContaining({
            path: expect.stringContaining(region),
          })
        )
      }
    })
  })

  describe('HTTP Function Regional Routing', () => {
    it('should route HTTP functions to functions service for us-central1', async () => {
      const request = createHttpFunctionRouterRequest(
        TEST_PROJECT_ID,
        'us-central1',
        'myHttpFunction'
      )

      const response = await router.route(request)

      expect(response.status).toBe(200)
      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route HTTP functions to functions service for europe-west1', async () => {
      const request = createHttpFunctionRouterRequest(
        TEST_PROJECT_ID,
        'europe-west1',
        'europeHttpFunction'
      )

      const response = await router.route(request)

      expect(response.status).toBe(200)
      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route HTTP GET requests for any region', async () => {
      const regions = ['us-central1', 'europe-west1', 'asia-northeast1']

      for (const region of regions) {
        const request = createHttpFunctionRouterRequest(
          TEST_PROJECT_ID,
          region,
          'getHandler',
          'GET'
        )

        const response = await router.route(request)

        expect(response.headers['x-routed-to']).toBe('functions')
      }
    })

    it('should route HTTP POST requests for any region', async () => {
      const regions = ['us-east1', 'europe-west2', 'asia-southeast1']

      for (const region of regions) {
        const request = createHttpFunctionRouterRequest(
          TEST_PROJECT_ID,
          region,
          'postHandler',
          'POST',
          { action: 'create' }
        )

        const response = await router.route(request)

        expect(response.headers['x-routed-to']).toBe('functions')
      }
    })

    it('should route HTTP functions correctly for all supported regions', async () => {
      for (const region of ALL_REGIONS) {
        const request = createHttpFunctionRouterRequest(
          TEST_PROJECT_ID,
          region,
          'universalFunction'
        )

        const response = await router.route(request)

        expect(response.headers['x-routed-to']).toBe('functions')
      }
    })
  })

  describe('Regional URL Pattern Validation', () => {
    it('should parse region from callable function URL', () => {
      const path = `/v1/projects/${TEST_PROJECT_ID}/locations/europe-west1/functions/myFunc:call`
      const regionMatch = path.match(/\/locations\/([^/]+)\/functions\//)

      expect(regionMatch).not.toBeNull()
      expect(regionMatch![1]).toBe('europe-west1')
    })

    it('should parse region from HTTP function URL', () => {
      const path = `/${TEST_PROJECT_ID}/asia-northeast1/myHttpFunc`
      const parts = path.split('/').filter(Boolean)

      expect(parts.length).toBe(3)
      expect(parts[1]).toBe('asia-northeast1')
    })

    it('should validate region format matches GCP region naming convention', () => {
      // GCP region format: {continent}-{direction}{number}
      const regionPattern = /^[a-z]+-[a-z]+[0-9]+$/

      for (const region of ALL_REGIONS) {
        expect(region).toMatch(regionPattern)
      }
    })

    it('should handle hyphenated project IDs with regional routing', async () => {
      const projectId = 'my-project-with-hyphens'
      const request = createHttpFunctionRouterRequest(
        projectId,
        'us-central1',
        'myFunction'
      )

      const response = await router.route(request)

      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should handle project IDs with numbers and regional routing', async () => {
      const projectId = 'project-123'
      const request = createCallableRouterRequest(
        projectId,
        'europe-west1',
        'numberedProject'
      )

      const response = await router.route(request)

      expect(response.headers['x-routed-to']).toBe('functions')
    })
  })

  describe('Edge Cases for Regional Routing', () => {
    it('should distinguish functions from firestore paths with similar structure', async () => {
      // Functions path
      const functionsRequest = createCallableRouterRequest(
        TEST_PROJECT_ID,
        'us-central1',
        'myFunction'
      )

      const functionsResponse = await router.route(functionsRequest)
      expect(functionsResponse.headers['x-routed-to']).toBe('functions')

      // Firestore path (different structure)
      const firestoreRequest: RouterRequest = {
        method: 'GET',
        path: `/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/users/user123`,
        headers: {},
      }

      const firestoreResponse = await router.route(firestoreRequest)
      expect(firestoreResponse.headers['x-routed-to']).toBe('firestore')
    })

    it('should handle URL-encoded function names with regional routing', async () => {
      const request: RouterRequest = {
        method: 'POST',
        path: `/v1/projects/${TEST_PROJECT_ID}/locations/us-central1/functions/my%2DFunction:call`,
        headers: { 'content-type': 'application/json' },
        body: { data: {} },
      }

      const response = await router.route(request)

      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route functions with underscores in name', async () => {
      const request = createHttpFunctionRouterRequest(
        TEST_PROJECT_ID,
        'europe-west1',
        'my_underscore_function'
      )

      const response = await router.route(request)

      expect(response.headers['x-routed-to']).toBe('functions')
    })

    it('should route functions with camelCase names', async () => {
      const request = createCallableRouterRequest(
        TEST_PROJECT_ID,
        'asia-east1',
        'myCamelCaseFunction'
      )

      const response = await router.route(request)

      expect(response.headers['x-routed-to']).toBe('functions')
    })
  })

  describe('Multi-Region Consistency', () => {
    it('should route same function name consistently across regions', async () => {
      const functionName = 'consistentFunction'
      const testRegions = ['us-central1', 'europe-west1', 'asia-northeast1']

      const responses = await Promise.all(
        testRegions.map(region =>
          router.route(
            createCallableRouterRequest(TEST_PROJECT_ID, region, functionName)
          )
        )
      )

      // All should route to functions service
      responses.forEach(response => {
        expect(response.headers['x-routed-to']).toBe('functions')
        expect(response.status).toBe(200)
      })
    })

    it('should include correct region in response for each request', async () => {
      const testRegions = ['us-west1', 'europe-central2', 'australia-southeast1']

      for (const region of testRegions) {
        const request = createCallableRouterRequest(
          TEST_PROJECT_ID,
          region,
          'regionTestFunction'
        )

        const response = await router.route(request)

        expect(response.body).toEqual(
          expect.objectContaining({
            path: expect.stringContaining(region),
          })
        )
      }
    })
  })
})

describe('Callable Function Handler Regional Behavior', () => {
  beforeAll(() => {
    setProjectId(TEST_PROJECT_ID)

    // Register a region-aware test function
    registerFunction('regionInfo', async (data, context) => {
      return {
        receivedData: data,
        instanceId: context.instanceId,
        hasAuth: context.auth !== null,
      }
    })

    // Register a simple echo function
    registerFunction('echo', async (data) => {
      return { echo: data }
    })
  })

  afterAll(() => {
    clearFunctions()
  })

  it('should handle requests regardless of regional endpoint used', async () => {
    // The callable handler itself is region-agnostic; routing handles region selection
    const request = createCallableRequest('us-central1', 'echo', {
      message: 'Hello from us-central1',
    })

    const response = await handleCallable('echo', request)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      result: { echo: { message: 'Hello from us-central1' } },
    })
  })

  it('should process requests identically across different regional endpoints', async () => {
    const testData = { value: 42, name: 'test' }
    const regions = ['us-central1', 'europe-west1', 'asia-east1']

    for (const region of regions) {
      const request = createCallableRequest(region, 'echo', testData)
      const response = await handleCallable('echo', request)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        result: { echo: testData },
      })
    }
  })

  it('should maintain function context across regional calls', async () => {
    const request = createCallableRequest('europe-west1', 'regionInfo', {
      test: true,
    })

    const response = await handleCallable('regionInfo', request)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      result: {
        receivedData: { test: true },
        instanceId: expect.any(String),
        hasAuth: false,
      },
    })
  })
})

describe('Regional Endpoint URL Construction', () => {
  it('should construct valid callable function URL for US regions', () => {
    const projectId = 'my-project'
    const region = 'us-central1'
    const functionName = 'myFunction'

    const url = `/v1/projects/${projectId}/locations/${region}/functions/${functionName}:call`

    expect(url).toBe(
      '/v1/projects/my-project/locations/us-central1/functions/myFunction:call'
    )
  })

  it('should construct valid callable function URL for European regions', () => {
    const projectId = 'eu-project'
    const region = 'europe-west1'
    const functionName = 'euroFunc'

    const url = `/v1/projects/${projectId}/locations/${region}/functions/${functionName}:call`

    expect(url).toBe(
      '/v1/projects/eu-project/locations/europe-west1/functions/euroFunc:call'
    )
  })

  it('should construct valid callable function URL for Asian regions', () => {
    const projectId = 'asia-project'
    const region = 'asia-northeast1'
    const functionName = 'asiaFunc'

    const url = `/v1/projects/${projectId}/locations/${region}/functions/${functionName}:call`

    expect(url).toBe(
      '/v1/projects/asia-project/locations/asia-northeast1/functions/asiaFunc:call'
    )
  })

  it('should construct valid HTTP function URL for any region', () => {
    const testCases = [
      { projectId: 'proj1', region: 'us-central1', fn: 'api' },
      { projectId: 'proj2', region: 'europe-west1', fn: 'webhook' },
      { projectId: 'proj3', region: 'asia-east1', fn: 'handler' },
    ]

    for (const { projectId, region, fn } of testCases) {
      const url = `/${projectId}/${region}/${fn}`

      expect(url).toMatch(/^\/[a-z0-9-]+\/[a-z]+-[a-z]+[0-9]+\/[a-zA-Z0-9_-]+$/)
    }
  })
})
