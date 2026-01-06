import { describe, it, expect } from 'vitest'
import type { Value, GeoPoint, ArrayValue, MapValue } from '../../src/firestore/values'

/**
 * TEST: Value Type Narrowing with Discriminated Union
 *
 * This test file demonstrates proper type narrowing using the Value discriminated union.
 * The Value type is defined as a proper union of single-field types, which provides:
 *
 * 1. Exhaustive type checking - TypeScript ensures all cases are handled
 * 2. Strong type inference - After narrowing, types are properly inferred
 * 3. Invalid states impossible - Cannot create values with multiple type fields
 *
 * These tests demonstrate correct usage patterns for Value type narrowing.
 */

// =============================================================================
// Value Type Narrowing with Discriminated Union
// =============================================================================

describe('Value Type Narrowing - Discriminated Union Benefits', () => {
  describe('Benefit 1: Type narrowing with in-checks works correctly', () => {
    /**
     * With the discriminated union, the `in` operator properly narrows
     * the Value type to the specific variant.
     */
    it('demonstrates proper type narrowing with in-checks', () => {
      function getValueType(value: Value): string {
        if ('nullValue' in value) return 'null'
        if ('booleanValue' in value) return 'boolean'
        if ('integerValue' in value) return 'integer'
        if ('doubleValue' in value) return 'double'
        if ('stringValue' in value) return 'string'
        if ('timestampValue' in value) return 'timestamp'
        if ('bytesValue' in value) return 'bytes'
        if ('referenceValue' in value) return 'reference'
        if ('geoPointValue' in value) return 'geopoint'
        if ('arrayValue' in value) return 'array'
        if ('mapValue' in value) return 'map'
        // TypeScript knows this is unreachable with a proper discriminated union
        const _exhaustive: never = value
        throw new Error(`Unhandled value type: ${_exhaustive}`)
      }

      expect(getValueType({ nullValue: null })).toBe('null')
      expect(getValueType({ stringValue: 'hello' })).toBe('string')
      expect(getValueType({ booleanValue: true })).toBe('boolean')
      expect(getValueType({ integerValue: '42' })).toBe('integer')
      expect(getValueType({ doubleValue: 3.14 })).toBe('double')
    })

    it('correctly rejects empty objects at compile time', () => {
      // The discriminated union does NOT allow empty objects
      // This is a compile-time error: const emptyValue: Value = {}
      // Instead, we verify valid values work
      const validNull: Value = { nullValue: null }
      const validString: Value = { stringValue: 'test' }

      expect('nullValue' in validNull).toBe(true)
      expect('stringValue' in validString).toBe(true)
    })
  })

  describe('Benefit 2: Single-field constraint is enforced', () => {
    /**
     * The discriminated union ensures each Value has exactly one type field.
     * Multi-field values are compile-time errors.
     */
    it('demonstrates single-field Values are properly typed', () => {
      // Each value has exactly one type field
      const stringVal: Value = { stringValue: 'hello' }
      const intVal: Value = { integerValue: '42' }
      const boolVal: Value = { booleanValue: true }

      // Type narrowing works correctly
      if ('stringValue' in stringVal) {
        expect(stringVal.stringValue).toBe('hello')
      }
      if ('integerValue' in intVal) {
        expect(intVal.integerValue).toBe('42')
      }
      if ('booleanValue' in boolVal) {
        expect(boolVal.booleanValue).toBe(true)
      }
    })

    it('validates proper narrowing isolates each type', () => {
      const value: Value = { booleanValue: true }

      // After narrowing, we know exactly which type we have
      const isBoolean = 'booleanValue' in value
      const isDouble = 'doubleValue' in value

      // Only one is true for valid values
      expect(isBoolean).toBe(true)
      expect(isDouble).toBe(false)
    })
  })

  describe('Benefit 3: Clean and type-safe narrowing', () => {
    /**
     * With discriminated unions, narrowing is clean and provides
     * full type safety after the check.
     */
    it('provides strong type inference after narrowing', () => {
      function processValue(value: Value): string {
        if ('stringValue' in value) {
          // TypeScript knows value.stringValue is string
          return `string: ${value.stringValue}`
        }
        if ('integerValue' in value) {
          // TypeScript knows value.integerValue is string
          return `integer: ${value.integerValue}`
        }
        if ('booleanValue' in value) {
          // TypeScript knows value.booleanValue is boolean
          return `boolean: ${value.booleanValue}`
        }
        return 'other'
      }

      expect(processValue({ stringValue: 'test' })).toBe('string: test')
      expect(processValue({ integerValue: '123' })).toBe('integer: 123')
      expect(processValue({ booleanValue: false })).toBe('boolean: false')
    })

    it('allows direct property access after narrowing', () => {
      const value: Value = { stringValue: 'hello' }

      if ('stringValue' in value) {
        // With discriminated union, stringValue is definitely string
        // No need for additional undefined checks
        const str: string = value.stringValue
        expect(str.toUpperCase()).toBe('HELLO')
      }
    })
  })

  describe('Benefit 4: Strong type inference', () => {
    /**
     * After narrowing with `in` checks, TypeScript correctly infers
     * the exact type of the value.
     */
    it('provides correct type after narrowing', () => {
      const value: Value = { integerValue: '42' }

      if ('integerValue' in value) {
        // After narrowing, value.integerValue is string (not string | undefined)
        const intVal: string = value.integerValue

        const num = parseInt(intVal, 10)
        expect(num).toBe(42)
      }
    })

    it('supports type guard functions for reusable narrowing', () => {
      // Type guard for string values
      function isStringValue(v: Value): v is { stringValue: string } {
        return 'stringValue' in v
      }

      // Type guard for integer values
      function isIntegerValue(v: Value): v is { integerValue: string } {
        return 'integerValue' in v
      }

      const value: Value = { stringValue: 'hello' }

      if (isStringValue(value)) {
        const str: string = value.stringValue
        expect(str.toUpperCase()).toBe('HELLO')
      }

      expect(isStringValue(value)).toBe(true)
      expect(isIntegerValue(value)).toBe(false)
    })
  })
})

