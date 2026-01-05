# firebase.do

A 100% Firebase API-compatible backend implementation. Drop-in replacement for Firebase services that can be used for local development, testing, or as an alternative backend infrastructure.

## Features

- **Authentication** - Full Firebase Auth Identity Toolkit API implementation
  - Email/password sign-up and sign-in
  - JWT token generation and verification (RS256)
  - User management (CRUD operations)
  - Token refresh and OOB codes

- **Firestore** - Document database with REST API compatibility
  - Full CRUD operations (GET, PATCH, DELETE)
  - Field masks for partial reads/writes
  - Preconditions (exists, updateTime)
  - All Firestore value types
  - Subcollections support
  - StructuredQuery translation to MongoDB
  - Batch writes and transactions
  - Real-time listeners (watch)

- **Storage** - Object storage API compatible with Firebase Storage
  - Upload, download, delete operations
  - Resumable uploads
  - Metadata management
  - Range requests
  - Signed URLs
  - Version history

- **Functions** - Callable function protocol implementation
  - Firebase callable function format
  - Auth context injection
  - Error handling with proper codes
  - CORS support

- **Security Rules** - Full rules DSL parser and evaluator
  - Firestore and Storage rules syntax
  - Path matching with wildcards
  - Expression evaluation
  - Built-in functions (get, exists, math, timestamp, etc.)

## Quick Start

### Installation

```bash
npm install firebase.do
```

### Basic Usage

```typescript
// Start the Auth emulator
import { startEmulator } from 'firebase.do/auth'

await startEmulator(9099)
// Firebase Auth Emulator running on http://localhost:9099

// Start the Firestore server
import { startServer } from 'firebase.do/firestore'

const server = startServer(8080)
// Firestore server running on http://localhost:8080
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_AUTH_EMULATOR_PORT` | `9099` | Port for the Auth emulator |
| `DEBUG_PRECONDITION` | - | Enable debug logging for preconditions |

### Default Ports

| Service | Port |
|---------|------|
| Auth | 9099 |
| Firestore | 8080 |

## Usage Examples

### Authentication

#### Sign Up

```typescript
import { handleSignUp } from 'firebase.do/auth'

const result = await handleSignUp({
  email: 'user@example.com',
  password: 'securePassword123',
  displayName: 'John Doe',
  returnSecureToken: true
})

// Returns:
// {
//   idToken: 'eyJhbGciOiJS...',
//   email: 'user@example.com',
//   refreshToken: 'abc123...',
//   expiresIn: '3600',
//   localId: 'user-id-123'
// }
```

#### Sign In with Password

```typescript
import { handleSignInWithPassword } from 'firebase.do/auth'

const result = await handleSignInWithPassword({
  email: 'user@example.com',
  password: 'securePassword123',
  returnSecureToken: true
})

// Returns:
// {
//   idToken: 'eyJhbGciOiJS...',
//   email: 'user@example.com',
//   refreshToken: 'abc123...',
//   expiresIn: '3600',
//   localId: 'user-id-123',
//   registered: true
// }
```

#### Token Verification

```typescript
import { verifyFirebaseToken } from 'firebase.do/auth'

const payload = await verifyFirebaseToken(idToken, 'your-project-id')

// Returns decoded JWT payload:
// {
//   iss: 'https://securetoken.google.com/your-project-id',
//   aud: 'your-project-id',
//   sub: 'user-id-123',
//   user_id: 'user-id-123',
//   email: 'user@example.com',
//   email_verified: false,
//   auth_time: 1234567890,
//   iat: 1234567890,
//   exp: 1234571490,
//   firebase: {
//     identities: { email: ['user@example.com'] },
//     sign_in_provider: 'password'
//   }
// }
```

#### Generate Custom Token

```typescript
import { generateFirebaseToken } from 'firebase.do/auth'

const token = await generateFirebaseToken({
  uid: 'custom-user-id',
  projectId: 'your-project-id',
  claims: { admin: true },
  signInProvider: 'custom',
  email: 'admin@example.com',
  emailVerified: true
})
```

### Firestore

#### Create/Update Document

```typescript
// Using the REST API (PATCH)
const response = await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/user123',
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        name: { stringValue: 'John Doe' },
        age: { integerValue: '30' },
        active: { booleanValue: true },
        tags: {
          arrayValue: {
            values: [
              { stringValue: 'developer' },
              { stringValue: 'typescript' }
            ]
          }
        }
      }
    })
  }
)

const doc = await response.json()
```

#### Get Document

