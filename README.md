# firebase.do

> Real-time Database. Edge-Native. Zero Lock-in. AI-First.

Google Firebase dominates mobile backend development. But the lock-in is brutal - proprietary protocols, opaque pricing, vendor-controlled scaling. Your data lives in Google's house, and moving out costs months of migration work.

**firebase.do** is the open-source alternative. 100% API compatible. Runs on your Cloudflare account. Real-time that actually scales. AI that speaks natural language to your database.

## AI-Native API

```typescript
import { firebase } from 'firebase.do'           // Full SDK
import { firebase } from 'firebase.do/tiny'      // Minimal client
import { firebase } from 'firebase.do/realtime'  // Real-time only
```

Natural language for real-time data:

```typescript
import { firebase } from 'firebase.do'

// Talk to it like a colleague
const online = await firebase`users online now`
const recent = await firebase`messages in chat-123 since yesterday`
const orders = await firebase`pending orders over $100`

// Chain like sentences
await firebase`users in California`
  .notify(`Special offer for West Coast customers`)

// Real-time just works
await firebase`watch users online`.on('join', user => {
  console.log(`${user.name} came online`)
})
```

## The Problem

Firebase dominates mobile backend development:

| What Google Charges | The Reality |
|---------------------|-------------|
| **Firestore Reads** | $0.36/100K (adds up fast at scale) |
| **Realtime DB** | $5/GB stored + bandwidth |
| **Authentication** | Free tier then $0.06/verification |
| **Cloud Functions** | CPU + memory + invocations |
| **Vendor Lock-in** | Proprietary protocols, no exit path |
| **Data Portability** | Export is painful, migration is worse |

### The Lock-in Trap

Firebase makes it easy to start:

- Quick setup, great DX
- Free tier generous enough to hook you
- Then you're stuck:
  - Firestore query language is proprietary
  - Real-time protocol is undocumented
  - Security rules don't transfer
  - Migration requires rewriting everything

### The Scaling Wall

Firebase has hard limits:

- **1 write/second per document** - No hot documents
- **1MB document size** - No rich objects
- **20K concurrent connections** - Per database
- **Complex queries fail** - No joins, limited indexing
- **Cold starts** - Cloud Functions latency spikes

### The Black Box Problem

You can't see inside:

- Opaque pricing (surprise bills are common)
- No query optimization visibility
- Scaling is automatic until it isn't
- Support requires paid plan

## The Solution

**firebase.do** reimagines Firebase for developers:

```
Firebase                            firebase.do
-----------------------------------------------------------------
Google's infrastructure             Your Cloudflare account
Proprietary protocols               Open source, MIT licensed
Opaque pricing                      Predictable costs
1 write/sec/doc limit               No artificial limits
Black box scaling                   Durable Objects (infinite scale)
Vendor lock-in                      Run anywhere
Security rules locked in            Rules work with any backend
```

## One-Click Deploy

```bash
npx create-dotdo firebase
```

A real-time backend. On infrastructure you control. API-compatible from day one.

```typescript
import { Firebase } from 'firebase.do'

export default Firebase({
  name: 'my-app',
  domain: 'api.my-app.com',
  realtime: true,
  auth: { providers: ['email', 'google', 'github'] },
})
```

## Features

### Authentication

```typescript
// Sign up is one line
await firebase`sign up alice@example.com password123`

// Sign in naturally
await firebase`sign in alice@example.com`

// Check who's logged in
await firebase`current user`

// Social auth just works
await firebase`sign in with google`
await firebase`sign in with github`
```

### Firestore

```typescript
// Write documents naturally
await firebase`add user alice: name Alice, role admin`
await firebase`set users/bob to { name: Bob, team: engineering }`

// Query like you're asking a question
await firebase`users where role is admin`
await firebase`orders over $100 from last week`
await firebase`messages in chat-123 limit 50`

// AI infers what you need
await firebase`alice`                    // returns user document
await firebase`alice's orders`           // returns alice's orders
await firebase`alice's last order`       // returns most recent
```

### Real-time Subscriptions

```typescript
// Watch anything
await firebase`watch users online`
  .on('add', user => console.log(`${user.name} joined`))
  .on('remove', user => console.log(`${user.name} left`))

// Chat in three lines
await firebase`watch messages in room-123`
  .on('add', msg => renderMessage(msg))

// Presence is automatic
await firebase`set my presence to online`
await firebase`watch who's in room-123`
```

### Storage

```typescript
// Upload naturally
await firebase`upload photo.jpg to images/profile`
await firebase`upload resume.pdf for user alice`

// Download just works
await firebase`download images/profile/photo.jpg`
await firebase`get download url for alice's resume`

// Resumable uploads for large files
await firebase`upload video.mp4 resumable`
```

### Cloud Functions

```typescript
// Call functions naturally
await firebase`call sendWelcomeEmail for alice`
await firebase`call processOrder with { orderId: 123 }`

// Background triggers are automatic
await firebase`on user created: call sendWelcomeEmail`
await firebase`on order placed: call processPayment`
```

### Security Rules

```typescript
// Define rules naturally
await firebase`allow read users if authenticated`
await firebase`allow write users/{id} if auth.uid == id`

// Or use the familiar syntax
const rules = `
  match /users/{userId} {
    allow read: if request.auth != null;
    allow write: if request.auth.uid == userId;
  }
`
await firebase`apply rules ${rules}`
```

## Promise Pipelining

Chain operations without waiting:

```typescript
// Find users, filter, notify - one network round trip
await firebase`users in California`
  .filter(user => user.lastOrder > 30.days.ago)
  .map(user => firebase`notify ${user} about flash sale`)

