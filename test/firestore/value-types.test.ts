import { describe, it, expect } from 'vitest'
import {
  encodeValue,
  decodeValue,
  geoPoint,
  documentRef,
  encodeBytes,
  decodeBytes,
  formatTimestamp,
  parseTimestamp,
  type Value,
  type GeoPoint,
} from '../../src/firestore/values'

/**
 * Firestore Value Type Encoding/Decoding Tests - RED Phase
 *
 * These tests focus on timestamp, geopoint, reference, and bytes encoding
 * edge cases that may not yet be fully implemented.
 *
 * TDD RED-phase: Tests should fail until implementation is complete.
 */

// =============================================================================
// Timestamp Value Edge Cases
// =============================================================================

describe('Timestamp Value Edge Cases', () => {
  describe('encodeValue - timestamps', () => {
    it('should encode Date with nanosecond precision when available', () => {
      // Firestore supports nanosecond precision in timestamps
      // JavaScript Date only supports milliseconds, but the encoded format
      // should support full RFC3339 nano precision when parsing
      const date = new Date('2024-01-15T10:30:00.123Z')
      const result = encodeValue(date)

      expect(result.timestampValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })

    it('should encode Date at Unix epoch correctly', () => {
      const date = new Date(0)
      const result = encodeValue(date)

      expect(result).toEqual({ timestampValue: '1970-01-01T00:00:00.000Z' })
    })

    it('should encode Date before Unix epoch (negative timestamp)', () => {
      const date = new Date('1960-06-15T12:00:00.000Z')
      const result = encodeValue(date)

      expect(result.timestampValue).toBe('1960-06-15T12:00:00.000Z')
    })

    it('should encode Date far in the future (year 9999)', () => {
      const date = new Date('9999-12-31T23:59:59.999Z')
      const result = encodeValue(date)

      expect(result.timestampValue).toBe('9999-12-31T23:59:59.999Z')
    })

    it('should encode Date at millisecond boundary', () => {
      const date = new Date('2024-01-15T10:30:00.001Z')
      const result = encodeValue(date)

      expect(result.timestampValue).toBe('2024-01-15T10:30:00.001Z')
    })

    it('should encode Date at 999 milliseconds', () => {
      const date = new Date('2024-01-15T10:30:00.999Z')
      const result = encodeValue(date)

      expect(result.timestampValue).toBe('2024-01-15T10:30:00.999Z')
    })
  })

  describe('decodeValue - timestamps', () => {
    it('should decode RFC3339 timestamp with nanoseconds', () => {
      // Firestore can return timestamps with nanosecond precision
      const result = decodeValue({ timestampValue: '2024-01-15T10:30:00.123456789Z' })

      expect(result).toBeInstanceOf(Date)
      // JavaScript Date truncates to milliseconds
      expect((result as Date).getMilliseconds()).toBe(123)
    })

    it('should decode timestamp without milliseconds', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T10:30:00Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getMilliseconds()).toBe(0)
    })

    it('should decode timestamp with positive timezone offset', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T15:30:00+05:00' })

      expect(result).toBeInstanceOf(Date)
      // Should convert to UTC
      expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should decode timestamp with negative timezone offset', () => {
      const result = decodeValue({ timestampValue: '2024-01-15T05:30:00-05:00' })

      expect(result).toBeInstanceOf(Date)
      // Should convert to UTC
      expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should decode timestamp before Unix epoch', () => {
      const result = decodeValue({ timestampValue: '1960-06-15T12:00:00.000Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).getFullYear()).toBe(1960)
    })

    it('should decode timestamp with only date (no time)', () => {
      // Some systems might send date-only RFC3339
      const result = decodeValue({ timestampValue: '2024-01-15T00:00:00Z' })

      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z')
    })
  })

  describe('parseTimestamp edge cases', () => {
    it('should parse timestamp with microseconds', () => {
      const result = parseTimestamp('2024-01-15T10:30:00.123456Z')

      expect(result).toBeInstanceOf(Date)
      // Microseconds are truncated to milliseconds
      expect(result.getMilliseconds()).toBe(123)
    })

    it('should throw for completely invalid timestamp', () => {
      expect(() => parseTimestamp('invalid')).toThrow()
    })

    it('should throw for partial timestamp', () => {
      expect(() => parseTimestamp('2024-01')).toThrow()
    })

    it('should throw for timestamp with invalid month', () => {
      expect(() => parseTimestamp('2024-13-01T00:00:00Z')).toThrow()
    })

    it('should throw for timestamp with invalid day', () => {
      expect(() => parseTimestamp('2024-01-32T00:00:00Z')).toThrow()
    })

    it('should throw for timestamp with invalid hour', () => {
      expect(() => parseTimestamp('2024-01-15T25:00:00Z')).toThrow()
    })
  })

  describe('formatTimestamp edge cases', () => {
    it('should format Date at start of day', () => {
      const date = new Date('2024-01-15T00:00:00.000Z')
      const result = formatTimestamp(date)

      expect(result).toBe('2024-01-15T00:00:00.000Z')
    })

    it('should format Date at end of day', () => {
      const date = new Date('2024-01-15T23:59:59.999Z')
      const result = formatTimestamp(date)

      expect(result).toBe('2024-01-15T23:59:59.999Z')
    })

    it('should format leap year date', () => {
      const date = new Date('2024-02-29T12:00:00.000Z')
      const result = formatTimestamp(date)

      expect(result).toBe('2024-02-29T12:00:00.000Z')
    })
  })
})