// =============================================================================
// Discriminated Union Benefits (Proposed Improvement)
// =============================================================================

describe('Discriminated Union - Proposed Benefits', () => {
  /**
   * These types show what the improved Value type would look like.
   * A discriminated union provides:
   * 1. Exhaustive checking in switch statements
   * 2. Strong type inference after narrowing
   * 3. Impossible invalid states (can't have multiple value fields)
   */

  // Proposed discriminated union types
  type NullValue = { type: 'null'; value: null }
  type BooleanValue = { type: 'boolean'; value: boolean }
  type IntegerValue = { type: 'integer'; value: string }
  type DoubleValue = { type: 'double'; value: number }
  type StringValue = { type: 'string'; value: string }
  type TimestampValue = { type: 'timestamp'; value: string }
  type BytesValue = { type: 'bytes'; value: string }
  type ReferenceValue = { type: 'reference'; value: string }
  type GeoPointValue = { type: 'geopoint'; value: GeoPoint }
  type ArrayValueDU = { type: 'array'; value: DiscriminatedValue[] }
  type MapValueDU = { type: 'map'; value: Record<string, DiscriminatedValue> }

  type DiscriminatedValue =
    | NullValue
    | BooleanValue
    | IntegerValue
    | DoubleValue
    | StringValue
    | TimestampValue
    | BytesValue
    | ReferenceValue
    | GeoPointValue
    | ArrayValueDU
    | MapValueDU

  describe('Benefit 1: Exhaustive type checking', () => {
    it('switch statements get compile-time exhaustiveness checks', () => {
      function getValueType(value: DiscriminatedValue): string {
        switch (value.type) {
          case 'null':
            return 'null'
          case 'boolean':
            return 'boolean'
          case 'integer':
            return 'integer'
          case 'double':
            return 'double'
          case 'string':
            return 'string'
          case 'timestamp':
            return 'timestamp'
          case 'bytes':
            return 'bytes'
          case 'reference':
            return 'reference'
          case 'geopoint':
            return 'geopoint'
          case 'array':
            return 'array'
          case 'map':
            return 'map'
          default:
            // TypeScript ensures this is unreachable
            const _exhaustive: never = value
            throw new Error(`Unhandled value type: ${_exhaustive}`)
        }
      }

      // Test all value types
      expect(getValueType({ type: 'null', value: null })).toBe('null')
      expect(getValueType({ type: 'boolean', value: true })).toBe('boolean')
      expect(getValueType({ type: 'integer', value: '42' })).toBe('integer')
      expect(getValueType({ type: 'double', value: 3.14 })).toBe('double')
      expect(getValueType({ type: 'string', value: 'hello' })).toBe('string')
      expect(getValueType({ type: 'timestamp', value: '2024-01-01T00:00:00Z' })).toBe('timestamp')
      expect(getValueType({ type: 'bytes', value: 'SGVsbG8=' })).toBe('bytes')
      expect(getValueType({ type: 'reference', value: 'users/123' })).toBe('reference')
      expect(getValueType({ type: 'geopoint', value: { latitude: 0, longitude: 0 } })).toBe(
        'geopoint'
      )
      expect(getValueType({ type: 'array', value: [] })).toBe('array')
      expect(getValueType({ type: 'map', value: {} })).toBe('map')
    })
  })

  describe('Benefit 2: Strong type inference', () => {
    it('provides direct access to strongly-typed values after switch', () => {
      function processValue(value: DiscriminatedValue): unknown {
        switch (value.type) {
          case 'string':
            // TypeScript knows value.value is string here
            return value.value.toUpperCase()
          case 'integer':
            // TypeScript knows value.value is string (integer stored as string)
            return parseInt(value.value, 10)
          case 'boolean':
            // TypeScript knows value.value is boolean
            return !value.value
          case 'double':
            // TypeScript knows value.value is number
            return value.value * 2
          case 'array':
            // TypeScript knows value.value is DiscriminatedValue[]
            return value.value.length
          case 'map':
            // TypeScript knows value.value is Record<string, DiscriminatedValue>
            return Object.keys(value.value)
          default:
            return value.value
        }
      }

      expect(processValue({ type: 'string', value: 'hello' })).toBe('HELLO')
      expect(processValue({ type: 'integer', value: '42' })).toBe(42)
      expect(processValue({ type: 'boolean', value: true })).toBe(false)
      expect(processValue({ type: 'double', value: 1.5 })).toBe(3)
      expect(processValue({ type: 'array', value: [{type: 'null', value: null}] })).toBe(1)
      expect(processValue({ type: 'map', value: { a: { type: 'null', value: null } } })).toEqual([
        'a',
      ])
    })
  })

  describe('Benefit 3: Invalid states are impossible', () => {
    it('cannot create values with multiple type fields', () => {
      // With discriminated unions, you CAN'T do this:
      // const invalid: DiscriminatedValue = {
      //   type: 'string',
      //   value: 'hello',
      //   anotherType: 'integer',  // Compile error!
      // }

      // Each variant has exactly one type and one value
      const stringVal: StringValue = { type: 'string', value: 'hello' }
      const intVal: IntegerValue = { type: 'integer', value: '42' }

      expect(stringVal.type).toBe('string')
      expect(intVal.type).toBe('integer')
    })

    it('cannot create empty values', () => {
      // With discriminated unions, this is impossible:
      // const empty: DiscriminatedValue = {}  // Compile error!

      // Must specify type and value
      const valid: DiscriminatedValue = { type: 'null', value: null }
      expect(valid.type).toBe('null')
    })
  })

  describe('Benefit 4: Pattern matching is cleaner', () => {
    it('enables functional pattern matching style', () => {
      const match = <T>(
        value: DiscriminatedValue,
        handlers: {
          null: () => T
          boolean: (v: boolean) => T
          integer: (v: string) => T
          double: (v: number) => T
          string: (v: string) => T
          timestamp: (v: string) => T
          bytes: (v: string) => T
          reference: (v: string) => T
          geopoint: (v: GeoPoint) => T
          array: (v: DiscriminatedValue[]) => T
          map: (v: Record<string, DiscriminatedValue>) => T
        }
      ): T => {
        switch (value.type) {
          case 'null':
            return handlers.null()
          case 'boolean':
            return handlers.boolean(value.value)
          case 'integer':
            return handlers.integer(value.value)
          case 'double':
            return handlers.double(value.value)
          case 'string':
            return handlers.string(value.value)
          case 'timestamp':
            return handlers.timestamp(value.value)
          case 'bytes':
            return handlers.bytes(value.value)
          case 'reference':
            return handlers.reference(value.value)
          case 'geopoint':
            return handlers.geopoint(value.value)
          case 'array':
            return handlers.array(value.value)
          case 'map':
            return handlers.map(value.value)
        }
      }

      const result = match({ type: 'string', value: 'hello' }, {
        null: () => 'is null',
        boolean: (v) => `is boolean: ${v}`,
        integer: (v) => `is integer: ${v}`,
        double: (v) => `is double: ${v}`,
        string: (v) => `is string: ${v.toUpperCase()}`,
        timestamp: (v) => `is timestamp: ${v}`,
        bytes: (v) => `is bytes: ${v}`,
        reference: (v) => `is reference: ${v}`,
        geopoint: (v) => `is geopoint: ${v.latitude},${v.longitude}`,
        array: (v) => `is array of ${v.length}`,
        map: (v) => `is map with ${Object.keys(v).length} keys`,
      })

      expect(result).toBe('is string: HELLO')
    })
  })
})

