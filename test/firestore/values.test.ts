import { describe, it, expect } from 'vitest'
import {
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
  type DocumentReference,
  type EncodableValue,
  type EncodeOptions,
  type DecodeOptions,
} from '../../src/firestore/values'

/**
 * Firestore Value Encoding/Decoding Tests
 *
 * These tests verify the conversion between JavaScript/TypeScript values
 * and Firestore's JSON encoding format as specified in:
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 *
 * TDD RED-phase: All tests should fail with "Not implemented" errors
 * until the implementation is complete.
 */

// =============================================================================
// 1. Null Value Encoding/Decoding
// =============================================================================

describe('Null Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode null to { nullValue: null }', () => {
      const result = encodeValue(null)

      expect(result).toEqual({ nullValue: null })
    })

    it('should encode null with options parameter', () => {
      const result = encodeValue(null, { projectId: 'test-project' })

      expect(result).toEqual({ nullValue: null })
    })
  })

  describe('decodeValue', () => {
    it('should decode { nullValue: null } to null', () => {
      const result = decodeValue({ nullValue: null })

      expect(result).toBeNull()
    })

    it('should decode nullValue with options parameter', () => {
      const result = decodeValue({ nullValue: null }, { preserveReferences: true })

      expect(result).toBeNull()
    })
  })
})

// =============================================================================
// 2. Boolean Value Encoding/Decoding
// =============================================================================

describe('Boolean Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode true to { booleanValue: true }', () => {
      const result = encodeValue(true)

      expect(result).toEqual({ booleanValue: true })
    })

    it('should encode false to { booleanValue: false }', () => {
      const result = encodeValue(false)

      expect(result).toEqual({ booleanValue: false })
    })
  })

  describe('decodeValue', () => {
    it('should decode { booleanValue: true } to true', () => {
      const result = decodeValue({ booleanValue: true })

      expect(result).toBe(true)
    })

    it('should decode { booleanValue: false } to false', () => {
      const result = decodeValue({ booleanValue: false })

      expect(result).toBe(false)
    })
  })
})

// =============================================================================
// 3. Integer Value Encoding (as string for 64-bit precision)
// =============================================================================

describe('Integer Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode integer 0 as string', () => {
      const result = encodeValue(0)

      expect(result).toEqual({ integerValue: '0' })
    })

    it('should encode positive integer as string', () => {
      const result = encodeValue(42)

      expect(result).toEqual({ integerValue: '42' })
    })

    it('should encode negative integer as string', () => {
      const result = encodeValue(-123)

      expect(result).toEqual({ integerValue: '-123' })
    })

    it('should encode MAX_SAFE_INTEGER as string', () => {
      const result = encodeValue(Number.MAX_SAFE_INTEGER)

      expect(result).toEqual({ integerValue: '9007199254740991' })
    })

    it('should encode MIN_SAFE_INTEGER as string', () => {
      const result = encodeValue(Number.MIN_SAFE_INTEGER)

      expect(result).toEqual({ integerValue: '-9007199254740991' })
    })
  })

  describe('decodeValue', () => {
    it('should decode { integerValue: "0" } to number 0', () => {
      const result = decodeValue({ integerValue: '0' })

      expect(result).toBe(0)
    })

    it('should decode { integerValue: "42" } to number 42', () => {
      const result = decodeValue({ integerValue: '42' })

      expect(result).toBe(42)
    })

    it('should decode { integerValue: "-123" } to number -123', () => {
      const result = decodeValue({ integerValue: '-123' })

      expect(result).toBe(-123)
    })

    it('should decode large integer string to number', () => {
      const result = decodeValue({ integerValue: '9007199254740991' })

      expect(result).toBe(9007199254740991)
    })

    it('should decode negative large integer string to number', () => {
      const result = decodeValue({ integerValue: '-9007199254740991' })

      expect(result).toBe(-9007199254740991)
    })
  })

  describe('isSafeInteger', () => {
    it('should return true for safe integers', () => {
      expect(isSafeInteger(0)).toBe(true)
      expect(isSafeInteger(42)).toBe(true)
      expect(isSafeInteger(-100)).toBe(true)
      expect(isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true)
      expect(isSafeInteger(Number.MIN_SAFE_INTEGER)).toBe(true)
    })

    it('should return false for non-integer numbers', () => {
      expect(isSafeInteger(3.14)).toBe(false)
      expect(isSafeInteger(0.1)).toBe(false)
      expect(isSafeInteger(-2.5)).toBe(false)
    })

    it('should return false for unsafe integers', () => {
      expect(isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
      expect(isSafeInteger(Number.MIN_SAFE_INTEGER - 1)).toBe(false)
    })

    it('should return false for special values', () => {
      expect(isSafeInteger(NaN)).toBe(false)
      expect(isSafeInteger(Infinity)).toBe(false)
      expect(isSafeInteger(-Infinity)).toBe(false)
    })
  })
})

// =============================================================================
// 4. Double Value Encoding (including NaN, Infinity)
// =============================================================================