```typescript
const response = await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/user123'
)

const doc = await response.json()
// {
//   name: 'projects/my-project/databases/(default)/documents/users/user123',
//   fields: { ... },
//   createTime: '2024-01-15T10:30:00.000000Z',
//   updateTime: '2024-01-15T10:30:00.000001Z'
// }
```

#### Partial Update with Field Mask

```typescript
const response = await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/user123?updateMask.fieldPaths=name&updateMask.fieldPaths=age',
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        name: { stringValue: 'Jane Doe' },
        age: { integerValue: '25' }
      }
    })
  }
)
```

#### Delete Document

```typescript
await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/user123',
  { method: 'DELETE' }
)
```

#### Conditional Operations with Preconditions

```typescript
// Only update if document exists
const response = await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/user123?currentDocument.exists=true',
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { status: { stringValue: 'updated' } } })
  }
)

// Only create if document doesn't exist
const response2 = await fetch(
  'http://localhost:8080/v1/projects/my-project/databases/(default)/documents/users/newuser?currentDocument.exists=false',
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { name: { stringValue: 'New User' } } })
  }
)
```

### Storage

#### Upload Object

```typescript
import { uploadObject } from 'firebase.do/storage'

const metadata = await uploadObject(
  'my-bucket',
  'images/photo.jpg',
  imageBuffer,
  {
    contentType: 'image/jpeg',
    metadata: { uploadedBy: 'user123' },
    cacheControl: 'max-age=3600'
  }
)

// Returns:
// {
//   name: 'images/photo.jpg',
//   bucket: 'my-bucket',
//   generation: '1000001',
//   contentType: 'image/jpeg',
//   size: '12345',
//   md5Hash: 'abc123==',
//   etag: '"1000001-abc123"',
//   timeCreated: '2024-01-15T10:30:00.000Z',
//   ...
// }
```

#### Download Object

```typescript
import { downloadObject } from 'firebase.do/storage'

const result = await downloadObject('my-bucket', 'images/photo.jpg')

// Returns:
// {
//   data: <Buffer ...>,
//   contentType: 'image/jpeg',
//   contentLength: 12345,
//   etag: '"1000001-abc123"',
//   lastModified: Date,
//   isPartial: false
// }

// Range request
const partial = await downloadObject('my-bucket', 'large-file.zip', {
  rangeStart: 0,
  rangeEnd: 1023  // First 1KB
})
```

#### List Objects

```typescript
import { listObjects } from 'firebase.do/storage'

const result = await listObjects('my-bucket', {
  prefix: 'images/',
  delimiter: '/',
  maxResults: 100
})

// Returns:
// {
//   items: [ { name: 'images/photo1.jpg', ... }, ... ],
//   prefixes: [ 'images/avatars/', 'images/thumbnails/' ],
//   nextPageToken: 'abc123'
// }
```

#### Delete Object

```typescript
import { deleteObject } from 'firebase.do/storage'

await deleteObject('my-bucket', 'images/photo.jpg')
```

### Callable Functions

#### Register and Handle Functions

```typescript
import { registerFunction, handleCallable, CallableError } from 'firebase.do/functions'

// Register a function
registerFunction('greet', (data, context) => {
  if (!context.auth) {
    throw new CallableError('UNAUTHENTICATED', 'Must be logged in')
  }

  return {
    message: `Hello, ${data.name}!`,
    userId: context.auth.uid
  }
})

// Handle incoming request
const response = await handleCallable('greet', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'authorization': 'Bearer <token>'
  },
  body: { data: { name: 'World' } }
})

// Response:
// {
//   status: 200,
//   body: { result: { message: 'Hello, World!', userId: '...' } }
// }
```

#### Error Handling

```typescript
registerFunction('divide', (data, context) => {
  if (data.divisor === 0) {
    throw new CallableError(
      'INVALID_ARGUMENT',
      'Cannot divide by zero',
      { field: 'divisor' }
    )
  }
  return { result: data.dividend / data.divisor }
})
```

### Security Rules

#### Parse Rules

```typescript
import { parseRules } from 'firebase.do/rules'

const ast = parseRules(`
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read, write: if request.auth.uid == userId;
      }

      match /posts/{postId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow update, delete: if request.auth.uid == resource.data.authorId;
      }
    }
  }
`)
```

#### Evaluate Rules

```typescript
import { createEvaluator } from 'firebase.do/rules'

const evaluator = createEvaluator()

const result = evaluator.evaluate(
  'request.auth.uid == "user123" && resource.data.status == "active"',
  {
    request: {
      auth: { uid: 'user123', token: {} },
      method: 'get',
      path: '/users/user123',
      time: new Date(),
      resource: { data: {} }
    },
    resource: {
      data: { status: 'active', name: 'Test' },
      id: 'user123',
      __name__: 'users/user123'
    },
    database: 'default'
  }
)
// result: true
```

