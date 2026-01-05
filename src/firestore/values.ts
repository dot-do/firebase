/**
 * Firestore Value Type Encoding/Decoding
 *
 * This module handles the conversion between JavaScript/TypeScript values
 * and Firestore's JSON encoding format as specified in:
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 *
 * Firestore uses a specific JSON representation for values where each value
 * is wrapped in an object with a type-specific key (e.g., stringValue, integerValue).
 */

/**
 * Firestore's JSON representation of a value.
 * Only one of these fields should be set at a time.
 */
export interface Value {
  /** Null value */
  nullValue?: null

  /** Boolean value */
  booleanValue?: boolean

  /** Integer value as string (to preserve 64-bit precision) */
  integerValue?: string

  /** Double/floating-point value */
  doubleValue?: number

  /** RFC3339 UTC timestamp string */
  timestampValue?: string

  /** String value */
  stringValue?: string

  /** Base64-encoded bytes */
  bytesValue?: string

  /** Document reference path */
  referenceValue?: string

  /** Geographic point */
  geoPointValue?: GeoPoint

  /** Array of values */
  arrayValue?: ArrayValue

  /** Map of string keys to values */
  mapValue?: MapValue
}

/**
 * Geographic point with latitude and longitude
 */
export interface GeoPoint {
  latitude: number
  longitude: number
}

/**
 * Array of Firestore values
 */
export interface ArrayValue {
  values?: Value[]
}

/**
 * Map of string keys to Firestore values
 */
export interface MapValue {
  fields?: Record<string, Value>
}

/**
 * JavaScript types that can be encoded to Firestore values
 */
export type EncodableValue =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | GeoPoint
  | DocumentReference
  | EncodableValue[]
  | { [key: string]: EncodableValue }

/**
 * Document reference for encoding reference values
 */
export interface DocumentReference {
  __type__: 'reference'
  path: string
}

/**
 * Options for encoding values
 */
export interface EncodeOptions {
  /** Project ID for reference values */
  projectId?: string
  /** Database ID for reference values (defaults to "(default)") */
  databaseId?: string
}

/**
 * Options for decoding values
 */
export interface DecodeOptions {
  /** If true, returns references as DocumentReference objects instead of paths */
  preserveReferences?: boolean
}

/**
 * Encodes a JavaScript value to Firestore's JSON value format.
 *
 * @param value - The JavaScript value to encode
 * @param options - Optional encoding options
 * @returns The Firestore Value representation
 * @throws Error if the value type is not supported
 *
 * @example
 * ```typescript
 * encodeValue(null)           // { nullValue: null }
 * encodeValue(true)           // { booleanValue: true }
 * encodeValue(42)             // { integerValue: "42" }
 * encodeValue(3.14)           // { doubleValue: 3.14 }
 * encodeValue("hello")        // { stringValue: "hello" }
 * encodeValue(new Date())     // { timestampValue: "2024-01-01T00:00:00.000Z" }
 * encodeValue(new Uint8Array) // { bytesValue: "base64..." }
 * ```
 */
export function encodeValue(value: EncodableValue, options?: EncodeOptions): Value {
  // Detect circular references using a WeakSet
  const seen = new WeakSet()

  function encode(val: EncodableValue): Value {
    // Handle null
    if (val === null) {
      return { nullValue: null }
    }

    // Handle undefined (error)
    if (val === undefined) {
      throw new Error('Cannot encode undefined value')
    }

    // Handle boolean
    if (typeof val === 'boolean') {
      return { booleanValue: val }
    }

    // Handle number
    if (typeof val === 'number') {
      // Check for -0 (must be encoded as double)
      if (Object.is(val, -0)) {
        return { doubleValue: -0 }
      }
      // Check for safe integers
      if (isSafeInteger(val)) {
        return { integerValue: String(val) }
      }
      // Everything else is a double (including NaN, Infinity, -Infinity, floats)
      return { doubleValue: val }
    }

    // Handle string
    if (typeof val === 'string') {
      return { stringValue: val }
    }

    // Handle Date
    if (val instanceof Date) {
      return { timestampValue: formatTimestamp(val) }
    }

    // Handle Uint8Array
    if (val instanceof Uint8Array) {
      return { bytesValue: encodeBytes(val) }
    }

    // Handle DocumentReference
    if (isDocumentReference(val)) {
      if (!options?.projectId) {
        throw new Error('projectId is required to encode DocumentReference')
      }
      const databaseId = options.databaseId || '(default)'
      return {
        referenceValue: `projects/${options.projectId}/databases/${databaseId}/documents/${val.path}`,
      }
    }

    // Handle GeoPoint
    if (isGeoPoint(val)) {
      return {
        geoPointValue: {
          latitude: val.latitude,
          longitude: val.longitude,
        },
      }
    }

    // Handle function, symbol, bigint (error)
    if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'bigint') {
      throw new Error(`Cannot encode ${typeof val} value`)
    }

    // Handle arrays
    if (Array.isArray(val)) {
      // Check for circular reference
      if (seen.has(val)) {
        throw new Error('Cannot encode circular reference')
      }
      seen.add(val)

      const values = val.map((item) => encode(item))
      return { arrayValue: { values } }
    }

    // Handle objects
    if (typeof val === 'object') {
      // Check for circular reference
      if (seen.has(val)) {
        throw new Error('Cannot encode circular reference')
      }
      seen.add(val)

      const fields: Record<string, Value> = {}
      for (const [key, fieldValue] of Object.entries(val)) {
        fields[key] = encode(fieldValue)
      }
      return { mapValue: { fields } }
    }

    throw new Error(`Unsupported value type: ${typeof val}`)
  }

  return encode(value)
}