// =============================================================================
// GeoPoint Value Edge Cases
// =============================================================================

describe('GeoPoint Value Edge Cases', () => {
  describe('encodeValue - geopoints', () => {
    it('should encode GeoPoint with very high decimal precision', () => {
      const point = geoPoint(37.774929987654321, -122.419415123456789)
      const result = encodeValue(point)

      expect(result.geoPointValue).toBeDefined()
      // Precision should be preserved
      expect(result.geoPointValue?.latitude).toBeCloseTo(37.774929987654321, 10)
      expect(result.geoPointValue?.longitude).toBeCloseTo(-122.419415123456789, 10)
    })

    it('should encode GeoPoint at North Pole', () => {
      const point = geoPoint(90, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: { latitude: 90, longitude: 0 },
      })
    })

    it('should encode GeoPoint at South Pole', () => {
      const point = geoPoint(-90, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: { latitude: -90, longitude: 0 },
      })
    })

    it('should encode GeoPoint at International Date Line (East)', () => {
      const point = geoPoint(0, 180)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: { latitude: 0, longitude: 180 },
      })
    })

    it('should encode GeoPoint at International Date Line (West)', () => {
      const point = geoPoint(0, -180)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: { latitude: 0, longitude: -180 },
      })
    })

    it('should encode GeoPoint at Prime Meridian', () => {
      const point = geoPoint(51.4772, 0)
      const result = encodeValue(point)

      expect(result).toEqual({
        geoPointValue: { latitude: 51.4772, longitude: 0 },
      })
    })

    it('should encode GeoPoint with negative zero coordinates', () => {
      const point = { latitude: -0, longitude: -0 }
      const result = encodeValue(point)

      expect(result.geoPointValue).toBeDefined()
      // -0 is preserved in the encoding (IEEE 754 behavior)
      expect(Object.is(result.geoPointValue?.latitude, -0) || result.geoPointValue?.latitude === 0).toBe(true)
      expect(Object.is(result.geoPointValue?.longitude, -0) || result.geoPointValue?.longitude === 0).toBe(true)
    })
  })

  describe('decodeValue - geopoints', () => {
    it('should decode geoPointValue with integer coordinates', () => {
      const result = decodeValue({
        geoPointValue: { latitude: 40, longitude: -74 },
      })

      expect((result as GeoPoint).latitude).toBe(40)
      expect((result as GeoPoint).longitude).toBe(-74)
    })

    it('should decode geoPointValue with zero coordinates', () => {
      const result = decodeValue({
        geoPointValue: { latitude: 0, longitude: 0 },
      })

      expect((result as GeoPoint).latitude).toBe(0)
      expect((result as GeoPoint).longitude).toBe(0)
    })

    it('should decode geoPointValue at boundary (90, 180)', () => {
      const result = decodeValue({
        geoPointValue: { latitude: 90, longitude: 180 },
      })

      expect((result as GeoPoint).latitude).toBe(90)
      expect((result as GeoPoint).longitude).toBe(180)
    })

    it('should decode geoPointValue at boundary (-90, -180)', () => {
      const result = decodeValue({
        geoPointValue: { latitude: -90, longitude: -180 },
      })

      expect((result as GeoPoint).latitude).toBe(-90)
      expect((result as GeoPoint).longitude).toBe(-180)
    })

    it('should throw for out-of-range latitude (positive)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 90.001, longitude: 0 },
        })
      ).toThrow()
    })

    it('should throw for out-of-range latitude (negative)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: -90.001, longitude: 0 },
        })
      ).toThrow()
    })

    it('should throw for out-of-range longitude (positive)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 0, longitude: 180.001 },
        })
      ).toThrow()
    })

    it('should throw for out-of-range longitude (negative)', () => {
      expect(() =>
        decodeValue({
          geoPointValue: { latitude: 0, longitude: -180.001 },
        })
      ).toThrow()
    })
  })

  describe('geoPoint factory edge cases', () => {
    it('should throw for NaN latitude', () => {
      expect(() => geoPoint(NaN, 0)).toThrow()
    })

    it('should throw for NaN longitude', () => {
      expect(() => geoPoint(0, NaN)).toThrow()
    })

    it('should throw for Infinity latitude', () => {
      expect(() => geoPoint(Infinity, 0)).toThrow()
    })

    it('should throw for -Infinity latitude', () => {
      expect(() => geoPoint(-Infinity, 0)).toThrow()
    })

    it('should throw for Infinity longitude', () => {
      expect(() => geoPoint(0, Infinity)).toThrow()
    })

    it('should throw for -Infinity longitude', () => {
      expect(() => geoPoint(0, -Infinity)).toThrow()
    })

    it('should throw for latitude just above 90', () => {
      expect(() => geoPoint(90.0000001, 0)).toThrow()
    })

    it('should throw for latitude just below -90', () => {
      expect(() => geoPoint(-90.0000001, 0)).toThrow()
    })

    it('should throw for longitude just above 180', () => {
      expect(() => geoPoint(0, 180.0000001)).toThrow()
    })

    it('should throw for longitude just below -180', () => {
      expect(() => geoPoint(0, -180.0000001)).toThrow()
    })

    it('should accept exactly 90 latitude', () => {
      const point = geoPoint(90, 0)
      expect(point.latitude).toBe(90)
    })

    it('should accept exactly -90 latitude', () => {
      const point = geoPoint(-90, 0)
      expect(point.latitude).toBe(-90)
    })

    it('should accept exactly 180 longitude', () => {
      const point = geoPoint(0, 180)
      expect(point.longitude).toBe(180)
    })

    it('should accept exactly -180 longitude', () => {
      const point = geoPoint(0, -180)
      expect(point.longitude).toBe(-180)
    })
  })
})