// Batch operations read like a todo list
await firebase`
  add message to chat-123: Hello everyone
  set users/alice/status to active
  increment room-123 message count
`

// Real-time chains
await firebase`watch orders`
  .filter(order => order.total > 100)
  .map(order => firebase`notify sales about ${order}`)
```

## Architecture

### Edge-Native Design

```
Client Request --> Cloudflare Edge --> Durable Object --> SQLite
                        |                    |              |
                   Global CDN            Single-threaded   Transactional
                   (<50ms to edge)       (no conflicts)    (ACID)
```

### Durable Object per Collection

```
FirebaseProjectDO (config, auth, rules)
  |
  +-- CollectionDO (documents, indexes, subscriptions)
  |     |-- SQLite: Document storage (fast queries)
  |     +-- WebSockets: Real-time connections
  |
  +-- AuthDO (users, sessions, tokens)
  |     |-- SQLite: User records
  |     +-- JWT: Token generation
  |
  +-- StorageDO (objects, metadata)
        |-- R2: File storage
        +-- SQLite: Metadata index
```

### Storage Tiers

| Tier | Storage | Use Case | Latency |
|------|---------|----------|---------|
| **Hot** | SQLite | Active documents, indexes | <10ms |
| **Warm** | R2 + Index | Large files, attachments | <100ms |
| **Cold** | R2 Archive | Backups, old versions | <1s |

## vs Firebase

| Feature | Google Firebase | firebase.do |
|---------|----------------|-------------|
| **Infrastructure** | Google Cloud | Your Cloudflare account |
| **Pricing** | Opaque, can spike | Predictable, transparent |
| **Write Limits** | 1/sec/doc | No artificial limits |
| **Connection Limits** | 20K per database | Unlimited (DO isolation) |
| **Query Language** | Proprietary | Standard + Natural Language |
| **Real-time Protocol** | Proprietary | Open WebSocket |
| **Security Rules** | Firebase-only | Portable, standard |
| **Cold Starts** | Yes (Functions) | No (Durable Objects) |
| **Data Location** | Google chooses | You choose |
| **Lock-in** | Severe | None (MIT licensed) |
| **AI Integration** | Limited | Native natural language |

## Use Cases

### Chat Applications

```typescript
// Real-time chat in minutes
await firebase`watch messages in ${roomId}`
  .on('add', msg => renderMessage(msg))

await firebase`add message to ${roomId}: ${text}`

// Typing indicators
await firebase`set ${userId} typing in ${roomId}`
await firebase`watch who's typing in ${roomId}`
```

### Live Dashboards

```typescript
// Real-time metrics
await firebase`watch orders today`
  .on('add', order => updateRevenue(order.total))

await firebase`watch active users`
  .on('change', count => updateUserCount(count))
```

### Multiplayer Games

```typescript
// Game state sync
await firebase`watch game ${gameId} state`
  .on('change', state => renderGame(state))

// Player moves
await firebase`update game ${gameId}: player ${playerId} moved to ${position}`
```

### IoT Data Collection

```typescript
// Sensor data ingestion
await firebase`add sensor/${deviceId}/readings: ${sensorData}`

// Real-time monitoring
await firebase`watch sensors where temperature > 100`
  .on('add', alert => notifyOperator(alert))
```

## Migration from Firebase

### Drop-in Replacement

```typescript
// Before: Google Firebase
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const app = initializeApp({ projectId: 'my-project' })
const db = getFirestore(app)

// After: firebase.do (same code works!)
import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const app = initializeApp({ projectId: 'my-project' })
const db = getFirestore(app)
connectFirestoreEmulator(db, 'your-firebase-do.workers.dev', 443)
// That's it. Your existing code just works.
```

### Gradual Migration

```typescript
// Run both in parallel during migration
const legacyDb = getFirestore(legacyApp)
const newDb = getFirestore(newApp)

// Sync data as you migrate
await firebase`sync collection users from legacy`
```

## Deployment Options

### Cloudflare Workers

```bash
npx create-dotdo firebase
# Deploys to your Cloudflare account
```

### Self-Hosted

```bash
# Docker
docker run -p 8080:8080 dotdo/firebase

# Kubernetes
kubectl apply -f firebase-do.yaml
```

### Local Development

```typescript
import { firebase } from 'firebase.do'

// Start local emulator
await firebase.startEmulator({ port: 9099 })

// Use exactly like production
await firebase`add user alice: name Alice`
```

## Roadmap

### Real-time Database
- [x] Document CRUD
- [x] Real-time subscriptions
- [x] Presence system
- [x] Offline persistence
- [ ] Multi-region sync

### Authentication
- [x] Email/Password
- [x] JWT tokens
- [ ] OAuth providers (Google, GitHub, etc.)
- [ ] Phone authentication
- [ ] Anonymous auth

### Cloud Functions
- [x] Callable functions
- [x] Background triggers
- [ ] Scheduled functions
- [ ] Event sources

### Security
- [x] Security rules engine
- [x] Rules parser
- [x] Expression evaluator
- [ ] Role-based access
- [ ] Row-level security

## Contributing

firebase.do is open source under the MIT license.

```bash
git clone https://github.com/dotdo/firebase.do
cd firebase.do
pnpm install
pnpm test
```

## License

MIT License - Freedom from lock-in.

---

<p align="center">
  <strong>Firebase without the lock-in.</strong>
  <br />
  Real-time. Edge-native. Open source.
  <br /><br />
  <a href="https://firebase.do">Website</a> |
  <a href="https://docs.firebase.do">Docs</a> |
  <a href="https://discord.gg/dotdo">Discord</a> |
  <a href="https://github.com/dotdo/firebase.do">GitHub</a>
</p>