describe('Double Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode floating-point number as doubleValue', () => {
      const result = encodeValue(3.14159)

      expect(result).toEqual({ doubleValue: 3.14159 })
    })

    it('should encode negative float as doubleValue', () => {
      const result = encodeValue(-2.718)

      expect(result).toEqual({ doubleValue: -2.718 })
    })

    it('should encode very small number as doubleValue', () => {
      const result = encodeValue(0.000001)

      expect(result).toEqual({ doubleValue: 0.000001 })
    })

    it('should encode very large number as doubleValue', () => {
      const result = encodeValue(1e308)

      expect(result).toEqual({ doubleValue: 1e308 })
    })

    it('should encode NaN as doubleValue', () => {
      const result = encodeValue(NaN)

      expect(result).toHaveProperty('doubleValue')
      expect(Number.isNaN(result.doubleValue)).toBe(true)
    })

    it('should encode Infinity as doubleValue', () => {
      const result = encodeValue(Infinity)

      expect(result).toEqual({ doubleValue: Infinity })
    })

    it('should encode -Infinity as doubleValue', () => {
      const result = encodeValue(-Infinity)

      expect(result).toEqual({ doubleValue: -Infinity })
    })

    it('should encode -0 as doubleValue', () => {
      const result = encodeValue(-0)

      expect(result).toEqual({ doubleValue: -0 })
      expect(Object.is(result.doubleValue, -0)).toBe(true)
    })
  })

  describe('decodeValue', () => {
    it('should decode { doubleValue: 3.14159 } to number', () => {
      const result = decodeValue({ doubleValue: 3.14159 })

      expect(result).toBe(3.14159)
    })

    it('should decode { doubleValue: -2.718 } to negative number', () => {
      const result = decodeValue({ doubleValue: -2.718 })

      expect(result).toBe(-2.718)
    })

    it('should decode NaN doubleValue to NaN', () => {
      const result = decodeValue({ doubleValue: NaN })

      expect(Number.isNaN(result)).toBe(true)
    })

    it('should decode Infinity doubleValue to Infinity', () => {
      const result = decodeValue({ doubleValue: Infinity })

      expect(result).toBe(Infinity)
    })

    it('should decode -Infinity doubleValue to -Infinity', () => {
      const result = decodeValue({ doubleValue: -Infinity })

      expect(result).toBe(-Infinity)
    })

    it('should decode -0 doubleValue to -0', () => {
      const result = decodeValue({ doubleValue: -0 })

      expect(Object.is(result, -0)).toBe(true)
    })
  })
})

// =============================================================================
// 5. Timestamp Value (RFC3339 format)
// =============================================================================

describe('Timestamp Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode Date to RFC3339 timestampValue', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '2024-01-15T10:30:00.000Z' })
    })

    it('should encode Date with milliseconds precision', () => {
      const date = new Date('2024-06-15T14:25:30.123Z')
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '2024-06-15T14:25:30.123Z' })
    })

    it('should encode epoch date', () => {
      const date = new Date(0)
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '1970-01-01T00:00:00.000Z' })
    })

    it('should encode date at year boundary', () => {
      const date = new Date('2025-01-01T00:00:00.000Z')
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '2025-01-01T00:00:00.000Z' })
    })

    it('should encode future date', () => {
      const date = new Date('2100-12-31T23:59:59.999Z')
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '2100-12-31T23:59:59.999Z' })
    })
  })

  describe('decodeValue', () => {
    it('should decode timestampValue to Date object', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T10:30:00.000Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should decode timestampValue with milliseconds', () => {
      const result = decodeValue({ timestampValue: '2024-06-15T14:25:30.123Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getMilliseconds()).toBe(123)
    })

    it('should decode epoch timestamp', () => {
      const result = decodeValue({ timestampValue: '1970-01-01T00:00:00.000Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getTime()).toBe(0)
    })

    it('should decode timestampValue without milliseconds', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T10:30:00Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should decode timestampValue with timezone offset', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T10:30:00+05:30' })

      expect(result).toBeInstanceOf(Date)
      // Should be converted to UTC
      expect((result as Date).toISOString()).toBe('2024-01-15T05:00:00.000Z')
    })
  })

  describe('formatTimestamp', () => {
    it('should format Date to RFC3339 string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      const result = formatTimestamp(date)

      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should format Date with full milliseconds precision', () => {
      const date = new Date('2024-06-15T14:25:30.007Z')
      const result = formatTimestamp(date)

      expect(result).toBe('2024-06-15T14:25:30.007Z')
    })
  })

  describe('parseTimestamp', () => {
    it('should parse RFC3339 string to Date', () => {
      const result = parseTimestamp('2024-01-15T10:30:00.000Z')

      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should parse timestamp with nanoseconds (truncate to milliseconds)', () => {
      const result = parseTimestamp('2024-01-15T10:30:00.123456789Z')

      expect(result).toBeInstanceOf(Date)
      // Nanoseconds should be truncated to milliseconds
      expect(result.getMilliseconds()).toBe(123)
    })
  })
})

// =============================================================================
// 6. String Value (including Unicode)
// =============================================================================