function isDocumentReference(val: unknown): val is DocumentReference {
  return (
    typeof val === 'object' &&
    val !== null &&
    '__type__' in val &&
    val.__type__ === 'reference' &&
    'path' in val &&
    typeof val.path === 'string'
  )
}

function isGeoPoint(val: unknown): val is GeoPoint {
  return (
    typeof val === 'object' &&
    val !== null &&
    'latitude' in val &&
    'longitude' in val &&
    typeof val.latitude === 'number' &&
    typeof val.longitude === 'number' &&
    !('__type__' in val)
  )
}

/**
 * Decodes a Firestore JSON value to a JavaScript value.
 *
 * @param value - The Firestore Value to decode
 * @param options - Optional decoding options
 * @returns The JavaScript value
 * @throws Error if the value format is invalid
 *
 * @example
 * ```typescript
 * decodeValue({ nullValue: null })        // null
 * decodeValue({ booleanValue: true })     // true
 * decodeValue({ integerValue: "42" })     // 42
 * decodeValue({ doubleValue: 3.14 })      // 3.14
 * decodeValue({ stringValue: "hello" })   // "hello"
 * decodeValue({ timestampValue: "..." })  // Date object
 * decodeValue({ bytesValue: "base64" })   // Uint8Array
 * ```
 */
