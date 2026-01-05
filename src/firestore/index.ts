/**
 * Firebase Firestore Module
 *
 * Re-exports all public APIs from the firestore module.
 */

// CRUD operations
export {
  getDocument,
  updateDocument,
  deleteDocument,
  clearAllDocuments,
  getAllDocuments,
  parseDocumentPath,
  buildDocumentPath,
  isValidDocumentPath,
  type Document,
  type Precondition,
  type GetDocumentOptions,
  type UpdateDocumentOptions,
  type DeleteDocumentOptions,
  type FirestoreError,
} from './crud.js'

// Query operations
export {
  translateStructuredQuery,
  runQuery,
  type FieldFilterOp,
  type CompositeFilterOp,
  type UnaryFilterOp,
  type OrderDirection,
  type FieldReference,
  type FirestoreValue,
  type FieldFilter,
  type UnaryFilter,
  type CompositeFilter,
  type Filter,
  type Order,
  type Cursor,
  type CollectionSelector,
  type Projection,
  type StructuredQuery,
  type MongoQuery,
  type QueryResult,
  type QueryDocument,
  type QueryMetadata,
} from './query.js'

// Value encoding/decoding
export {
  encodeValue,
  decodeValue,
  encodeFields,
  decodeFields,
  isSafeInteger,
  geoPoint,
  documentRef,
  encodeBytes,
  decodeBytes,
  formatTimestamp,
  parseTimestamp,
  type Value,
  type GeoPoint,
  type ArrayValue,
  type MapValue,
  type EncodableValue,
  type DocumentReference,
  type EncodeOptions,
  type DecodeOptions,
} from './values.js'

// Watch/realtime operations
export {
  watchDocument,
  watchQuery,
  type Document as WatchDocument,
  type SnapshotMetadata,
  type DocumentSnapshot,
  type DocumentChangeType,
  type DocumentChange,
  type QuerySnapshot,
  type SnapshotListenOptions,
  type DocumentSnapshotCallback,
  type QuerySnapshotCallback,
  type Unsubscribe,
  type QuerySpec,
  type WhereFilter,
  type OrderByClause,
} from './watch.js'

// Batch operations and transactions
export {
  batchGet,
  commit,
  beginTransaction,
  rollback,
  type FirestoreDocument,
  type BatchGetRequest,
  type DocumentMask,
  type BatchGetResponse,
  type Write,
  type DocumentTransform,
  type FieldTransform,
  type ArrayValue as BatchArrayValue,
  type Precondition as BatchPrecondition,
  type CommitRequest,
  type WriteResult,
  type CommitResponse,
  type TransactionOptions,
  type ReadOnlyOptions,
  type ReadWriteOptions,
  type BeginTransactionRequest,
  type BeginTransactionResponse,
  type RollbackRequest,
} from './batch.js'

// HTTP server
export { startServer, stopServer } from './server.js'
