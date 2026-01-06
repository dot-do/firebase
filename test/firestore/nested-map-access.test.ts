import { describe, it, expect } from 'vitest'
import {
  encodeValue,
  decodeValue,
  decodeFields,
  type Value,
  type MapValue,
} from '../../src/firestore/values'

/**
 * Nested Map Access with Missing Paths Tests
 *
 * These tests verify that accessing deeply nested map values handles
 * missing intermediate paths correctly, returning undefined or null
 * rather than throwing errors.
 *
 * This covers scenarios like:
 * - Accessing a.b.c when 'a' exists but 'b' does not
 * - Accessing fields in empty maps
 * - Accessing fields with null values at intermediate levels
 * - Safely traversing deeply nested structures with optional chaining patterns
 */

// =============================================================================
// Helper Functions for Safe Nested Map Access
// =============================================================================

/**
 * Safely gets a nested field value from decoded Firestore data.
 * Returns undefined if any part of the path is missing.
 *
 * @param obj - The decoded object
 * @param path - Array of keys representing the path (e.g., ['user', 'address', 'city'])
 * @returns The value at the path, or undefined if any intermediate path is missing
 */
function getNestedValue(obj: unknown, path: string[]): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Safely gets a nested field from raw Firestore Value format.
 * Returns undefined if any part of the path is missing.
 *
 * @param value - The Firestore Value
 * @param path - Array of keys representing the path
 * @returns The Value at the path, or undefined if missing
 */
function getNestedFirestoreValue(value: Value | undefined, path: string[]): Value | undefined {
  if (!value) return undefined

  let current: Value | undefined = value

  for (const key of path) {
    if (!current) return undefined

    // Must be a mapValue to continue traversing
    if (!('mapValue' in current)) return undefined

    const mapValue = current.mapValue
    if (!mapValue || !mapValue.fields) return undefined

    current = mapValue.fields[key]
  }

  return current
}

// =============================================================================
// 1. Decoding Maps with Missing Nested Paths
// =============================================================================