describe('String Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode simple string', () => {
      const result = encodeValue('hello')

      expect(result).toEqual({ stringValue: 'hello' })
    })

    it('should encode empty string', () => {
      const result = encodeValue('')

      expect(result).toEqual({ stringValue: '' })
    })

    it('should encode string with spaces', () => {
      const result = encodeValue('hello world')

      expect(result).toEqual({ stringValue: 'hello world' })
    })

    it('should encode string with special characters', () => {
      const result = encodeValue('hello\nworld\ttab')

      expect(result).toEqual({ stringValue: 'hello\nworld\ttab' })
    })

    it('should encode Unicode string (emoji)', () => {
      const result = encodeValue('Hello World!')

      expect(result).toEqual({ stringValue: 'Hello World!' })
    })

    it('should encode Unicode string (Chinese characters)', () => {
      const result = encodeValue('Hello World!')

      expect(result).toEqual({ stringValue: 'Hello World!' })
    })

    it('should encode Unicode string (Japanese)', () => {
      const result = encodeValue('Hello World!')

      expect(result).toEqual({ stringValue: 'Hello World!' })
    })

    it('should encode Unicode string (Arabic)', () => {
      const result = encodeValue('Hello World!')

      expect(result).toEqual({ stringValue: 'Hello World!' })
    })

    it('should encode string with Unicode surrogate pairs', () => {
      // Mathematical script capital A (U+1D49C) requires surrogate pairs
      const result = encodeValue('\uD835\uDC9C')

      expect(result).toEqual({ stringValue: '\uD835\uDC9C' })
    })

    it('should encode very long string', () => {
      const longString = 'a'.repeat(10000)
      const result = encodeValue(longString)

      expect(result).toEqual({ stringValue: longString })
    })

    it('should encode string with null character', () => {
      const result = encodeValue('hello\0world')

      expect(result).toEqual({ stringValue: 'hello\0world' })
    })
  })

  describe('decodeValue', () => {
    it('should decode simple string', () => {
      const result = decodeValue({ stringValue: 'hello' })

      expect(result).toBe('hello')
    })

    it('should decode empty string', () => {
      const result = decodeValue({ stringValue: '' })

      expect(result).toBe('')
    })

    it('should decode Unicode string', () => {
      const result = decodeValue({ stringValue: 'Hello World!' })

      expect(result).toBe('Hello World!')
    })

    it('should decode string with escape sequences', () => {
      const result = decodeValue({ stringValue: 'line1\nline2\ttab' })

      expect(result).toBe('line1\nline2\ttab')
    })
  })
})

// =============================================================================
// 7. Bytes Value (base64 encoded)
// =============================================================================

describe('Bytes Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode Uint8Array to base64 bytesValue', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'SGVsbG8=' })
    })

    it('should encode empty Uint8Array', () => {
      const bytes = new Uint8Array([])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: '' })
    })

    it('should encode single byte', () => {
      const bytes = new Uint8Array([255])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: '/w==' })
    })

    it('should encode binary data with padding', () => {
      const bytes = new Uint8Array([1, 2])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'AQI=' })
    })

    it('should encode binary data without padding', () => {
      const bytes = new Uint8Array([1, 2, 3])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'AQID' })
    })

    it('should encode all possible byte values', () => {
      const bytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        bytes[i] = i
      }
      const result = encodeValue(bytes)

      expect(result).toHaveProperty('bytesValue')
      expect(typeof result.bytesValue).toBe('string')
    })
  })

  describe('decodeValue', () => {
    it('should decode base64 bytesValue to Uint8Array', () => {
      const result = decodeValue({ bytesValue: 'SGVsbG8=' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([72, 101, 108, 108, 111])
    })

    it('should decode empty bytesValue', () => {
      const result = decodeValue({ bytesValue: '' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect((result as Uint8Array).length).toBe(0)
    })

    it('should decode base64 with padding', () => {
      const result = decodeValue({ bytesValue: 'AQI=' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([1, 2])
    })

    it('should decode base64 without padding', () => {
      const result = decodeValue({ bytesValue: 'AQID' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3])
    })
  })

  describe('encodeBytes', () => {
    it('should encode bytes to base64 string', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111])
      const result = encodeBytes(bytes)

      expect(result).toBe('SGVsbG8=')
    })

    it('should encode empty bytes', () => {
      const bytes = new Uint8Array([])
      const result = encodeBytes(bytes)

      expect(result).toBe('')
    })
  })

  describe('decodeBytes', () => {
    it('should decode base64 string to bytes', () => {
      const result = decodeBytes('SGVsbG8=')

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111])
    })

    it('should decode empty base64 string', () => {
      const result = decodeBytes('')

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(0)
    })

    it('should handle URL-safe base64', () => {
      // URL-safe base64 uses - and _ instead of + and /
      const result = decodeBytes('PDw_Pz4-')

      expect(result).toBeInstanceOf(Uint8Array)
    })
  })
})

// =============================================================================
// 8. Reference Value (document paths)
// =============================================================================

describe('Reference Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode DocumentReference with project and database', () => {
      const ref = documentRef('users/user123')
      const result = encodeValue(ref, {
        projectId: 'my-project',
        databaseId: '(default)',
      })

      expect(result).toEqual({
        referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
      })
    })

    it('should encode DocumentReference with default database', () => {
      const ref = documentRef('posts/post456')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue: 'projects/test-project/databases/(default)/documents/posts/post456',
      })
    })

    it('should encode nested document reference', () => {
      const ref = documentRef('users/user123/posts/post456')
      const result = encodeValue(ref, { projectId: 'my-project' })

      expect(result).toEqual({
        referenceValue:
          'projects/my-project/databases/(default)/documents/users/user123/posts/post456',
      })
    })

    it('should encode deeply nested document reference', () => {
      const ref = documentRef('a/1/b/2/c/3/d/4')
      const result = encodeValue(ref, { projectId: 'my-project' })

      expect(result).toEqual({
        referenceValue: 'projects/my-project/databases/(default)/documents/a/1/b/2/c/3/d/4',
      })
    })
  })

  describe('decodeValue', () => {
    it('should decode referenceValue to document path string', () => {
      const result = decodeValue({
        referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
      })

      expect(result).toBe('users/user123')
    })

    it('should decode nested reference path', () => {
      const result = decodeValue({
        referenceValue:
          'projects/my-project/databases/(default)/documents/users/user123/posts/post456',
      })

      expect(result).toBe('users/user123/posts/post456')
    })

    it('should decode referenceValue to DocumentReference when preserveReferences is true', () => {
      const result = decodeValue(
        {
          referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
        },
        { preserveReferences: true }
      )

      expect(result).toEqual({
        __type__: 'reference',
        path: 'users/user123',
      })
    })
  })

  describe('documentRef', () => {
    it('should create DocumentReference from path', () => {
      const result = documentRef('users/user123')

      expect(result).toEqual({
        __type__: 'reference',
        path: 'users/user123',
      })
    })

    it('should create DocumentReference from nested path', () => {
      const result = documentRef('users/user123/posts/post456')

      expect(result).toEqual({
        __type__: 'reference',
        path: 'users/user123/posts/post456',
      })
    })

    it('should handle path with special characters', () => {
      const result = documentRef('users/user-123_456')

      expect(result).toEqual({
        __type__: 'reference',
        path: 'users/user-123_456',
      })
    })
  })
})

