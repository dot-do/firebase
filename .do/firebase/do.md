# firebase.do

A 100% Firebase API-compatible backend implementation for local development and testing.

## Overview

This project provides a complete implementation of Firebase services that can run locally, enabling:
- Fast TDD cycles without cloud dependencies
- Offline development
- Integration testing without Firebase quotas
- Custom Firebase-compatible backends

## Modules

### Auth (`src/auth/`)
- `emulator.ts` - Auth emulator HTTP server
- `identity-toolkit.ts` - Identity Toolkit v1 API implementation
- `jwt.ts` - JWT generation and verification
- `users.ts` - User storage and management

### Firestore (`src/firestore/`)
- `crud.ts` - Document CRUD operations
- `batch.ts` - Batch write operations
- `query.ts` - Query execution engine
- `values.ts` - Firestore value encoding/decoding
- `watch.ts` - Real-time listeners/watch streaming
- `server.ts` - HTTP REST API server

### Storage (`src/storage/`)
- `objects.ts` - Object storage operations
- `resumable.ts` - Resumable upload protocol

### Functions (`src/functions/`)
- `callable.ts` - Callable functions implementation
- `test-functions.ts` - Test function definitions

### Security Rules (`src/rules/`)
- `parser.ts` - Security rules parser
- `evaluator.ts` - Rules evaluation engine
- `builtins.ts` - Built-in rules functions
- `path-matcher.ts` - Path pattern matching

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Status

- 1195 tests passing
- 2 tests skipped (infra/config)