// =============================================================================
// Reference Value Edge Cases
// =============================================================================

describe('Reference Value Edge Cases', () => {
  describe('encodeValue - references', () => {
    it('should encode simple document reference', () => {
      const ref = documentRef('users/user123')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue: 'projects/test-project/databases/(default)/documents/users/user123',
      })
    })

    it('should encode deeply nested document reference (4 levels)', () => {
      const ref = documentRef('users/u1/posts/p1/comments/c1/replies/r1')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue:
          'projects/test-project/databases/(default)/documents/users/u1/posts/p1/comments/c1/replies/r1',
      })
    })

    it('should encode reference with custom database ID', () => {
      const ref = documentRef('users/user123')
      const result = encodeValue(ref, {
        projectId: 'test-project',
        databaseId: 'my-database',
      })

      expect(result).toEqual({
        referenceValue: 'projects/test-project/databases/my-database/documents/users/user123',
      })
    })

    it('should encode reference with hyphenated collection name', () => {
      const ref = documentRef('user-profiles/profile-123')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue:
          'projects/test-project/databases/(default)/documents/user-profiles/profile-123',
      })
    })

    it('should encode reference with underscored collection name', () => {
      const ref = documentRef('user_profiles/profile_123')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue:
          'projects/test-project/databases/(default)/documents/user_profiles/profile_123',
      })
    })

    it('should encode reference with numeric document ID', () => {
      const ref = documentRef('users/123456')
      const result = encodeValue(ref, { projectId: 'test-project' })

      expect(result).toEqual({
        referenceValue: 'projects/test-project/databases/(default)/documents/users/123456',
      })
    })

    it('should throw error when projectId is missing', () => {
      const ref = documentRef('users/user123')

      expect(() => encodeValue(ref)).toThrow()
    })

    it('should throw error when projectId is empty', () => {
      const ref = documentRef('users/user123')

      expect(() => encodeValue(ref, { projectId: '' })).toThrow()
    })
  })

  describe('decodeValue - references', () => {
    it('should decode reference to path string by default', () => {
      const result = decodeValue({
        referenceValue: 'projects/my-project/databases/(default)/documents/users/user123',
      })

      expect(result).toBe('users/user123')
    })

    it('should decode reference to DocumentReference when preserveReferences is true', () => {
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

    it('should decode deeply nested reference', () => {
      const result = decodeValue({
        referenceValue:
          'projects/my-project/databases/(default)/documents/users/u1/posts/p1/comments/c1',
      })

      expect(result).toBe('users/u1/posts/p1/comments/c1')
    })

    it('should decode reference from custom database', () => {
      const result = decodeValue({
        referenceValue: 'projects/my-project/databases/my-database/documents/users/user123',
      })

      expect(result).toBe('users/user123')
    })

    it('should throw for invalid reference format (missing projects)', () => {
      expect(() =>
        decodeValue({
          referenceValue: 'my-project/databases/(default)/documents/users/user123',
        })
      ).toThrow()
    })

    it('should throw for invalid reference format (missing databases)', () => {
      expect(() =>
        decodeValue({
          referenceValue: 'projects/my-project/(default)/documents/users/user123',
        })
      ).toThrow()
    })

    it('should throw for invalid reference format (missing documents)', () => {
      expect(() =>
        decodeValue({
          referenceValue: 'projects/my-project/databases/(default)/users/user123',
        })
      ).toThrow()
    })

    it('should throw for empty reference value', () => {
      expect(() =>
        decodeValue({
          referenceValue: '',
        })
      ).toThrow()
    })
  })

  describe('documentRef factory edge cases', () => {
    it('should create reference with simple path', () => {
      const ref = documentRef('collection/doc')

      expect(ref.__type__).toBe('reference')
      expect(ref.path).toBe('collection/doc')
    })

    it('should create reference with long path', () => {
      const longPath = 'a/1/b/2/c/3/d/4/e/5/f/6/g/7/h/8'
      const ref = documentRef(longPath)

      expect(ref.path).toBe(longPath)
    })

    it('should create reference with special characters in path', () => {
      const ref = documentRef('users/user-123_abc')

      expect(ref.path).toBe('users/user-123_abc')
    })

    it('should create reference with only alphanumeric path', () => {
      const ref = documentRef('users/abc123')

      expect(ref.path).toBe('users/abc123')
    })
  })
})