// =============================================================================
// 9. GeoPoint Value (latitude/longitude)
// =============================================================================

describe('GeoPoint Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode GeoPoint to geoPointValue', () => {
      const point = geoPoint(37.7749, -122.4194)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 37.7749,
          longitude: -122.4194,
        },
      })
    })

    it('should encode GeoPoint at origin', () => {
      const point = geoPoint(0, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 0,
          longitude: 0,
        },
      })
    })

    it('should encode GeoPoint at max latitude', () => {
      const point = geoPoint(90, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 90,
          longitude: 0,
        },
      })
    })

    it('should encode GeoPoint at min latitude', () => {
      const point = geoPoint(-90, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: -90,
          longitude: 0,
        },
      })
    })

    it('should encode GeoPoint at max longitude', () => {
      const point = geoPoint(0, 180)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 0,
          longitude: 180,
        },
      })
    })

    it('should encode GeoPoint at min longitude', () => {
      const point = geoPoint(0, -180)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 0,
          longitude: -180,
        },
      })
    })

    it('should encode GeoPoint with high precision', () => {
      const point = geoPoint(37.77493456789, -122.41941234567)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: {
          latitude: 37.77493456789,
          longitude: -122.41941234567,
        },
      })
    })
  })

  describe('decodeValue', () => {
    it('should decode geoPointValue to GeoPoint', () => {
      const result = decodeValue({
        geoPointValue: {
          latitude: 37.7749,
          longitude: -122.4194,
        },
      })

      expect(result).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      })
    })

    it('should decode geoPointValue at origin', () => {
      const result = decodeValue({
        geoPointValue: {
          latitude: 0,
          longitude: 0,
        },
      })

      expect(result).toEqual({
        latitude: 0,
        longitude: 0,
      })
    })
  })

  describe('geoPoint', () => {
    it('should create GeoPoint with valid coordinates', () => {
      const result = geoPoint(37.7749, -122.4194)

      expect(result).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      })
    })

    it('should throw error for latitude > 90', () => {
      expect(() => geoPoint(91, 0)).toThrow()
    })

    it('should throw error for latitude < -90', () => {
      expect(() => geoPoint(-91, 0)).toThrow()
    })

    it('should throw error for longitude > 180', () => {
      expect(() => geoPoint(0, 181)).toThrow()
    })

    it('should throw error for longitude < -180', () => {
      expect(() => geoPoint(0, -181)).toThrow()
    })

    it('should accept boundary values', () => {
      expect(geoPoint(90, 180)).toEqual({ latitude: 90, longitude: 180 })
      expect(geoPoint(-90, -180)).toEqual({ latitude: -90, longitude: -180 })
    })
  })
})

// =============================================================================
// 10. Array Value (nested values)
// =============================================================================

describe('Array Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode empty array', () => {
      const result = encodeValue([])

      expect(result).toEqual({ arrayValue: { values: [] } })
    })

    it('should encode array of strings', () => {
      const result = encodeValue(['a', 'b', 'c'])

      expect(result).toEqual({
        arrayValue: {
          values: [{ stringValue: 'a' }, { stringValue: 'b' }, { stringValue: 'c' }],
        },
      })
    })

    it('should encode array of integers', () => {
      const result = encodeValue([1, 2, 3])

      expect(result).toEqual({
        arrayValue: {
          values: [{ integerValue: '1' }, { integerValue: '2' }, { integerValue: '3' }],
        },
      })
    })

    it('should encode array of booleans', () => {
      const result = encodeValue([true, false, true])

      expect(result).toEqual({
        arrayValue: {
          values: [{ booleanValue: true }, { booleanValue: false }, { booleanValue: true }],
        },
      })
    })

    it('should encode array of mixed types', () => {
      const result = encodeValue(['hello', 42, true, null])

      expect(result).toEqual({
        arrayValue: {
          values: [
            { stringValue: 'hello' },
            { integerValue: '42' },
            { booleanValue: true },
            { nullValue: null },
          ],
        },
      })
    })

    it('should encode nested arrays', () => {
      const result = encodeValue([
        [1, 2],
        [3, 4],
      ])

      expect(result).toEqual({
        arrayValue: {
          values: [
            {
              arrayValue: {
                values: [{ integerValue: '1' }, { integerValue: '2' }],
              },
            },
            {
              arrayValue: {
                values: [{ integerValue: '3' }, { integerValue: '4' }],
              },
            },
          ],
        },
      })
    })

    it('should encode array with objects', () => {
      const result = encodeValue([{ name: 'Alice' }, { name: 'Bob' }])

      expect(result).toEqual({
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  name: { stringValue: 'Alice' },
                },
              },
            },
            {
              mapValue: {
                fields: {
                  name: { stringValue: 'Bob' },
                },
              },
            },
          ],
        },
      })
    })
  })

  describe('decodeValue', () => {
    it('should decode empty arrayValue', () => {
      const result = decodeValue({ arrayValue: { values: [] } })

      expect(result).toEqual([])
    })

    it('should decode arrayValue without values field', () => {
      const result = decodeValue({ arrayValue: {} })

      expect(result).toEqual([])
    })

    it('should decode array of strings', () => {
      const result = decodeValue({
        arrayValue: {
          values: [{ stringValue: 'a' }, { stringValue: 'b' }, { stringValue: 'c' }],
        },
      })

      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should decode array of integers', () => {
      const result = decodeValue({
        arrayValue: {
          values: [{ integerValue: '1' }, { integerValue: '2' }, { integerValue: '3' }],
        },
      })

      expect(result).toEqual([1, 2, 3])
    })

    it('should decode array of mixed types', () => {
      const result = decodeValue({
        arrayValue: {
          values: [
            { stringValue: 'hello' },
            { integerValue: '42' },
            { booleanValue: true },
            { nullValue: null },
          ],
        },
      })

      expect(result).toEqual(['hello', 42, true, null])
    })

    it('should decode nested arrays', () => {
      const result = decodeValue({
        arrayValue: {
          values: [
            {
              arrayValue: {
                values: [{ integerValue: '1' }, { integerValue: '2' }],
              },
            },
            {
              arrayValue: {
                values: [{ integerValue: '3' }, { integerValue: '4' }],
              },
            },
          ],
        },
      })

      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ])
    })
  })
})

