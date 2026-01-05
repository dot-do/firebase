# firebase.do

**Firebase API-Compatible Backend** — A 100% Firebase-compatible backend that runs anywhere, with full support for Authentication, Firestore, Storage, Functions, and Security Rules.

[![npm version](https://img.shields.io/npm/v/firebase.do.svg)](https://www.npmjs.com/package/firebase.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Why firebase.do?

Firebase is powerful, but lock-in is real. firebase.do gives you the complete Firebase API without the vendor dependency:

- **100% API Compatible** — Drop-in replacement for Firebase SDK, no code changes required
- **Run Anywhere** — Deploy to any Node.js environment, Cloudflare Workers, or your own infrastructure
- **Full Emulation** — Complete local development without network calls or Firebase project setup
- **Security Rules Engine** — Parse and evaluate Firebase Security Rules with full expression support
- **Open Source** — MIT licensed, audit the code, contribute improvements, own your stack

```typescript
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

// Point to firebase.do instead of Firebase
const app = initializeApp({
  apiKey: 'your-api-key',
  projectId: 'my-project',
})

const auth = getAuth(app)
connectAuthEmulator(auth, 'http://localhost:9099')

// Everything works exactly like Firebase
const db = getFirestore(app)
await setDoc(doc(db, 'users', 'alice'), { name: 'Alice', role: 'admin' })
const user = await getDoc(doc(db, 'users', 'alice'))
```

---

## Features

### Authentication

| Feature | Description |
|---------|-------------|
| **Email/Password Auth** | `signUp`, `signInWithPassword`, password validation and hashing |
| **User Management** | `lookup`, `update`, `delete` users with full Identity Toolkit API |
| **JWT Tokens** | Generate and verify Firebase-compatible ID tokens with key rotation |
| **OOB Codes** | Password reset, email verification via `sendOobCode` |
| **Emulator Server** | HTTP server compatible with Firebase Auth Emulator protocol |

### Firestore

| Feature | Description |
|---------|-------------|
| **CRUD Operations** | `getDocument`, `updateDocument`, `deleteDocument` with preconditions |
| **Structured Queries** | Full query translation with filters, ordering, pagination, and projections |
| **Real-time Watches** | `watchDocument`, `watchQuery` with snapshot callbacks |
| **Batch Operations** | `batchGet`, `commit`, transactions with `beginTransaction`/`rollback` |
| **Field Transforms** | Server timestamps, array unions, increments via `DocumentTransform` |
| **Value Encoding** | Complete Firestore value types: GeoPoint, Timestamp, Reference, Bytes |

### Storage

| Feature | Description |
|---------|-------------|
| **Object Operations** | `uploadObject`, `downloadObject`, `deleteObject`, `copyObject` |
| **Metadata Management** | `getMetadata`, `updateMetadata`, custom metadata support |
| **Resumable Uploads** | Chunked uploads with `initiateResumableUpload`, `resumeUpload`, `completeUpload` |
| **Content Detection** | Automatic MIME type detection via `detectContentType` |
| **Download URLs** | Generate signed download URLs with `getDownloadUrl` |

### Cloud Functions

| Feature | Description |
|---------|-------------|
| **Callable Functions** | Firebase Callable protocol with `handleCallable` |
| **Context Injection** | Full `CallableContext` with auth, instance ID, raw request |
| **Error Handling** | `CallableError` with Firebase error codes |
| **Function Registry** | `registerFunction`, `clearFunctions` for dynamic function management |

### Security Rules

| Feature | Description |
|---------|-------------|
| **Full Parser** | Parse Firebase Security Rules to AST with error recovery |
| **Expression Evaluator** | Evaluate rules expressions with complete operator support |
| **Path Matching** | Wildcard patterns, collection groups, variable extraction |
| **Built-in Functions** | `get()`, `exists()`, string `matches()`, list `hasAny()`/`hasAll()` |
| **Type System** | Rules types: Path, Duration, Timestamp, Request, Resource |

---

## Quick Start

### Install

```bash
npm install firebase.do
```

### Start Auth Emulator

```typescript
import { auth } from 'firebase.do'

// Start the auth emulator on port 9099
await auth.startEmulator(9099)

// Create a user
const result = await auth.handleSignUp({
  email: 'alice@example.com',
  password: 'securePassword123',
  returnSecureToken: true,
})

console.log('User created:', result.localId)
console.log('ID Token:', result.idToken)
```

### Start Firestore Server

```typescript
import { firestore } from 'firebase.do'

// Start HTTP server on port 8080
const server = firestore.startServer(8080)

// Server implements Firestore v1 REST API
// GET/PATCH/DELETE /v1/projects/{project}/databases/{db}/documents/{path}
```

### Use with Firebase SDK

```typescript
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth'

const app = initializeApp({ apiKey: 'test-key', projectId: 'test-project' })
const auth = getAuth(app)

// Connect to firebase.do emulator
connectAuthEmulator(auth, 'http://localhost:9099')

// Use Firebase SDK normally
const { user } = await createUserWithEmailAndPassword(auth, 'bob@example.com', 'password123')
console.log('Created user:', user.uid)
```

---

## Examples

### User Authentication Flow

```typescript
import { auth } from 'firebase.do'

// Sign up a new user
const signUpResult = await auth.handleSignUp({
  email: 'alice@example.com',
  password: 'mySecurePassword',
  returnSecureToken: true,
})

// Sign in with password
const signInResult = await auth.handleSignInWithPassword({
  email: 'alice@example.com',
  password: 'mySecurePassword',
  returnSecureToken: true,
})

// Lookup user details
const lookupResult = await auth.handleLookup({
  idToken: signInResult.idToken,
})

// Update user profile
await auth.handleUpdate({
  idToken: signInResult.idToken,
  displayName: 'Alice Smith',
  photoUrl: 'https://example.com/alice.jpg',
})

// Verify a token
const payload = await auth.verifyFirebaseToken(signInResult.idToken)
console.log('Verified user:', payload.uid)
```

### Firestore Document Operations

```typescript
import { firestore } from 'firebase.do'

const projectId = 'my-project'
const databaseId = '(default)'

// Create a document
const doc = firestore.updateDocument(
  `projects/${projectId}/databases/${databaseId}/documents/users/alice`,
  {
    name: { stringValue: 'Alice' },
    age: { integerValue: '30' },
    verified: { booleanValue: true },
    tags: {
      arrayValue: {
        values: [
          { stringValue: 'admin' },
          { stringValue: 'moderator' },
        ],
      },
    },
  }
)

// Get a document with field mask
const retrieved = firestore.getDocument(
  `projects/${projectId}/databases/${databaseId}/documents/users/alice`,
  { mask: ['name', 'verified'] }
)

// Delete with precondition
firestore.deleteDocument(
  `projects/${projectId}/databases/${databaseId}/documents/users/alice`,
  { currentDocument: { exists: true } }
)
```

### Real-time Document Watching

```typescript
import { firestore } from 'firebase.do'

// Watch a single document
const unsubscribe = firestore.watchDocument(
  { path: 'users/alice' },
  (snapshot) => {
    if (snapshot.exists) {
      console.log('Document updated:', snapshot.data)
    } else {
      console.log('Document deleted')
    }
  },
  { includeMetadataChanges: true }
)

// Watch a query
const unsubscribeQuery = firestore.watchQuery(
  {
    collection: 'orders',
    where: [{ field: 'status', op: '==', value: 'pending' }],
    orderBy: [{ field: 'createdAt', direction: 'desc' }],
    limit: 10,
  },
  (snapshot) => {
    console.log(`${snapshot.size} pending orders`)
    snapshot.docChanges.forEach((change) => {
      console.log(`${change.type}: ${change.doc.id}`)
    })
  }
)

// Later: stop watching
unsubscribe()
unsubscribeQuery()
```

### Security Rules Evaluation

```typescript
import { rules } from 'firebase.do'

// Parse security rules
const rulesSource = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.title.size() <= 100;
    }
  }
}
`

const ast = rules.parseRules(rulesSource)

// Create an evaluator
const evaluator = rules.createEvaluator()

// Evaluate an expression
const context = {
  request: {
    auth: { uid: 'user123', token: { email: 'user@example.com' } },
    resource: { data: { title: 'My Post' } },
    method: 'create',
    path: '/databases/default/documents/posts/post1',
    time: new Date(),
  },
  resource: null,
  database: 'default',
}

const canCreate = evaluator.evaluate(
  'request.auth != null && request.resource.data.title.size() <= 100',
  context
)
console.log('Can create post:', canCreate) // true
```

### Storage Operations

```typescript
import { storage } from 'firebase.do'

// Upload a file
const metadata = await storage.uploadObject(
  'images/photo.jpg',
  imageBuffer,
  {
    contentType: 'image/jpeg',
    customMetadata: { uploadedBy: 'user123' },
  }
)

// Get download URL
const url = await storage.getDownloadUrl('images/photo.jpg')

// Resumable upload for large files
const { uploadUri } = await storage.initiateResumableUpload(
  'videos/large-video.mp4',
  {
    contentType: 'video/mp4',
    size: totalSize,
  }
)

// Upload in chunks
let offset = 0
while (offset < totalSize) {
  const chunk = videoData.slice(offset, offset + storage.DEFAULT_CHUNK_SIZE)
  const result = await storage.resumeUpload(uploadUri, chunk, {
    offset,
    totalSize,
  })
  offset = result.offset
}

// Complete the upload
await storage.completeUpload(uploadUri)
```

### Callable Functions

```typescript
import { functions } from 'firebase.do'

// Register a callable function
functions.registerFunction('addMessage', async (data, context) => {
  if (!context.auth) {
    throw new functions.CallableError('unauthenticated', 'Must be logged in')
  }

  const { text, roomId } = data

  // Add message to database...
  const messageId = await saveMessage(roomId, {
    text,
    authorId: context.auth.uid,
    createdAt: new Date(),
  })

  return { messageId }
})

// Handle incoming request
const response = await functions.handleCallable('addMessage', {
  data: { text: 'Hello!', roomId: 'room123' },
  auth: { uid: 'user123', token: {} },
})
```

### Path Matching for Rules

```typescript
import { rules } from 'firebase.do'

// Simple matching
const result = rules.matchPath('/users/{userId}', '/users/alice')
// { matches: true, wildcards: { userId: 'alice' } }

// Nested paths
const result2 = rules.matchPath(
  '/users/{userId}/posts/{postId}',
  '/users/alice/posts/post123'
)
// { matches: true, wildcards: { userId: 'alice', postId: 'post123' } }

// Recursive wildcard
const result3 = rules.matchPath(
  '/files/{path=**}',
  '/files/documents/reports/2024/q1.pdf'
)
// { matches: true, wildcards: { path: 'documents/reports/2024/q1.pdf' } }

// Extract wildcard names
const wildcards = rules.getWildcardNames('/users/{userId}/posts/{postId}')
// ['userId', 'postId']
```

---

## Architecture

```
+------------------------------------------------------------------+
|                      Client Applications                          |
+------------------+-------------------+----------------------------+
|   Firebase SDK   |   REST API        |   Direct Module Import     |
|   (Auth/FS/etc)  |   (HTTP Calls)    |   (Programmatic)           |
+------------------+---------+---------+----------------------------+
                             |
+----------------------------v---------------------------------+
|                       firebase.do                            |
+--------------------------------------------------------------+
|                                                              |
|  +----------+  +------------+  +-----------+  +-----------+  |
|  |   Auth   |  |  Firestore |  |  Storage  |  | Functions |  |
|  +----------+  +------------+  +-----------+  +-----------+  |
|  | Identity |  | Document   |  | Object    |  | Callable  |  |
|  | Toolkit  |  | CRUD       |  | CRUD      |  | Protocol  |  |
|  | JWT/Keys |  | Queries    |  | Resumable |  | Context   |  |
|  | Users    |  | Watch      |  | Metadata  |  | Errors    |  |
|  +----------+  +------------+  +-----------+  +-----------+  |
|                                                              |
|  +----------------------------------------------------------+|
|  |                    Security Rules                         ||
|  +----------------------------------------------------------+|
|  | Parser -> AST -> Evaluator -> Path Matcher -> Built-ins  ||
|  +----------------------------------------------------------+|
|                                                              |
+--------------------------------------------------------------+
```

firebase.do implements the complete Firebase API surface:

1. **Identity Toolkit API** — Full Auth emulator with JWT generation/verification
2. **Firestore REST API v1** — Document operations, queries, real-time watches
3. **Storage API** — Object storage with resumable uploads and signed URLs
4. **Callable Protocol** — Cloud Functions callable format with auth context
5. **Security Rules Engine** — Parse and evaluate Firestore/Storage security rules

---

## API Reference

### Auth Module

```typescript
import { auth } from 'firebase.do'

// Emulator lifecycle
auth.startEmulator(port?: number): Promise<void>
auth.stopEmulator(): Promise<void>

// Identity Toolkit handlers
auth.handleSignUp(request: SignUpRequest): Promise<SignUpResponse>
auth.handleSignInWithPassword(request: SignInWithPasswordRequest): Promise<SignInWithPasswordResponse>
auth.handleLookup(request: LookupRequest): Promise<LookupResponse>
auth.handleUpdate(request: UpdateRequest): Promise<UpdateResponse>
auth.handleDelete(request: DeleteRequest): Promise<DeleteResponse>
auth.handleSendOobCode(request: SendOobCodeRequest): Promise<SendOobCodeResponse>

// JWT operations
auth.generateFirebaseToken(options: GenerateTokenOptions): Promise<string>
auth.verifyFirebaseToken(token: string): Promise<VerifiedTokenPayload>
auth.rotateSigningKey(): Promise<void>

// User management
auth.createUser(email: string, password: string): Promise<UserRecord>
auth.getUserById(uid: string): UserRecord | undefined
auth.getUserByEmail(email: string): UserRecord | undefined
auth.updateUser(uid: string, updates: Partial<UserRecord>): UserRecord
auth.deleteUser(uid: string): boolean
```

### Firestore Module

```typescript
import { firestore } from 'firebase.do'

// Server lifecycle
firestore.startServer(port?: number): Server
firestore.stopServer(server: Server): Promise<void>

// CRUD operations
firestore.getDocument(path: string, options?: GetDocumentOptions): Document | null
firestore.updateDocument(path: string, fields: Fields, options?: UpdateDocumentOptions): Document
firestore.deleteDocument(path: string, options?: DeleteDocumentOptions): boolean

// Query operations
firestore.runQuery(query: StructuredQuery): QueryResult
firestore.translateStructuredQuery(query: StructuredQuery): MongoQuery

// Batch operations
firestore.batchGet(request: BatchGetRequest): BatchGetResponse
firestore.commit(request: CommitRequest): CommitResponse
firestore.beginTransaction(request: BeginTransactionRequest): BeginTransactionResponse
firestore.rollback(request: RollbackRequest): void

// Real-time
firestore.watchDocument(spec: QuerySpec, callback: DocumentSnapshotCallback): Unsubscribe
firestore.watchQuery(spec: QuerySpec, callback: QuerySnapshotCallback): Unsubscribe

// Value encoding
firestore.encodeValue(value: EncodableValue, options?: EncodeOptions): Value
firestore.decodeValue(value: Value, options?: DecodeOptions): unknown
```

### Storage Module

```typescript
import { storage } from 'firebase.do'

// Object operations
storage.uploadObject(path: string, data: Buffer, options?: UploadOptions): Promise<ObjectMetadata>
storage.downloadObject(path: string, options?: DownloadOptions): Promise<DownloadResult>
storage.deleteObject(path: string, options?: DeleteOptions): Promise<void>
storage.copyObject(source: string, destination: string, options?: CopyOptions): Promise<ObjectMetadata>
storage.getMetadata(path: string): Promise<ObjectMetadata>
storage.updateMetadata(path: string, metadata: UpdateMetadataOptions): Promise<ObjectMetadata>
storage.listObjects(prefix: string, options?: ListOptions): Promise<ListResult>
storage.getDownloadUrl(path: string): Promise<string>

// Resumable uploads
storage.initiateResumableUpload(path: string, options: InitiateUploadOptions): Promise<InitiateUploadResult>
storage.resumeUpload(uploadUri: string, chunk: Buffer, options: ResumeUploadOptions): Promise<ResumeUploadResult>
storage.getUploadStatus(uploadUri: string): Promise<UploadStatus>
storage.completeUpload(uploadUri: string, options?: CompleteUploadOptions): Promise<CompletedUploadMetadata>
storage.cancelUpload(uploadUri: string, options?: CancelUploadOptions): Promise<void>
```

### Rules Module

```typescript
import { rules } from 'firebase.do'

// Parsing
rules.parseRules(source: string, options?: ParseOptions): RulesAST
rules.parseRulesWithRecovery(source: string): ParseResult
rules.validateRulesSyntax(source: string): { valid: boolean; errors: ParseError[] }
rules.stringifyRules(ast: RulesAST): string

// Evaluation
rules.createEvaluator(): RulesEvaluator
evaluator.evaluate(expression: string, context: EvaluatorContext): unknown

// Path matching
rules.matchPath(pattern: string, path: string): PathMatchResult | null
rules.matchCollectionGroup(group: string, path: string): boolean
rules.extractWildcards(pattern: string): string[]
rules.getWildcardNames(pattern: string): string[]
rules.hasWildcards(pattern: string): boolean
rules.isValidPattern(pattern: string): boolean

// Built-in types
rules.createPath(segments: string[]): RulesPath
rules.createRulesTimestamp(date: Date): RulesTimestamp
rules.createRulesDuration(ms: number): RulesDuration
rules.createRulesRequest(request: RequestContext): RulesRequest
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_AUTH_EMULATOR_PORT` | `9099` | Port for Auth emulator HTTP server |
| `FIRESTORE_EMULATOR_PORT` | `8080` | Port for Firestore REST API server |

### Programmatic Configuration

```typescript
import { auth, firestore } from 'firebase.do'

// Start services on custom ports
await auth.startEmulator(9199)
const firestoreServer = firestore.startServer(9299)

// Stop services when done
await auth.stopEmulator()
await firestore.stopServer(firestoreServer)
```

---

## API Compatibility

### Auth (Identity Toolkit API)

| Endpoint | Status |
|----------|--------|
| `accounts:signUp` | Implemented |
| `accounts:signInWithPassword` | Implemented |
| `accounts:lookup` | Implemented |
| `accounts:update` | Implemented |
| `accounts:delete` | Implemented |
| `accounts:sendOobCode` | Implemented |

### Firestore (REST API v1)

| Operation | Status |
|-----------|--------|
| Get document | Implemented |
| Create/Update document | Implemented |
| Delete document | Implemented |
| Batch write | Implemented |
| Run query | Implemented |
| Watch/Listen | Implemented |
| Transactions | Implemented |

### Storage

| Operation | Status |
|-----------|--------|
| Upload object | Implemented |
| Resumable upload | Implemented |
| Download object | Implemented |
| Delete object | Implemented |
| Get/Update metadata | Implemented |
| List objects | Implemented |
| Copy object | Implemented |
| Download URLs | Implemented |

---

## Development

```bash
# Clone the repository
git clone https://github.com/drivly/firebase.do.git
cd firebase.do

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build
npm run build
```

### Project Structure

```
src/
  auth/              # Authentication emulator
    emulator.ts      # HTTP server for Identity Toolkit API
    identity-toolkit.ts  # Request handlers
    jwt.ts           # Token generation and verification
    users.ts         # User storage and management
  firestore/         # Firestore emulator
    server.ts        # REST API HTTP server
    crud.ts          # Document CRUD operations
    query.ts         # Structured query translation
    watch.ts         # Real-time subscriptions
    batch.ts         # Batch operations and transactions
    values.ts        # Value encoding/decoding
  storage/           # Cloud Storage emulator
    objects.ts       # Object CRUD operations
    resumable.ts     # Resumable upload protocol
  functions/         # Cloud Functions emulator
    callable.ts      # Callable function protocol
    test-functions.ts  # Example function implementations
  rules/             # Security Rules engine
    parser.ts        # Rules language parser
    evaluator.ts     # Expression evaluator
    path-matcher.ts  # Path pattern matching
    builtins.ts      # Built-in functions and types
  index.ts           # Main entry point
```

---

## Roadmap

### Coming Soon

- **Realtime Database** — Firebase RTDB wire protocol and REST API
- **Cloud Messaging** — FCM message sending and device management
- **Remote Config** — Feature flags and A/B testing
- **Multi-tenant Auth** — Support for multiple tenants
- **OAuth Providers** — Google, Facebook, GitHub sign-in

---

## License

MIT - see [LICENSE](LICENSE)

---

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

---

<p align="center">
  <strong>Firebase API. Your Infrastructure.</strong>
</p>