export function decodeValue(value: Value, options?: DecodeOptions): unknown {
  // Count the number of set fields
  const keys = Object.keys(value)
  if (keys.length === 0) {
    throw new Error('Empty Value object')
  }
  if (keys.length > 1) {
    throw new Error('Value object must have exactly one type field')
  }

  // Handle null
  if ('nullValue' in value) {
    return null
  }

  // Handle boolean
  if ('booleanValue' in value) {
    return value.booleanValue
  }

  // Handle integer
  if ('integerValue' in value) {
    const num = Number(value.integerValue)
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid integerValue: ${value.integerValue}`)
    }
    return num
  }

  // Handle double
  if ('doubleValue' in value) {
    return value.doubleValue
  }

  // Handle string
  if ('stringValue' in value) {
    return value.stringValue
  }

  // Handle timestamp
  if ('timestampValue' in value && value.timestampValue !== undefined) {
    return parseTimestamp(value.timestampValue)
  }

  // Handle bytes
  if ('bytesValue' in value && value.bytesValue !== undefined) {
    return decodeBytes(value.bytesValue)
  }

  // Handle reference
  if ('referenceValue' in value && value.referenceValue !== undefined) {
    const refPath = value.referenceValue
    // Expected format: projects/{project}/databases/{database}/documents/{path}
    const match = refPath.match(/^projects\/[^/]+\/databases\/[^/]+\/documents\/(.+)$/)
    if (!match) {
      throw new Error(`Invalid referenceValue format: ${refPath}`)
    }
    const path = match[1]
    if (options?.preserveReferences) {
      return documentRef(path)
    }
    return path
  }

  // Handle geoPoint
  if ('geoPointValue' in value) {
    const geo = value.geoPointValue
    if (geo === undefined) {
      throw new Error('geoPointValue is undefined')
    }
    if (typeof geo.latitude !== 'number') {
      throw new Error('geoPointValue missing latitude')
    }
    if (typeof geo.longitude !== 'number') {
      throw new Error('geoPointValue missing longitude')
    }
    // Validate ranges
    if (geo.latitude < -90 || geo.latitude > 90) {
      throw new Error(`Invalid latitude: ${geo.latitude}`)
    }
    if (geo.longitude < -180 || geo.longitude > 180) {
      throw new Error(`Invalid longitude: ${geo.longitude}`)
    }
    return geo
  }

  // Handle array
  if ('arrayValue' in value) {
    const arrayValue = value.arrayValue
    if (!arrayValue || !arrayValue.values) {
      return []
    }
    return arrayValue.values.map((v) => decodeValue(v, options))
  }

  // Handle map
  if ('mapValue' in value) {
    const mapValue = value.mapValue
    if (!mapValue || !mapValue.fields) {
      return {}
    }
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(mapValue.fields)) {
      result[key] = decodeValue(val, options)
    }
    return result
  }

  throw new Error(`Unsupported Value type: ${JSON.stringify(value)}`)
}

/**
 * Encodes a JavaScript object to Firestore's fields format.
 *
 * @param obj - The object to encode
 * @param options - Optional encoding options
 * @returns Record of field names to Firestore Values
 */
export function encodeFields(
  obj: Record<string, EncodableValue>,
  options?: EncodeOptions
): Record<string, Value> {
  const fields: Record<string, Value> = {}
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = encodeValue(value, options)
  }
  return fields
}

/**
 * Decodes Firestore fields to a JavaScript object.
 *
 * @param fields - The Firestore fields to decode
 * @param options - Optional decoding options
 * @returns The decoded JavaScript object
 */
export function decodeFields(
  fields: Record<string, Value>,
  options?: DecodeOptions
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeValue(value, options)
  }
  return result
}

/**
 * Checks if a number is a safe integer that can be represented as an integerValue.
 * JavaScript can safely represent integers up to 2^53 - 1.
 */
export function isSafeInteger(n: number): boolean {
  return Number.isSafeInteger(n)
}

/**
 * Creates a GeoPoint value.
 *
 * @param latitude - Latitude in degrees (-90 to 90)
 * @param longitude - Longitude in degrees (-180 to 180)
 * @returns A GeoPoint object
 * @throws Error if coordinates are out of range
 */
export function geoPoint(latitude: number, longitude: number): GeoPoint {
  // Validate latitude
  if (!Number.isFinite(latitude)) {
    throw new Error(`Invalid latitude: ${latitude}`)
  }
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Latitude must be between -90 and 90, got ${latitude}`)
  }

  // Validate longitude
  if (!Number.isFinite(longitude)) {
    throw new Error(`Invalid longitude: ${longitude}`)
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Longitude must be between -180 and 180, got ${longitude}`)
  }

  return { latitude, longitude }
}

/**
 * Creates a DocumentReference for encoding as a reference value.
 *
 * @param path - The document path (e.g., "users/user123")
 * @returns A DocumentReference object
 */
export function documentRef(path: string): DocumentReference {
  return {
    __type__: 'reference',
    path,
  }
}

/**
 * Encodes bytes to base64 string.
 *
 * @param bytes - The bytes to encode
 * @returns Base64-encoded string
 */
export function encodeBytes(bytes: Uint8Array): string {
  // Node.js and browser environments
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  // Browser fallback using btoa
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decodes base64 string to bytes.
 *
 * @param base64 - The base64 string to decode
 * @returns Decoded bytes
 */
export function decodeBytes(base64: string): Uint8Array {
  if (base64 === '') {
    return new Uint8Array([])
  }

  // Validate base64 format
  // Allow only valid base64 characters: A-Z, a-z, 0-9, +, /, =, and URL-safe variants -, _
  if (!/^[A-Za-z0-9+/=_-]*$/.test(base64)) {
    throw new Error('Invalid base64 string: contains invalid characters')
  }

  try {
    // Node.js environment
    if (typeof Buffer !== 'undefined') {
      // Support both standard and URL-safe base64
      const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
      const buffer = Buffer.from(normalized, 'base64')

      // Verify it's valid base64 by checking if re-encoding gives the same result
      const reencoded = buffer.toString('base64')
      const normalizedInput = normalized.replace(/=+$/, '')
      const normalizedReencoded = reencoded.replace(/=+$/, '')
      if (normalizedInput !== normalizedReencoded) {
        throw new Error('Invalid base64 encoding')
      }

      return new Uint8Array(buffer)
    }

    // Browser fallback using atob
    // Support URL-safe base64
    const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch (error) {
    throw new Error(`Invalid base64 string: ${error}`)
  }
}

/**
 * Formats a Date object to RFC3339 timestamp string.
 *
 * @param date - The date to format
 * @returns RFC3339 formatted string
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString()
}

/**
 * Parses an RFC3339 timestamp string to a Date object.
 *
 * @param timestamp - The RFC3339 timestamp string
 * @returns Parsed Date object
 */
export function parseTimestamp(timestamp: string): Date {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp format: ${timestamp}`)
  }
  return date
}