// =============================================================================
// 11. Map Value (nested objects)
// =============================================================================

describe('Map Value Encoding/Decoding', () => {
  describe('encodeValue', () => {
    it('should encode empty object', () => {
      const result = encodeValue({})

      expect(result).toEqual({ mapValue: { fields: {} } })
    })

    it('should encode simple object', () => {
      const result = encodeValue({ name: 'John', age: 30 })

      expect(result).toEqual({
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
            age: { integerValue: '30' },
          },
        },
      })
    })

    it('should encode object with mixed types', () => {
      const result = encodeValue({
        name: 'John',
        age: 30,
        active: true,
        score: 95.5,
        data: null,
      })

      expect(result).toEqual({
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
            age: { integerValue: '30' },
            active: { booleanValue: true },
            score: { doubleValue: 95.5 },
            data: { nullValue: null },
          },
        },
      })
    })

    it('should encode nested objects', () => {
      const result = encodeValue({
        user: {
          name: 'John',
          address: {
            city: 'NYC',
          },
        },
      })

      expect(result).toEqual({
        mapValue: {
          fields: {
            user: {
              mapValue: {
                fields: {
                  name: { stringValue: 'John' },
                  address: {
                    mapValue: {
                      fields: {
                        city: { stringValue: 'NYC' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    })

    it('should encode object with array field', () => {
      const result = encodeValue({
        tags: ['a', 'b', 'c'],
      })

      expect(result).toEqual({
        mapValue: {
          fields: {
            tags: {
              arrayValue: {
                values: [{ stringValue: 'a' }, { stringValue: 'b' }, { stringValue: 'c' }],
              },
            },
          },
        },
      })
    })

    it('should encode object with special key names', () => {
      const result = encodeValue({
        'key-with-dash': 'value1',
        key_with_underscore: 'value2',
        '123numeric': 'value3',
      })

      expect(result).toEqual({
        mapValue: {
          fields: {
            'key-with-dash': { stringValue: 'value1' },
            key_with_underscore: { stringValue: 'value2' },
            '123numeric': { stringValue: 'value3' },
          },
        },
      })
    })
  })

  describe('decodeValue', () => {
    it('should decode empty mapValue', () => {
      const result = decodeValue({ mapValue: { fields: {} } })

      expect(result).toEqual({})
    })

    it('should decode mapValue without fields', () => {
      const result = decodeValue({ mapValue: {} })

      expect(result).toEqual({})
    })

    it('should decode simple mapValue', () => {
      const result = decodeValue({
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
            age: { integerValue: '30' },
          },
        },
      })

      expect(result).toEqual({ name: 'John', age: 30 })
    })

    it('should decode nested mapValue', () => {
      const result = decodeValue({
        mapValue: {
          fields: {
            user: {
              mapValue: {
                fields: {
                  name: { stringValue: 'John' },
                  address: {
                    mapValue: {
                      fields: {
                        city: { stringValue: 'NYC' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })

      expect(result).toEqual({
        user: {
          name: 'John',
          address: {
            city: 'NYC',
          },
        },
      })
    })

    it('should decode mapValue with mixed types', () => {
      const result = decodeValue({
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
            age: { integerValue: '30' },
            active: { booleanValue: true },
            score: { doubleValue: 95.5 },
            data: { nullValue: null },
          },
        },
      })

      expect(result).toEqual({
        name: 'John',
        age: 30,
        active: true,
        score: 95.5,
        data: null,
      })
    })
  })

  describe('encodeFields', () => {
    it('should encode object fields to Firestore fields format', () => {
      const result = encodeFields({
        name: 'John',
        age: 30,
      })

      expect(result).toEqual({
        name: { stringValue: 'John' },
        age: { integerValue: '30' },
      })
    })

    it('should encode empty object', () => {
      const result = encodeFields({})

      expect(result).toEqual({})
    })

    it('should encode nested objects', () => {
      const result = encodeFields({
        user: { name: 'John' },
      })

      expect(result).toEqual({
        user: {
          mapValue: {
            fields: {
              name: { stringValue: 'John' },
            },
          },
        },
      })
    })

    it('should respect encode options', () => {
      const ref = documentRef('users/user123')
      const result = encodeFields({ ref }, { projectId: 'my-project' })

      expect(result.ref).toEqual({
        referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
      })
    })
  })

  describe('decodeFields', () => {
    it('should decode Firestore fields to object', () => {
      const result = decodeFields({
        name: { stringValue: 'John' },
        age: { integerValue: '30' },
      })

      expect(result).toEqual({
        name: 'John',
        age: 30,
      })
    })

    it('should decode empty fields', () => {
      const result = decodeFields({})

      expect(result).toEqual({})
    })

    it('should decode nested fields', () => {
      const result = decodeFields({
        user: {
          mapValue: {
            fields: {
              name: { stringValue: 'John' },
            },
          },
        },
      })

      expect(result).toEqual({
        user: { name: 'John' },
      })
    })

    it('should respect decode options', () => {
      const result = decodeFields(
        {
          ref: {
            referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
          },
        },
        { preserveReferences: true }
      )

      expect(result.ref).toEqual({
        __type__: 'reference',
        path: 'users/user123',
      })
    })
  })
})

// =============================================================================
// 12. Round-trip Encoding/Decoding
// =============================================================================

describe('Round-trip Encoding/Decoding', () => {
  it('should round-trip null value', () => {
    const original = null
    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded)

    expect(decoded).toEqual(original)
  })

  it('should round-trip boolean values', () => {
    expect(decodeValue(encodeValue(true))).toBe(true)
    expect(decodeValue(encodeValue(false))).toBe(false)
  })

  it('should round-trip integer values', () => {
    const values = [0, 1, -1, 42, -100, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]

    for (const value of values) {
      expect(decodeValue(encodeValue(value))).toBe(value)
    }
  })

  it('should round-trip double values', () => {
    const values = [3.14, -2.718, 0.000001, 1e100]

    for (const value of values) {
      expect(decodeValue(encodeValue(value))).toBe(value)
    }
  })

  it('should round-trip NaN', () => {
    const encoded = encodeValue(NaN)
    const decoded = decodeValue(encoded)

    expect(Number.isNaN(decoded)).toBe(true)
  })

  it('should round-trip Infinity', () => {
    expect(decodeValue(encodeValue(Infinity))).toBe(Infinity)
    expect(decodeValue(encodeValue(-Infinity))).toBe(-Infinity)
  })

  it('should round-trip string values', () => {
    const values = ['', 'hello', 'Hello World!', '\n\t\r', '\0']

    for (const value of values) {
      expect(decodeValue(encodeValue(value))).toBe(value)
    }
  })

  it('should round-trip Date values', () => {
    const dates = [
      new Date('2024-01-15T10:30:00.000Z'),
      new Date(0),
      new Date('2100-12-31T23:59:59.999Z'),
    ]

    for (const date of dates) {
      const decoded = decodeValue(encodeValue(date)) as Date
      expect(decoded.getTime()).toBe(date.getTime())
    }
  })

  it('should round-trip Uint8Array values', () => {
    const arrays = [new Uint8Array([]), new Uint8Array([1, 2, 3]), new Uint8Array([255, 0, 128])]

    for (const arr of arrays) {
      const decoded = decodeValue(encodeValue(arr)) as Uint8Array
      expect(Array.from(decoded)).toEqual(Array.from(arr))
    }
  })

  it('should round-trip GeoPoint values', () => {
    const points = [geoPoint(0, 0), geoPoint(37.7749, -122.4194), geoPoint(-90, 180)]

    for (const point of points) {
      const decoded = decodeValue(encodeValue(point)) as GeoPoint
      expect(decoded.latitude).toBe(point.latitude)
      expect(decoded.longitude).toBe(point.longitude)
    }
  })

  it('should round-trip array values', () => {
    const arrays = [[], [1, 2, 3], ['a', 'b', 'c'], [1, 'hello', true, null], [[1, 2], [3, 4]]]

    for (const arr of arrays) {
      expect(decodeValue(encodeValue(arr))).toEqual(arr)
    }
  })

  it('should round-trip object values', () => {
    const objects = [
      {},
      { name: 'John' },
      { name: 'John', age: 30, active: true },
      {
        user: {
          name: 'John',
          address: { city: 'NYC' },
        },
      },
    ]

    for (const obj of objects) {
      expect(decodeValue(encodeValue(obj))).toEqual(obj)
    }
  })

  it('should round-trip complex nested structure', () => {
    const original = {
      id: 123,
      name: 'Test Document',
      active: true,
      score: 95.5,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      tags: ['a', 'b', 'c'],
      metadata: {
        views: 100,
        likes: 50,
        nested: {
          deep: 'value',
        },
      },
      data: null,
    }

    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded) as Record<string, unknown>

    expect(decoded.id).toBe(123)
    expect(decoded.name).toBe('Test Document')
    expect(decoded.active).toBe(true)
    expect(decoded.score).toBe(95.5)
    expect((decoded.createdAt as Date).getTime()).toBe(
      new Date('2024-01-15T10:30:00.000Z').getTime()
    )
    expect(decoded.tags).toEqual(['a', 'b', 'c'])
    expect(decoded.metadata).toEqual({
      views: 100,
      likes: 50,
      nested: {
        deep: 'value',
      },
    })
    expect(decoded.data).toBeNull()
  })
})

// =============================================================================
// 13. Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('Empty Values', () => {
    it('should handle empty string', () => {
      const encoded = encodeValue('')
      expect(encoded).toEqual({ stringValue: '' })

      const decoded = decodeValue({ stringValue: '' })
      expect(decoded).toBe('')
    })

    it('should handle empty array', () => {
      const encoded = encodeValue([])
      expect(encoded).toEqual({ arrayValue: { values: [] } })

      const decoded = decodeValue({ arrayValue: { values: [] } })
      expect(decoded).toEqual([])
    })

    it('should handle empty object', () => {
      const encoded = encodeValue({})
      expect(encoded).toEqual({ mapValue: { fields: {} } })

      const decoded = decodeValue({ mapValue: { fields: {} } })
      expect(decoded).toEqual({})
    })

    it('should handle empty Uint8Array', () => {
      const encoded = encodeValue(new Uint8Array([]))
      expect(encoded).toEqual({ bytesValue: '' })

      const decoded = decodeValue({ bytesValue: '' })
      expect(decoded).toEqual(new Uint8Array([]))
    })
  })

  describe('Large Numbers', () => {
    it('should handle MAX_SAFE_INTEGER', () => {
      const value = Number.MAX_SAFE_INTEGER
      const encoded = encodeValue(value)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(value)
    })

    it('should handle MIN_SAFE_INTEGER', () => {
      const value = Number.MIN_SAFE_INTEGER
      const encoded = encodeValue(value)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(value)
    })

    it('should handle very large double', () => {
      const value = 1.7976931348623157e308 // Near Number.MAX_VALUE
      const encoded = encodeValue(value)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(value)
    })

    it('should handle very small positive double', () => {
      const value = 5e-324 // Near Number.MIN_VALUE
      const encoded = encodeValue(value)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(value)
    })

    it('should handle very small negative number', () => {
      const value = -1e-300
      const encoded = encodeValue(value)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(value)
    })
  })

  describe('Deep Nesting', () => {
    it('should handle deeply nested objects (10 levels)', () => {
      let obj: Record<string, unknown> = { value: 'deep' }
      for (let i = 0; i < 9; i++) {
        obj = { nested: obj }
      }

      const encoded = encodeValue(obj)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(obj)
    })

    it('should handle deeply nested arrays (10 levels)', () => {
      let arr: unknown[] = ['deep']
      for (let i = 0; i < 9; i++) {
        arr = [arr]
      }

      const encoded = encodeValue(arr)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(arr)
    })

    it('should handle mixed deep nesting (objects and arrays)', () => {
      const deeplyNested = {
        level1: {
          level2: [
            {
              level3: {
                level4: ['value1', 'value2'],
              },
            },
          ],
        },
      }

      const encoded = encodeValue(deeplyNested)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(deeplyNested)
    })
  })

  describe('Large Arrays', () => {
    it('should handle array with 1000 elements', () => {
      const arr = Array.from({ length: 1000 }, (_, i) => i)

      const encoded = encodeValue(arr)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(arr)
    })

    it('should handle array with 100 objects', () => {
      const arr = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `item${i}`,
      }))

      const encoded = encodeValue(arr)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(arr)
    })
  })

  describe('Large Objects', () => {
    it('should handle object with 100 fields', () => {
      const obj: Record<string, number> = {}
      for (let i = 0; i < 100; i++) {
        obj[`field${i}`] = i
      }

      const encoded = encodeValue(obj)
      const decoded = decodeValue(encoded)

      expect(decoded).toEqual(obj)
    })
  })

  describe('Unicode Edge Cases', () => {
    it('should handle string with zero-width characters', () => {
      const str = 'hello\u200Bworld' // Zero-width space
      const encoded = encodeValue(str)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(str)
    })

    it('should handle string with combining diacritical marks', () => {
      const str = 'e\u0301' // e with combining acute accent (different from e)
      const encoded = encodeValue(str)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(str)
    })

    it('should handle string with right-to-left characters', () => {
      const str = 'Hello World!' // Hebrew "Shalom"
      const encoded = encodeValue(str)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(str)
    })

    it('should handle four-byte UTF-8 characters', () => {
      const str = '\uD83D\uDE00\uD83D\uDE01\uD83D\uDE02' // Emojis
      const encoded = encodeValue(str)
      const decoded = decodeValue(encoded)

      expect(decoded).toBe(str)
    })
  })

  describe('Boundary Values for GeoPoint', () => {
    it('should handle latitude at exact boundary 90', () => {
      const point = geoPoint(90, 0)
      expect(point.latitude).toBe(90)
    })

    it('should handle latitude at exact boundary -90', () => {
      const point = geoPoint(-90, 0)
      expect(point.latitude).toBe(-90)
    })

    it('should handle longitude at exact boundary 180', () => {
      const point = geoPoint(0, 180)
      expect(point.longitude).toBe(180)
    })

    it('should handle longitude at exact boundary -180', () => {
      const point = geoPoint(0, -180)
      expect(point.longitude).toBe(-180)
    })
  })

  describe('Special Document Paths', () => {
    it('should handle document path with hyphen', () => {
      const ref = documentRef('collection-name/doc-id')
      expect(ref.path).toBe('collection-name/doc-id')
    })

    it('should handle document path with underscore', () => {
      const ref = documentRef('collection_name/doc_id')
      expect(ref.path).toBe('collection_name/doc_id')
    })

    it('should handle document path with numbers', () => {
      const ref = documentRef('collection123/456')
      expect(ref.path).toBe('collection123/456')
    })
  })
})

// =============================================================================
// 14. Error Handling for Invalid Values
// =============================================================================

describe('Error Handling for Invalid Values', () => {
  describe('encodeValue errors', () => {
    it('should throw error for undefined value', () => {
      expect(() => encodeValue(undefined as unknown as EncodableValue)).toThrow()
    })

    it('should throw error for function value', () => {
      expect(() => encodeValue((() => {}) as unknown as EncodableValue)).toThrow()
    })

    it('should throw error for Symbol value', () => {
      expect(() => encodeValue(Symbol('test') as unknown as EncodableValue)).toThrow()
    })

    it('should throw error for BigInt value', () => {
      expect(() => encodeValue(BigInt(123) as unknown as EncodableValue)).toThrow()
    })

    it('should throw error for circular reference', () => {
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj

      expect(() => encodeValue(obj)).toThrow()
    })

    it('should throw error for DocumentReference without projectId', () => {
      const ref = documentRef('users/user123')

      // Should throw when no projectId is provided
      expect(() => encodeValue(ref)).toThrow()
    })
  })

  describe('decodeValue errors', () => {
    it('should throw error for empty Value object', () => {
      expect(() => decodeValue({} as Value)).toThrow()
    })

    it('should throw error for Value with multiple type fields', () => {
      expect(() =>
        decodeValue({
          stringValue: 'hello',
          integerValue: '42',
        } as unknown as Value)
      ).toThrow()
    })

    it('should throw error for invalid integerValue format', () => {
      expect(() => decodeValue({ integerValue: 'not-a-number' })).toThrow()
    })

    it('should throw error for invalid base64 in bytesValue', () => {
      expect(() => decodeValue({ bytesValue: '!!!invalid-base64!!!' })).toThrow()
    })

    it('should throw error for invalid timestampValue format', () => {
      expect(() => decodeValue({ timestampValue: 'not-a-timestamp' })).toThrow()
    })

    it('should throw error for invalid geoPointValue (missing latitude)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { longitude: 0 } as unknown as GeoPoint,
        })
      ).toThrow()
    })

    it('should throw error for invalid geoPointValue (missing longitude)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 0 } as unknown as GeoPoint,
        })
      ).toThrow()
    })

    it('should throw error for invalid geoPointValue (out of range latitude)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 91, longitude: 0 },
        })
      ).toThrow()
    })

    it('should throw error for invalid geoPointValue (out of range longitude)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 0, longitude: 181 },
        })
      ).toThrow()
    })

    it('should throw error for invalid referenceValue format', () => {
      expect(() =>
        decodeValue({
          referenceValue: 'invalid/reference/path',
        })
      ).toThrow()
    })
  })

  describe('geoPoint errors', () => {
    it('should throw error for NaN latitude', () => {
      expect(() => geoPoint(NaN, 0)).toThrow()
    })

    it('should throw error for NaN longitude', () => {
      expect(() => geoPoint(0, NaN)).toThrow()
    })

    it('should throw error for Infinity latitude', () => {
      expect(() => geoPoint(Infinity, 0)).toThrow()
    })

    it('should throw error for Infinity longitude', () => {
      expect(() => geoPoint(0, Infinity)).toThrow()
    })
  })

  describe('decodeBytes errors', () => {
    it('should throw error for invalid base64 characters', () => {
      expect(() => decodeBytes('invalid!@#$%')).toThrow()
    })
  })

  describe('parseTimestamp errors', () => {
    it('should throw error for invalid timestamp format', () => {
      expect(() => parseTimestamp('not-a-timestamp')).toThrow()
    })

    it('should throw error for malformed RFC3339 string', () => {
      expect(() => parseTimestamp('2024-13-45T99:99:99Z')).toThrow()
    })
  })

  describe('encodeFields errors', () => {
    it('should throw error for undefined field value', () => {
      expect(() =>
        encodeFields({ field: undefined } as unknown as Record<string, EncodableValue>)
      ).toThrow()
    })

    it('should throw error for function field value', () => {
      expect(() =>
        encodeFields({ field: () => {} } as unknown as Record<string, EncodableValue>)
      ).toThrow()
    })
  })
})