describe('Decoding Maps with Missing Nested Paths', () => {
  describe('Empty map access', () => {
    it('should decode empty mapValue to empty object', () => {
      const value: Value = { mapValue: {} }
      const result = decodeValue(value)

      expect(result).toEqual({})
    })

    it('should decode mapValue with empty fields to empty object', () => {
      const value: Value = { mapValue: { fields: {} } }
      const result = decodeValue(value)

      expect(result).toEqual({})
    })

    it('should return undefined when accessing non-existent key in empty map', () => {
      const value: Value = { mapValue: { fields: {} } }
      const result = decodeValue(value) as Record<string, unknown>

      expect(result.nonExistent).toBeUndefined()
      expect(result['any-key']).toBeUndefined()
      expect(result['deeply.nested']).toBeUndefined()
    })
  })

  describe('Single level missing path', () => {
    it('should return undefined for missing top-level field', () => {
      const value: Value = {
        mapValue: {
          fields: {
            existingField: { stringValue: 'exists' },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(result.existingField).toBe('exists')
      expect(result.missingField).toBeUndefined()
    })

    it('should handle accessing field on null value', () => {
      const value: Value = {
        mapValue: {
          fields: {
            nullField: { nullValue: null },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(result.nullField).toBeNull()
      // Attempting to access a property on null should be handled at runtime
      expect((result.nullField as Record<string, unknown> | null)?.someProperty).toBeUndefined()
    })
  })

  describe('Two level missing paths', () => {
    it('should return undefined when second level is missing', () => {
      const value: Value = {
        mapValue: {
          fields: {
            level1: {
              mapValue: {
                fields: {
                  existingField: { stringValue: 'value' },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      const level1 = result.level1 as Record<string, unknown>
      expect(level1.existingField).toBe('value')
      expect(level1.missingField).toBeUndefined()
    })

    it('should return undefined when first level is missing', () => {
      const value: Value = {
        mapValue: {
          fields: {
            otherField: { stringValue: 'other' },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(result.missingLevel1).toBeUndefined()
      expect(getNestedValue(result, ['missingLevel1', 'level2'])).toBeUndefined()
    })

    it('should return undefined when first level is empty map', () => {
      const value: Value = {
        mapValue: {
          fields: {
            emptyMap: { mapValue: {} },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      const emptyMap = result.emptyMap as Record<string, unknown>
      expect(emptyMap).toEqual({})
      expect(emptyMap.anyField).toBeUndefined()
    })

    it('should return undefined when first level is null', () => {
      const value: Value = {
        mapValue: {
          fields: {
            nullMap: { nullValue: null },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(result.nullMap).toBeNull()
      expect(getNestedValue(result, ['nullMap', 'anyField'])).toBeUndefined()
    })
  })

  describe('Three or more level missing paths', () => {
    it('should return undefined when deeply nested path is missing at any level', () => {
      const value: Value = {
        mapValue: {
          fields: {
            a: {
              mapValue: {
                fields: {
                  b: {
                    mapValue: {
                      fields: {
                        c: { stringValue: 'deep value' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      // Valid path
      expect(getNestedValue(result, ['a', 'b', 'c'])).toBe('deep value')

      // Missing at various levels
      expect(getNestedValue(result, ['x', 'b', 'c'])).toBeUndefined()
      expect(getNestedValue(result, ['a', 'x', 'c'])).toBeUndefined()
      expect(getNestedValue(result, ['a', 'b', 'x'])).toBeUndefined()
      expect(getNestedValue(result, ['a', 'b', 'c', 'd'])).toBeUndefined()
    })

    it('should handle null at intermediate level', () => {
      const value: Value = {
        mapValue: {
          fields: {
            a: {
              mapValue: {
                fields: {
                  b: { nullValue: null },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(getNestedValue(result, ['a', 'b'])).toBeNull()
      expect(getNestedValue(result, ['a', 'b', 'c'])).toBeUndefined()
    })

    it('should handle empty map at intermediate level', () => {
      const value: Value = {
        mapValue: {
          fields: {
            a: {
              mapValue: {
                fields: {
                  b: { mapValue: {} },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(getNestedValue(result, ['a', 'b'])).toEqual({})
      expect(getNestedValue(result, ['a', 'b', 'c'])).toBeUndefined()
    })

    it('should handle non-map value at intermediate level', () => {
      const value: Value = {
        mapValue: {
          fields: {
            a: {
              mapValue: {
                fields: {
                  b: { stringValue: 'not a map' },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      expect(getNestedValue(result, ['a', 'b'])).toBe('not a map')
      // Can't traverse into a string
      expect(getNestedValue(result, ['a', 'b', 'c'])).toBeUndefined()
    })

    it('should handle array at intermediate level', () => {
      const value: Value = {
        mapValue: {
          fields: {
            a: {
              mapValue: {
                fields: {
                  b: {
                    arrayValue: {
                      values: [{ stringValue: 'item1' }, { stringValue: 'item2' }],
                    },
                  },
                },
              },
            },
          },
        },
      }
      const result = decodeValue(value) as Record<string, unknown>

      // b is an array, not a map
      const b = getNestedValue(result, ['a', 'b'])
      expect(Array.isArray(b)).toBe(true)
      expect(b).toEqual(['item1', 'item2'])

      // Can't use string key to access array
      expect(getNestedValue(result, ['a', 'b', 'c'])).toBeUndefined()
    })
  })
})

// =============================================================================
// 2. Raw Firestore Value Nested Access
// =============================================================================

describe('Raw Firestore Value Nested Access', () => {
  describe('Missing fields in mapValue', () => {
    it('should return undefined for missing field in mapValue.fields', () => {
      const value: Value = {
        mapValue: {
          fields: {
            existing: { stringValue: 'value' },
          },
        },
      }

      const existing = getNestedFirestoreValue(value, ['existing'])
      expect(existing).toEqual({ stringValue: 'value' })

      const missing = getNestedFirestoreValue(value, ['missing'])
      expect(missing).toBeUndefined()
    })

    it('should return undefined when mapValue has no fields property', () => {
      const value: Value = { mapValue: {} }

      const result = getNestedFirestoreValue(value, ['anyField'])
      expect(result).toBeUndefined()
    })

    it('should return undefined for deeply nested missing paths', () => {
      const value: Value = {
        mapValue: {
          fields: {
            level1: {
              mapValue: {
                fields: {
                  level2: {
                    mapValue: {
                      fields: {
                        level3: { integerValue: '42' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      // Valid path
      expect(getNestedFirestoreValue(value, ['level1', 'level2', 'level3'])).toEqual({
        integerValue: '42',
      })

      // Missing paths
      expect(getNestedFirestoreValue(value, ['level1', 'level2', 'missing'])).toBeUndefined()
      expect(getNestedFirestoreValue(value, ['level1', 'missing', 'level3'])).toBeUndefined()
      expect(getNestedFirestoreValue(value, ['missing', 'level2', 'level3'])).toBeUndefined()
    })
  })

  describe('Non-map values at intermediate paths', () => {
    it('should return undefined when trying to traverse through string value', () => {
      const value: Value = {
        mapValue: {
          fields: {
            name: { stringValue: 'John' },
          },
        },
      }

      const name = getNestedFirestoreValue(value, ['name'])
      expect(name).toEqual({ stringValue: 'John' })

      // Can't traverse into string
      const invalid = getNestedFirestoreValue(value, ['name', 'property'])
      expect(invalid).toBeUndefined()
    })

    it('should return undefined when trying to traverse through integer value', () => {
      const value: Value = {
        mapValue: {
          fields: {
            count: { integerValue: '100' },
          },
        },
      }

      const invalid = getNestedFirestoreValue(value, ['count', 'property'])
      expect(invalid).toBeUndefined()
    })

    it('should return undefined when trying to traverse through array value', () => {
      const value: Value = {
        mapValue: {
          fields: {
            items: {
              arrayValue: {
                values: [{ stringValue: 'item1' }],
              },
            },
          },
        },
      }

      const items = getNestedFirestoreValue(value, ['items'])
      expect(items).toHaveProperty('arrayValue')

      // Can't traverse into array with string key
      const invalid = getNestedFirestoreValue(value, ['items', 'property'])
      expect(invalid).toBeUndefined()
    })

    it('should return undefined when trying to traverse through null value', () => {
      const value: Value = {
        mapValue: {
          fields: {
            nullField: { nullValue: null },
          },
        },
      }

      const nullField = getNestedFirestoreValue(value, ['nullField'])
      expect(nullField).toEqual({ nullValue: null })

      // Can't traverse into null
      const invalid = getNestedFirestoreValue(value, ['nullField', 'property'])
      expect(invalid).toBeUndefined()
    })
  })
})

// =============================================================================
// 3. decodeFields with Missing Nested Paths
// =============================================================================

describe('decodeFields with Missing Nested Paths', () => {
  it('should decode fields and allow safe access to missing nested paths', () => {
    const fields: Record<string, Value> = {
      user: {
        mapValue: {
          fields: {
            name: { stringValue: 'Alice' },
            // address is missing
          },
        },
      },
    }

    const result = decodeFields(fields)
    const user = result.user as Record<string, unknown>

    expect(user.name).toBe('Alice')
    expect(user.address).toBeUndefined()
    expect(getNestedValue(result, ['user', 'address', 'city'])).toBeUndefined()
  })

  it('should decode deeply nested structure with some missing paths', () => {
    const fields: Record<string, Value> = {
      company: {
        mapValue: {
          fields: {
            name: { stringValue: 'Acme Corp' },
            departments: {
              mapValue: {
                fields: {
                  engineering: {
                    mapValue: {
                      fields: {
                        headcount: { integerValue: '50' },
                        // location is missing
                      },
                    },
                  },
                  // sales department is missing
                },
              },
            },
          },
        },
      },
    }

    const result = decodeFields(fields)

    // Valid paths
    expect(getNestedValue(result, ['company', 'name'])).toBe('Acme Corp')
    expect(getNestedValue(result, ['company', 'departments', 'engineering', 'headcount'])).toBe(50)

    // Missing paths
    expect(
      getNestedValue(result, ['company', 'departments', 'engineering', 'location'])
    ).toBeUndefined()
    expect(getNestedValue(result, ['company', 'departments', 'sales'])).toBeUndefined()
    expect(getNestedValue(result, ['company', 'departments', 'sales', 'headcount'])).toBeUndefined()
    expect(getNestedValue(result, ['company', 'nonexistent'])).toBeUndefined()
  })

  it('should handle empty nested maps', () => {
    const fields: Record<string, Value> = {
      config: {
        mapValue: {
          fields: {
            settings: { mapValue: {} },
            options: { mapValue: { fields: {} } },
          },
        },
      },
    }

    const result = decodeFields(fields)

    expect(getNestedValue(result, ['config', 'settings'])).toEqual({})
    expect(getNestedValue(result, ['config', 'options'])).toEqual({})
    expect(getNestedValue(result, ['config', 'settings', 'anyKey'])).toBeUndefined()
    expect(getNestedValue(result, ['config', 'options', 'anyKey'])).toBeUndefined()
  })
})

// =============================================================================
// 4. Encoding Objects with Missing/Undefined Values
// =============================================================================

describe('Encoding Objects with Missing Values', () => {
  it('should throw error when encoding object with undefined field', () => {
    // undefined values should throw during encoding
    expect(() => encodeValue({ field: undefined } as Record<string, unknown>)).toThrow()
  })

  it('should encode object with null field correctly', () => {
    const result = encodeValue({ field: null })

    expect(result).toEqual({
      mapValue: {
        fields: {
          field: { nullValue: null },
        },
      },
    })
  })

  it('should encode nested object with null at intermediate level', () => {
    const result = encodeValue({
      level1: {
        level2: null,
      },
    })

    expect(result).toEqual({
      mapValue: {
        fields: {
          level1: {
            mapValue: {
              fields: {
                level2: { nullValue: null },
              },
            },
          },
        },
      },
    })
  })

  it('should encode empty nested maps', () => {
    const result = encodeValue({
      outer: {
        inner: {},
      },
    })

    expect(result).toEqual({
      mapValue: {
        fields: {
          outer: {
            mapValue: {
              fields: {
                inner: {
                  mapValue: {
                    fields: {},
                  },
                },
              },
            },
          },
        },
      },
    })
  })
})

// =============================================================================
// 5. Round-Trip with Missing Paths
// =============================================================================

describe('Round-Trip Encoding/Decoding with Sparse Data', () => {
  it('should round-trip object with some null fields', () => {
    const original = {
      name: 'Test',
      description: null,
      metadata: {
        createdBy: 'user1',
        updatedBy: null,
      },
    }

    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded)

    expect(decoded).toEqual(original)
  })

  it('should round-trip object with empty nested maps', () => {
    const original = {
      data: {},
      nested: {
        empty: {},
        hasValue: {
          key: 'value',
        },
      },
    }

    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded)

    expect(decoded).toEqual(original)
  })

  it('should round-trip deeply nested sparse structure', () => {
    const original = {
      a: {
        b: {
          c: {
            value: 'deep',
          },
          d: null,
        },
        e: {},
      },
      f: null,
    }

    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded) as Record<string, unknown>

    expect(decoded).toEqual(original)

    // Verify structure allows safe access to missing paths
    expect(getNestedValue(decoded, ['a', 'b', 'c', 'value'])).toBe('deep')
    expect(getNestedValue(decoded, ['a', 'b', 'd'])).toBeNull()
    expect(getNestedValue(decoded, ['a', 'b', 'd', 'any'])).toBeUndefined()
    expect(getNestedValue(decoded, ['a', 'e'])).toEqual({})
    expect(getNestedValue(decoded, ['a', 'e', 'any'])).toBeUndefined()
    expect(getNestedValue(decoded, ['f'])).toBeNull()
    expect(getNestedValue(decoded, ['f', 'any'])).toBeUndefined()
    expect(getNestedValue(decoded, ['nonexistent'])).toBeUndefined()
    expect(getNestedValue(decoded, ['nonexistent', 'deep', 'path'])).toBeUndefined()
  })
})

// =============================================================================
// 6. Edge Cases for Nested Map Access
// =============================================================================

describe('Edge Cases for Nested Map Access', () => {
  describe('Special key names', () => {
    it('should handle keys with dots in them', () => {
      const value: Value = {
        mapValue: {
          fields: {
            'key.with.dots': {
              mapValue: {
                fields: {
                  nested: { stringValue: 'value' },
                },
              },
            },
          },
        },
      }

      const result = decodeValue(value) as Record<string, unknown>

      // The key itself contains dots, not representing a path
      expect(result['key.with.dots']).toBeDefined()
      expect(getNestedValue(result, ['key.with.dots', 'nested'])).toBe('value')
    })

    it('should handle empty string keys', () => {
      const value: Value = {
        mapValue: {
          fields: {
            '': {
              mapValue: {
                fields: {
                  nested: { stringValue: 'value' },
                },
              },
            },
          },
        },
      }

      const result = decodeValue(value) as Record<string, unknown>

      expect(result['']).toBeDefined()
      expect(getNestedValue(result, ['', 'nested'])).toBe('value')
    })

    it('should handle numeric string keys', () => {
      const value: Value = {
        mapValue: {
          fields: {
            '0': {
              mapValue: {
                fields: {
                  '1': { stringValue: 'numeric keys' },
                },
              },
            },
          },
        },
      }

      const result = decodeValue(value) as Record<string, unknown>

      expect(getNestedValue(result, ['0', '1'])).toBe('numeric keys')
    })
  })

  describe('Very deep nesting', () => {
    it('should handle 10 levels of nesting with missing path at leaf', () => {
      // Build deeply nested structure
      let deepValue: Value = { stringValue: 'deep' }
      for (let i = 9; i >= 0; i--) {
        deepValue = {
          mapValue: {
            fields: {
              [`level${i}`]: deepValue,
            },
          },
        }
      }

      const result = decodeValue(deepValue)
      const path = Array.from({ length: 10 }, (_, i) => `level${i}`)

      expect(getNestedValue(result, path)).toBe('deep')
      expect(getNestedValue(result, [...path, 'missing'])).toBeUndefined()
      expect(getNestedValue(result, ['level0', 'missing'])).toBeUndefined()
    })

    it('should handle 10 levels of nesting with missing path at intermediate level', () => {
      // Build partially nested structure (only 5 levels)
      let deepValue: Value = { stringValue: 'deep' }
      for (let i = 4; i >= 0; i--) {
        deepValue = {
          mapValue: {
            fields: {
              [`level${i}`]: deepValue,
            },
          },
        }
      }

      const result = decodeValue(deepValue)

      // Valid 5-level path
      const validPath = ['level0', 'level1', 'level2', 'level3', 'level4']
      expect(getNestedValue(result, validPath)).toBe('deep')

      // Trying to go deeper than exists
      const tooDeepPath = [...validPath, 'level5', 'level6']
      expect(getNestedValue(result, tooDeepPath)).toBeUndefined()
    })
  })

  describe('Mixed types in nested structure', () => {
    it('should correctly identify where map traversal stops due to non-map type', () => {
      const value: Value = {
        mapValue: {
          fields: {
            stringPath: { stringValue: 'text' },
            intPath: { integerValue: '42' },
            boolPath: { booleanValue: true },
            arrayPath: { arrayValue: { values: [{ stringValue: 'item' }] } },
            nullPath: { nullValue: null },
            mapPath: {
              mapValue: {
                fields: {
                  deeper: { stringValue: 'can go deeper' },
                },
              },
            },
          },
        },
      }

      const result = decodeValue(value) as Record<string, unknown>

      // Can access top-level values
      expect(result.stringPath).toBe('text')
      expect(result.intPath).toBe(42)
      expect(result.boolPath).toBe(true)
      expect(result.arrayPath).toEqual(['item'])
      expect(result.nullPath).toBeNull()
      expect(typeof result.mapPath).toBe('object')

      // Can go deeper into mapPath
      expect(getNestedValue(result, ['mapPath', 'deeper'])).toBe('can go deeper')

      // Cannot go deeper into non-map types
      expect(getNestedValue(result, ['stringPath', 'any'])).toBeUndefined()
      expect(getNestedValue(result, ['intPath', 'any'])).toBeUndefined()
      expect(getNestedValue(result, ['boolPath', 'any'])).toBeUndefined()
      expect(getNestedValue(result, ['arrayPath', 'any'])).toBeUndefined()
      expect(getNestedValue(result, ['nullPath', 'any'])).toBeUndefined()
    })
  })
})