// =============================================================================
// Bytes Value Edge Cases
// =============================================================================

describe('Bytes Value Edge Cases', () => {
  describe('encodeValue - bytes', () => {
    it('should encode empty Uint8Array', () => {
      const bytes = new Uint8Array([])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: '' })
    })

    it('should encode single byte', () => {
      const bytes = new Uint8Array([65]) // 'A'
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'QQ==' })
    })

    it('should encode two bytes (with padding)', () => {
      const bytes = new Uint8Array([65, 66]) // 'AB'
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'QUI=' })
    })

    it('should encode three bytes (no padding)', () => {
      const bytes = new Uint8Array([65, 66, 67]) // 'ABC'
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'QUJD' })
    })

    it('should encode byte 0x00 (null byte)', () => {
      const bytes = new Uint8Array([0])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: 'AA==' })
    })

    it('should encode byte 0xFF', () => {
      const bytes = new Uint8Array([255])
      const result = encodeValue(bytes)

      expect(result).toEqual({ bytesValue: '/w==' })
    })

    it('should encode all byte values (0x00-0xFF)', () => {
      const bytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        bytes[i] = i
      }
      const result = encodeValue(bytes)

      expect(result.bytesValue).toBeDefined()
      expect(typeof result.bytesValue).toBe('string')
      // Verify it can be decoded back
      const decoded = decodeValue(result)
      expect(Array.from(decoded as Uint8Array)).toEqual(Array.from(bytes))
    })

    it('should encode large binary data (1KB)', () => {
      const bytes = new Uint8Array(1024)
      for (let i = 0; i < 1024; i++) {
        bytes[i] = i % 256
      }
      const result = encodeValue(bytes)

      expect(result.bytesValue).toBeDefined()
      // Base64 encoding increases size by ~33%
      expect(result.bytesValue?.length).toBeGreaterThan(1024)
    })

    it('should encode binary data with repeated pattern', () => {
      const bytes = new Uint8Array(100).fill(170) // 0xAA
      const result = encodeValue(bytes)

      expect(result.bytesValue).toBeDefined()
      const decoded = decodeValue(result)
      expect(Array.from(decoded as Uint8Array)).toEqual(Array.from(bytes))
    })
  })

  describe('decodeValue - bytes', () => {
    it('should decode empty base64 string', () => {
      const result = decodeValue({ bytesValue: '' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect((result as Uint8Array).length).toBe(0)
    })

    it('should decode base64 with single character padding', () => {
      const result = decodeValue({ bytesValue: 'YQ==' }) // 'a'

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([97])
    })

    it('should decode base64 with double character padding', () => {
      const result = decodeValue({ bytesValue: 'YWI=' }) // 'ab'

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([97, 98])
    })

    it('should decode base64 without padding', () => {
      const result = decodeValue({ bytesValue: 'YWJj' }) // 'abc'

      expect(result).toBeInstanceOf(Uint8Array)
      expect(Array.from(result as Uint8Array)).toEqual([97, 98, 99])
    })

    it('should decode URL-safe base64 (- instead of +)', () => {
      const result = decodeValue({ bytesValue: 'PDw-Pz4' })

      expect(result).toBeInstanceOf(Uint8Array)
    })

    it('should decode URL-safe base64 (_ instead of /)', () => {
      const result = decodeValue({ bytesValue: 'PDw_Pz4' })

      expect(result).toBeInstanceOf(Uint8Array)
    })
  })

  describe('encodeBytes edge cases', () => {
    it('should encode empty array', () => {
      const result = encodeBytes(new Uint8Array([]))
      expect(result).toBe('')
    })

    it('should produce standard base64 output', () => {
      const result = encodeBytes(new Uint8Array([0, 1, 2, 3]))

      // Should use standard base64 alphabet
      expect(result).toMatch(/^[A-Za-z0-9+/=]*$/)
    })

    it('should produce correct padding for 1-byte input', () => {
      const result = encodeBytes(new Uint8Array([0]))
      expect(result).toBe('AA==')
    })

    it('should produce correct padding for 2-byte input', () => {
      const result = encodeBytes(new Uint8Array([0, 0]))
      expect(result).toBe('AAA=')
    })

    it('should produce no padding for 3-byte input', () => {
      const result = encodeBytes(new Uint8Array([0, 0, 0]))
      expect(result).toBe('AAAA')
    })
  })

  describe('decodeBytes edge cases', () => {
    it('should decode empty string', () => {
      const result = decodeBytes('')
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(0)
    })

    it('should throw for invalid base64 (special characters)', () => {
      expect(() => decodeBytes('!!!@@@')).toThrow()
    })

    it('should throw for invalid base64 (spaces)', () => {
      expect(() => decodeBytes('QU JD')).toThrow()
    })

    it('should throw for invalid base64 (newlines)', () => {
      expect(() => decodeBytes('QU\nJD')).toThrow()
    })

    it('should handle base64 with mixed URL-safe and standard characters', () => {
      // This should work as the implementation normalizes the input
      const result = decodeBytes('PDw-Pz4')
      expect(result).toBeInstanceOf(Uint8Array)
    })
  })

  describe('bytes round-trip encoding', () => {
    it('should round-trip empty bytes', () => {
      const original = new Uint8Array([])
      const encoded = encodeValue(original)
      const decoded = decodeValue(encoded) as Uint8Array

      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('should round-trip single byte', () => {
      const original = new Uint8Array([128])
      const encoded = encodeValue(original)
      const decoded = decodeValue(encoded) as Uint8Array

      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('should round-trip all byte values', () => {
      const original = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        original[i] = i
      }
      const encoded = encodeValue(original)
      const decoded = decodeValue(encoded) as Uint8Array

      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('should round-trip random binary data', () => {
      const original = new Uint8Array([
        0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x55, 0xaa, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0,
      ])
      const encoded = encodeValue(original)
      const decoded = decodeValue(encoded) as Uint8Array

      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('should round-trip large binary data', () => {
      const original = new Uint8Array(10000)
      for (let i = 0; i < 10000; i++) {
        original[i] = i % 256
      }
      const encoded = encodeValue(original)
      const decoded = decodeValue(encoded) as Uint8Array

      expect(Array.from(decoded)).toEqual(Array.from(original))
    })
  })
})

// =============================================================================
// Combined Value Types in Complex Structures
// =============================================================================

describe('Combined Value Types in Complex Structures', () => {
  it('should encode/decode document with timestamp, geopoint, reference, and bytes', () => {
    const timestamp = new Date('2024-06-15T14:30:00.000Z')
    const location = geoPoint(37.7749, -122.4194)
    const ref = documentRef('users/user123')
    const bytes = new Uint8Array([1, 2, 3, 4, 5])

    const document = {
      createdAt: timestamp,
      location: location,
      data: bytes,
      tags: ['important', 'reviewed'],
      metadata: {
        version: 1,
        active: true,
      },
    }

    const encoded = encodeValue(document, { projectId: 'test-project' })
    expect(encoded.mapValue).toBeDefined()

    const decoded = decodeValue(encoded) as Record<string, unknown>

    expect((decoded.createdAt as Date).getTime()).toBe(timestamp.getTime())
    expect((decoded.location as GeoPoint).latitude).toBe(37.7749)
    expect((decoded.location as GeoPoint).longitude).toBe(-122.4194)
    expect(Array.from(decoded.data as Uint8Array)).toEqual([1, 2, 3, 4, 5])
    expect(decoded.tags).toEqual(['important', 'reviewed'])
    expect(decoded.metadata).toEqual({ version: 1, active: true })
  })

  it('should encode array containing all special types', () => {
    const timestamp = new Date('2024-01-01T00:00:00.000Z')
    const location = geoPoint(0, 0)
    const bytes = new Uint8Array([255])

    const array = [timestamp, location, bytes, null, true, 42, 'text']

    const encoded = encodeValue(array)
    expect(encoded.arrayValue).toBeDefined()

    const decoded = decodeValue(encoded) as unknown[]

    expect((decoded[0] as Date).getTime()).toBe(timestamp.getTime())
    expect((decoded[1] as GeoPoint).latitude).toBe(0)
    expect((decoded[1] as GeoPoint).longitude).toBe(0)
    expect(Array.from(decoded[2] as Uint8Array)).toEqual([255])
    expect(decoded[3]).toBeNull()
    expect(decoded[4]).toBe(true)
    expect(decoded[5]).toBe(42)
    expect(decoded[6]).toBe('text')
  })

  it('should handle nested maps with all value types', () => {
    const nested = {
      level1: {
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        level2: {
          geopoint: geoPoint(45, 90),
          level3: {
            bytes: new Uint8Array([0, 127, 255]),
          },
        },
      },
    }

    const encoded = encodeValue(nested)
    const decoded = decodeValue(encoded) as Record<string, unknown>

    const level1 = decoded.level1 as Record<string, unknown>
    const level2 = level1.level2 as Record<string, unknown>
    const level3 = level2.level3 as Record<string, unknown>

    expect((level1.timestamp as Date).getTime()).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
    expect((level2.geopoint as GeoPoint).latitude).toBe(45)
    expect((level2.geopoint as GeoPoint).longitude).toBe(90)
    expect(Array.from(level3.bytes as Uint8Array)).toEqual([0, 127, 255])
  })
})