// =============================================================================
// Conversion Tests: Current to Discriminated Union
// =============================================================================

describe('Value Conversion - Current to Discriminated Union', () => {
  /**
   * These tests verify that conversion between the current Value type
   * and a discriminated union is possible and preserves semantics.
   */

  type NullValue = { type: 'null'; value: null }
  type BooleanValue = { type: 'boolean'; value: boolean }
  type IntegerValue = { type: 'integer'; value: string }
  type DoubleValue = { type: 'double'; value: number }
  type StringValue = { type: 'string'; value: string }
  type TimestampValue = { type: 'timestamp'; value: string }
  type BytesValue = { type: 'bytes'; value: string }
  type ReferenceValue = { type: 'reference'; value: string }
  type GeoPointValue = { type: 'geopoint'; value: GeoPoint }
  type ArrayValueDU = { type: 'array'; value: DiscriminatedValue[] }
  type MapValueDU = { type: 'map'; value: Record<string, DiscriminatedValue> }

  type DiscriminatedValue =
    | NullValue
    | BooleanValue
    | IntegerValue
    | DoubleValue
    | StringValue
    | TimestampValue
    | BytesValue
    | ReferenceValue
    | GeoPointValue
    | ArrayValueDU
    | MapValueDU

  function currentToDiscriminated(value: Value): DiscriminatedValue {
    // With discriminated union, 'in' check properly narrows the type
    // No need for redundant undefined checks
    if ('nullValue' in value) {
      return { type: 'null', value: null }
    }
    if ('booleanValue' in value) {
      return { type: 'boolean', value: value.booleanValue }
    }
    if ('integerValue' in value) {
      return { type: 'integer', value: value.integerValue }
    }
    if ('doubleValue' in value) {
      return { type: 'double', value: value.doubleValue }
    }
    if ('stringValue' in value) {
      return { type: 'string', value: value.stringValue }
    }
    if ('timestampValue' in value) {
      return { type: 'timestamp', value: value.timestampValue }
    }
    if ('bytesValue' in value) {
      return { type: 'bytes', value: value.bytesValue }
    }
    if ('referenceValue' in value) {
      return { type: 'reference', value: value.referenceValue }
    }
    if ('geoPointValue' in value) {
      return { type: 'geopoint', value: value.geoPointValue }
    }
    if ('arrayValue' in value) {
      const items = (value.arrayValue.values || []).map(currentToDiscriminated)
      return { type: 'array', value: items }
    }
    if ('mapValue' in value) {
      const fields: Record<string, DiscriminatedValue> = {}
      for (const [key, val] of Object.entries(value.mapValue.fields || {})) {
        fields[key] = currentToDiscriminated(val)
      }
      return { type: 'map', value: fields }
    }
    // TypeScript knows this is unreachable with exhaustive checking
    const _exhaustive: never = value
    throw new Error(`Unknown Value type: ${_exhaustive}`)
  }

  function discriminatedToCurrent(value: DiscriminatedValue): Value {
    switch (value.type) {
      case 'null':
        return { nullValue: null }
      case 'boolean':
        return { booleanValue: value.value }
      case 'integer':
        return { integerValue: value.value }
      case 'double':
        return { doubleValue: value.value }
      case 'string':
        return { stringValue: value.value }
      case 'timestamp':
        return { timestampValue: value.value }
      case 'bytes':
        return { bytesValue: value.value }
      case 'reference':
        return { referenceValue: value.value }
      case 'geopoint':
        return { geoPointValue: value.value }
      case 'array':
        return { arrayValue: { values: value.value.map(discriminatedToCurrent) } }
      case 'map':
        const fields: Record<string, Value> = {}
        for (const [key, val] of Object.entries(value.value)) {
          fields[key] = discriminatedToCurrent(val)
        }
        return { mapValue: { fields } }
    }
  }

  describe('conversion preserves all value types', () => {
    it('converts null value', () => {
      const current: Value = { nullValue: null }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'null', value: null })
      expect(back).toEqual(current)
    })

    it('converts boolean value', () => {
      const current: Value = { booleanValue: true }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'boolean', value: true })
      expect(back).toEqual(current)
    })

    it('converts integer value', () => {
      const current: Value = { integerValue: '42' }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'integer', value: '42' })
      expect(back).toEqual(current)
    })

    it('converts double value', () => {
      const current: Value = { doubleValue: 3.14 }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'double', value: 3.14 })
      expect(back).toEqual(current)
    })

    it('converts string value', () => {
      const current: Value = { stringValue: 'hello' }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'string', value: 'hello' })
      expect(back).toEqual(current)
    })

    it('converts timestamp value', () => {
      const current: Value = { timestampValue: '2024-01-01T00:00:00Z' }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'timestamp', value: '2024-01-01T00:00:00Z' })
      expect(back).toEqual(current)
    })

    it('converts bytes value', () => {
      const current: Value = { bytesValue: 'SGVsbG8=' }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({ type: 'bytes', value: 'SGVsbG8=' })
      expect(back).toEqual(current)
    })

    it('converts reference value', () => {
      const current: Value = { referenceValue: 'projects/p/databases/d/documents/users/123' }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({
        type: 'reference',
        value: 'projects/p/databases/d/documents/users/123',
      })
      expect(back).toEqual(current)
    })

    it('converts geopoint value', () => {
      const current: Value = { geoPointValue: { latitude: 37.77, longitude: -122.42 } }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({
        type: 'geopoint',
        value: { latitude: 37.77, longitude: -122.42 },
      })
      expect(back).toEqual(current)
    })

    it('converts array value', () => {
      const current: Value = {
        arrayValue: {
          values: [{ stringValue: 'a' }, { integerValue: '1' }],
        },
      }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({
        type: 'array',
        value: [
          { type: 'string', value: 'a' },
          { type: 'integer', value: '1' },
        ],
      })
      expect(back).toEqual(current)
    })

    it('converts map value', () => {
      const current: Value = {
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
            age: { integerValue: '30' },
          },
        },
      }
      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(discriminated).toEqual({
        type: 'map',
        value: {
          name: { type: 'string', value: 'John' },
          age: { type: 'integer', value: '30' },
        },
      })
      expect(back).toEqual(current)
    })

    it('converts deeply nested structures', () => {
      const current: Value = {
        mapValue: {
          fields: {
            users: {
              arrayValue: {
                values: [
                  {
                    mapValue: {
                      fields: {
                        name: { stringValue: 'Alice' },
                        active: { booleanValue: true },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      }

      const discriminated = currentToDiscriminated(current)
      const back = discriminatedToCurrent(discriminated)

      expect(back).toEqual(current)
    })
  })
})

// =============================================================================
// Real-World Usage Scenarios
// =============================================================================

describe('Real-World Type Narrowing Scenarios', () => {
  describe('Scenario: Query result processing', () => {
    it('demonstrates clean type narrowing with discriminated union', () => {
      // Simulating processing Firestore query results
      const queryResults: Value[] = [
        { stringValue: 'Alice' },
        { integerValue: '30' },
        { booleanValue: true },
        { arrayValue: { values: [{ stringValue: 'tag1' }, { stringValue: 'tag2' }] } },
      ]

      // Clean type narrowing with discriminated union
      function extractStrings(values: Value[]): string[] {
        const result: string[] = []
        for (const value of values) {
          if ('stringValue' in value) {
            // TypeScript knows value.stringValue is string
            result.push(value.stringValue)
          } else if ('arrayValue' in value) {
            // TypeScript knows value.arrayValue is ArrayValue
            for (const item of value.arrayValue.values || []) {
              if ('stringValue' in item) {
                result.push(item.stringValue)
              }
            }
          }
        }
        return result
      }

      expect(extractStrings(queryResults)).toEqual(['Alice', 'tag1', 'tag2'])
    })
  })

  describe('Scenario: Document field validation', () => {
    it('shows clean validation with proper type narrowing', () => {
      const fields: Record<string, Value> = {
        name: { stringValue: 'Test' },
        count: { integerValue: '5' },
        enabled: { booleanValue: true },
        score: { doubleValue: 95.5 },
      }

      // Clean validation using discriminated union
      function validateFields(
        fields: Record<string, Value>
      ): { valid: boolean; errors: string[] } {
        const errors: string[] = []

        // Check name is string - simple 'in' check is sufficient
        if ('name' in fields) {
          const nameValue = fields.name
          if (!('stringValue' in nameValue)) {
            errors.push('name must be a string')
          }
        }

        // Check count is integer - simple 'in' check is sufficient
        if ('count' in fields) {
          const countValue = fields.count
          if (!('integerValue' in countValue)) {
            errors.push('count must be an integer')
          }
        }

        // Each field requires similar verbose checking
        return { valid: errors.length === 0, errors }
      }

      const result = validateFields(fields)
      expect(result.valid).toBe(true)
    })
  })

  describe('Scenario: Value comparison', () => {
    it('demonstrates clean Value comparison with type narrowing', () => {
      // Comparing two Value objects with proper type narrowing
      function areValuesEqual(a: Value, b: Value): boolean {
        // Clean type narrowing - each case properly narrows both values
        if ('nullValue' in a && 'nullValue' in b) return true
        if ('booleanValue' in a && 'booleanValue' in b) return a.booleanValue === b.booleanValue
        if ('integerValue' in a && 'integerValue' in b) return a.integerValue === b.integerValue
        if ('doubleValue' in a && 'doubleValue' in b) {
          // Handle NaN comparison
          if (Number.isNaN(a.doubleValue) && Number.isNaN(b.doubleValue)) return true
          return a.doubleValue === b.doubleValue
        }
        if ('stringValue' in a && 'stringValue' in b) return a.stringValue === b.stringValue
        if ('timestampValue' in a && 'timestampValue' in b) return a.timestampValue === b.timestampValue
        if ('bytesValue' in a && 'bytesValue' in b) return a.bytesValue === b.bytesValue
        if ('referenceValue' in a && 'referenceValue' in b) return a.referenceValue === b.referenceValue

        return false // Different types
      }

      expect(areValuesEqual({ integerValue: '42' }, { integerValue: '42' })).toBe(true)
      expect(areValuesEqual({ stringValue: 'a' }, { stringValue: 'b' })).toBe(false)
      expect(areValuesEqual({ integerValue: '1' }, { stringValue: '1' })).toBe(false)
    })
  })

  describe('Scenario: Type-safe value transformations', () => {
    it('demonstrates clean type-safe transformations with discriminated union', () => {
      // With discriminated union, type guards are simple 'in' checks
      function isStringValue(v: Value): v is { stringValue: string } {
        return 'stringValue' in v
      }

      function mapStringsToUppercase(values: Value[]): Value[] {
        return values.map((v) => {
          if (isStringValue(v)) {
            // TypeScript knows v.stringValue is string
            return { stringValue: v.stringValue.toUpperCase() }
          }
          return v
        })
      }

      const input: Value[] = [
        { stringValue: 'hello' },
        { integerValue: '42' },
        { stringValue: 'world' },
      ]

      const result = mapStringsToUppercase(input)
      expect(result).toEqual([
        { stringValue: 'HELLO' },
        { integerValue: '42' },
        { stringValue: 'WORLD' },
      ])
    })
  })
})
