import http from 'http'
import {
  handleSignUp,
  handleSignInWithPassword,
  handleLookup,
  handleUpdate,
  handleDelete,
  handleSendOobCode,
  type SignUpRequest,
  type SignInWithPasswordRequest,
  type LookupRequest,
  type UpdateRequest,
  type DeleteRequest,
  type SendOobCodeRequest,
  type IdentityToolkitError,
} from './identity-toolkit.js'

const PORT = process.env.FIREBASE_AUTH_EMULATOR_PORT || 9099
const MAX_BODY_SIZE = 1048576 // 1MB

function createError(message: string, code: number = 400): IdentityToolkitError {
  return {
    error: {
      code,
      message,
      errors: [
        {
          message,
          domain: 'global',
          reason: 'invalid',
        },
      ],
    },
  }
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error('PAYLOAD_TOO_LARGE'))
        return
      }
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendResponse(
  res: http.ServerResponse,
  data: any,
  statusCode: number = 200
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const pathname = url.pathname

  // Extract API key from query string
  const apiKey = url.searchParams.get('key')

  // Basic API key validation (accept any key for emulator, but require it to be present)
  if (!apiKey && !pathname.includes('OPTIONS')) {
    sendResponse(res, createError('MISSING_API_KEY'), 400)
    return
  }

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req)

      // Route to appropriate handler based on endpoint
      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:signUp')) {
        const result = await handleSignUp(body as SignUpRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }

      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword')) {
        const result = await handleSignInWithPassword(body as SignInWithPasswordRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }

      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:lookup')) {
        const result = await handleLookup(body as LookupRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }

      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:update')) {
        const result = await handleUpdate(body as UpdateRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }

      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:delete')) {
        const result = await handleDelete(body as DeleteRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }

      if (pathname.includes('/identitytoolkit.googleapis.com/v1/accounts:sendOobCode')) {
        const result = await handleSendOobCode(body as SendOobCodeRequest)
        const statusCode = 'error' in result ? 400 : 200
        sendResponse(res, result, statusCode)
        return
      }
    }

    // Not found
    sendResponse(
      res,
      {
        error: {
          code: 404,
          message: 'Not Found',
        },
      },
      404
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
      sendResponse(
        res,
        {
          error: {
            code: 413,
            message: 'Payload Too Large',
          },
        },
        413
      )
      return
    }
    console.error('Error handling request:', error)
    sendResponse(
      res,
      {
        error: {
          code: 500,
          message: 'Internal Server Error',
        },
      },
      500
    )
  }
}

let server: http.Server | null = null

export function startEmulator(port: number = Number(PORT)): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error('Emulator is already running'))
      return
    }

    server = http.createServer(handleRequest)

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} is already in use, assuming emulator is already running`)
        server = null
        resolve()
      } else {
        reject(error)
      }
    })

    server.listen(port, () => {
      console.log(`Firebase Auth Emulator running on http://localhost:${port}`)
      resolve()
    })
  })
}

export function stopEmulator(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve()
      return
    }

    server.close((err) => {
      server = null
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

// Start emulator if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startEmulator().catch(console.error)
}