// =============================================================================
// Additional Type-Specific Edge Cases
// =============================================================================

describe('Type Coercion Prevention', () => {
  it('should not coerce string "true" to boolean', () => {
    const encoded = encodeValue('true')
    expect(encoded).toEqual({ stringValue: 'true' })

    const decoded = decodeValue(encoded)
    expect(decoded).toBe('true')
    expect(typeof decoded).toBe('string')
  })

  it('should not coerce string "123" to number', () => {
    const encoded = encodeValue('123')
    expect(encoded).toEqual({ stringValue: '123' })

    const decoded = decodeValue(encoded)
    expect(decoded).toBe('123')
    expect(typeof decoded).toBe('string')
  })

  it('should not coerce string "null" to null', () => {
    const encoded = encodeValue('null')
    expect(encoded).toEqual({ stringValue: 'null' })

    const decoded = decodeValue(encoded)
    expect(decoded).toBe('null')
    expect(typeof decoded).toBe('string')
  })

  it('should distinguish between integer 0 and double 0.0', () => {
    // Integer 0
    const intEncoded = encodeValue(0)
    expect(intEncoded).toEqual({ integerValue: '0' })

    // Double 0.0 (when explicitly stored as double via object)
    // This test verifies the encoding preserves type information
    const doubleValue: Value = { doubleValue: 0.0 }
    const decoded = decodeValue(doubleValue)
    expect(decoded).toBe(0)
  })
})

describe('Value Object Structure Validation', () => {
  it('should only set one type field in encoded value', () => {
    const testCases = [
      { input: null, expectedKey: 'nullValue' },
      { input: true, expectedKey: 'booleanValue' },
      { input: 42, expectedKey: 'integerValue' },
      { input: 3.14, expectedKey: 'doubleValue' },
      { input: 'hello', expectedKey: 'stringValue' },
      { input: new Date(), expectedKey: 'timestampValue' },
      { input: new Uint8Array([1, 2, 3]), expectedKey: 'bytesValue' },
      { input: [], expectedKey: 'arrayValue' },
      { input: {}, expectedKey: 'mapValue' },
    ]

    for (const { input, expectedKey } of testCases) {
      const encoded = encodeValue(input)
      const keys = Object.keys(encoded)

      expect(keys).toHaveLength(1)
      expect(keys[0]).toBe(expectedKey)
    }
  })
})