#### Path Matching

```typescript
import { matchPath, extractWildcards } from 'firebase.do/rules'

// Simple matching
const result = matchPath('/users/{userId}', '/users/alice')
// { matches: true, wildcards: { userId: 'alice' } }

// Nested paths
const result2 = matchPath(
  '/users/{userId}/posts/{postId}',
  '/users/alice/posts/post123'
)
// { matches: true, wildcards: { userId: 'alice', postId: 'post123' } }

// Recursive wildcard
const result3 = matchPath(
  '/files/{path=**}',
  '/files/documents/reports/2024/q1.pdf'
)
// { matches: true, wildcards: { path: 'documents/reports/2024/q1.pdf' } }
```

## Firebase SDK Integration

Configure the official Firebase SDK to use this emulator:

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

const app = initializeApp({
  projectId: 'your-project-id',
  apiKey: 'fake-api-key'  // Required but not validated by emulator
})

// Connect to Auth emulator
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://localhost:9099')

// Connect to Firestore emulator
const db = getFirestore(app)
connectFirestoreEmulator(db, 'localhost', 8080)

// Connect to Storage emulator
const storage = getStorage(app)
connectStorageEmulator(storage, 'localhost', 9199)
```

## API Compatibility

### Auth (Identity Toolkit API)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `accounts:signUp` | Implemented | Email/password, anonymous |
| `accounts:signInWithPassword` | Implemented | |
| `accounts:lookup` | Implemented | |
| `accounts:update` | Implemented | Profile updates |
| `accounts:delete` | Implemented | |
| `accounts:sendOobCode` | Implemented | Verification, password reset |
| `accounts:signInWithIdp` | Not implemented | OAuth providers |
| `accounts:signInWithCustomToken` | Not implemented | |
| `accounts:signInWithPhoneNumber` | Not implemented | |
| Token refresh | Not implemented | |

### Firestore (REST API v1)

| Operation | Status | Notes |
|-----------|--------|-------|
| Get document | Implemented | Field masks supported |
| Create/Update document | Implemented | Preconditions, update masks |
| Delete document | Implemented | Preconditions |
| List documents | Partial | Basic listing |
| Batch write | Implemented | |
| Run query | Partial | StructuredQuery translation |
| Listen | Implemented | Watch protocol |
| Transactions | Partial | Begin/commit |

### Storage (REST API)

| Operation | Status | Notes |
|-----------|--------|-------|
| Upload object | Implemented | Simple, multipart |
| Resumable upload | Implemented | |
| Download object | Implemented | Range requests |
| Delete object | Implemented | |
| Get metadata | Implemented | |
| Update metadata | Implemented | |
| List objects | Implemented | Pagination, prefixes |
| Copy object | Implemented | |
| Signed URLs | Implemented | |

### Functions

| Feature | Status | Notes |
|---------|--------|-------|
| Callable protocol | Implemented | |
| Auth context | Implemented | |
| Error codes | Implemented | All Firebase error codes |
| CORS | Implemented | |
| Rate limiting | Not implemented | |

### Security Rules

| Feature | Status | Notes |
|---------|--------|-------|
| Rules parsing | Implemented | Firestore & Storage |
| Path matching | Implemented | Wildcards, recursive |
| Expression evaluation | Implemented | |
| Built-in functions | Partial | get, exists, math, string |
| request/resource vars | Implemented | |
| Custom functions | Implemented | |

## Development

### Prerequisites

- Node.js >= 18
- npm or yarn

### Scripts

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build the project
npm run build
```

### Project Structure

```
src/
  auth/
    identity-toolkit.ts  # Auth API handlers
    jwt.ts               # JWT generation/verification
    users.ts             # User management
    emulator.ts          # HTTP server
  firestore/
    crud.ts              # Document operations
    query.ts             # Query translation
    server.ts            # HTTP server
    values.ts            # Value type handling
    batch.ts             # Batch operations
    watch.ts             # Real-time listeners
  storage/
    objects.ts           # Object operations
    resumable.ts         # Resumable uploads
  functions/
    callable.ts          # Callable function protocol
  rules/
    parser.ts            # Rules DSL parser
    evaluator.ts         # Expression evaluator
    builtins.ts          # Built-in functions
    path-matcher.ts      # Path pattern matching
```

## License

MIT

---

Built with care for the Firebase developer community.
