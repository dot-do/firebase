/**
 * Type-Safe Field Path Traversal Utility
 *
 * This module provides type-safe utilities for traversing and manipulating
 * field paths in Firestore documents. It uses recursive types to ensure
 * safe nested access without relying on `any`.
 *
 * Field paths use dot notation (e.g., "address.city") to access nested fields
 * within Firestore document structures.
 */

import type { Value, MapValue } from './values'
import { FirestoreError } from '../errors/index.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * A record of field names to Firestore Values.
 * This is the structure of document fields.
 */
export type Fields = Record<string, Value>

/**
 * Result of traversing a field path - either a Value or undefined if not found.
 */
export type FieldPathResult = Value | undefined

/**
 * Intermediate traversal state - used during path navigation.
 * Can be a Value (when navigating through the tree) or a Fields record (at the root).
 */
type TraversalNode = Value | Fields

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a Firestore Value object.
 * A Value always has exactly one type-specific key (e.g., stringValue, mapValue).
 */
function isValue(node: TraversalNode): node is Value {
  if (typeof node !== 'object' || node === null) {
    return false
  }

  const valueKeys = [
    'nullValue',
    'booleanValue',
    'integerValue',
    'doubleValue',
    'timestampValue',
    'stringValue',
    'bytesValue',
    'referenceValue',
    'geoPointValue',
    'arrayValue',
    'mapValue',
  ]

  const keys = Object.keys(node)
  return keys.length > 0 && keys.some((k) => valueKeys.includes(k))
}

/**
 * Type guard to check if a value has a mapValue with fields.
 */
function hasMapFields(value: Value): value is { mapValue: MapValue } & Value {
  return 'mapValue' in value && value.mapValue !== undefined
}

/**
 * Type guard to check if a MapValue has fields.
 */
function mapHasFields(
  mapValue: MapValue | undefined
): mapValue is MapValue & { fields: Fields } {
  return mapValue !== undefined && mapValue.fields !== undefined
}

// ============================================================================
// Field Path Parsing
// ============================================================================

/**
 * Parses a field path string into an array of path segments.
 *
 * Supports:
 * - Simple dot notation: "foo.bar.baz"
 * - Escaped backtick fields: "`field.with.dots`.next"
 *
 * @param path - The field path string to parse
 * @returns Array of path segment strings
 * @throws Error if the path is empty or contains invalid escaping
 *
 * @example
 * ```typescript
 * parseFieldPath("name")              // ["name"]
 * parseFieldPath("address.city")      // ["address", "city"]
 * parseFieldPath("`a.b`.c")           // ["a.b", "c"]
 * ```
 */
export function parseFieldPath(path: string): string[] {
  if (path === '') {
    throw new FirestoreError('invalid-argument', 'Field path cannot be empty')
  }

  const segments: string[] = []
  let current = ''
  let inBackticks = false

  for (let i = 0; i < path.length; i++) {
    const char = path[i]

    if (char === '`') {
      inBackticks = !inBackticks
      continue
    }

    if (char === '.' && !inBackticks) {
      if (current === '') {
        throw new FirestoreError('invalid-argument', `Invalid field path: empty segment at position ${i}`)
      }
      segments.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (inBackticks) {
    throw new FirestoreError('invalid-argument', 'Invalid field path: unclosed backtick')
  }

  if (current === '') {
    throw new FirestoreError('invalid-argument', 'Invalid field path: trailing dot')
  }

  segments.push(current)
  return segments
}

/**
 * Joins path segments back into a field path string.
 * Segments containing dots are escaped with backticks.
 *
 * @param segments - Array of path segment strings
 * @returns The joined field path string
 *
 * @example
 * ```typescript
 * joinFieldPath(["address", "city"])  // "address.city"
 * joinFieldPath(["a.b", "c"])         // "`a.b`.c"
 * ```
 */
export function joinFieldPath(segments: string[]): string {
  return segments
    .map((segment) => (segment.includes('.') ? `\`${segment}\`` : segment))
    .join('.')
}

// ============================================================================
// Field Path Traversal - Get
// ============================================================================

/**
 * Gets a field value by dot-notation path from a document's fields.
 *
 * This function safely traverses nested mapValue structures to retrieve
 * the value at the specified path. Returns undefined if any part of the
 * path does not exist or is not a map.
 *
 * @param fields - The document fields to traverse
 * @param path - Dot-notation path (e.g., "address.city")
 * @returns The field Value at the path, or undefined if not found
 *
 * @example
 * ```typescript
 * const fields = {
 *   name: { stringValue: "John" },
 *   address: {
 *     mapValue: {
 *       fields: {
 *         city: { stringValue: "NYC" }
 *       }
 *     }
 *   }
 * }
 *
 * getFieldByPath(fields, "name")          // { stringValue: "John" }
 * getFieldByPath(fields, "address.city")  // { stringValue: "NYC" }
 * getFieldByPath(fields, "missing")       // undefined
 * ```
 */
export function getFieldByPath(fields: Fields, path: string): FieldPathResult {
  const segments = parseFieldPath(path)
  return getFieldBySegments(fields, segments)
}

/**
 * Gets a field value using pre-parsed path segments.
 * Useful when the path has already been parsed for performance.
 *
 * @param fields - The document fields to traverse
 * @param segments - Pre-parsed path segments
 * @returns The field Value at the path, or undefined if not found
 */
export function getFieldBySegments(
  fields: Fields,
  segments: string[]
): FieldPathResult {
  if (segments.length === 0) {
    return undefined
  }

  // Start with the first segment from the root fields
  const [first, ...rest] = segments
  let current: Value | undefined = fields[first]

  if (current === undefined) {
    return undefined
  }

  // If no more segments, return the current value
  if (rest.length === 0) {
    return current
  }

  // Navigate through nested maps
  for (const segment of rest) {
    // Current must be a map to continue traversal
    if (!hasMapFields(current)) {
      return undefined
    }

    const mapFields = current.mapValue.fields
    if (!mapHasFields(current.mapValue)) {
      return undefined
    }

    current = mapFields[segment]
    if (current === undefined) {
      return undefined
    }
  }

  return current
}

// ============================================================================
// Field Path Traversal - Set
// ============================================================================

/**
 * Sets a field value by dot-notation path in a document's fields.
 *
 * This function creates intermediate mapValue structures as needed
 * to set the value at the specified path. Modifies the fields object
 * in place.
 *
 * @param fields - The document fields to modify (mutated in place)
 * @param path - Dot-notation path (e.g., "address.city")
 * @param value - The Firestore Value to set
 *
 * @example
 * ```typescript
 * const fields = {}
 * setFieldByPath(fields, "address.city", { stringValue: "NYC" })
 * // Result:
 * // {
 * //   address: {
 * //     mapValue: {
 * //       fields: {
 * //         city: { stringValue: "NYC" }
 * //       }
 * //     }
 * //   }
 * // }
 * ```
 */
export function setFieldByPath(
  fields: Fields,
  path: string,
  value: Value
): void {
  const segments = parseFieldPath(path)
  setFieldBySegments(fields, segments, value)
}

/**
 * Sets a field value using pre-parsed path segments.
 * Useful when the path has already been parsed for performance.
 *
 * @param fields - The document fields to modify (mutated in place)
 * @param segments - Pre-parsed path segments
 * @param value - The Firestore Value to set
 */
export function setFieldBySegments(
  fields: Fields,
  segments: string[],
  value: Value
): void {
  if (segments.length === 0) {
    return
  }

  if (segments.length === 1) {
    fields[segments[0]] = value
    return
  }

  // Navigate to the parent, creating intermediate maps as needed
  let current = fields
  const parentSegments = segments.slice(0, -1)
  const finalSegment = segments[segments.length - 1]

  for (const segment of parentSegments) {
    if (current[segment] === undefined) {
      // Create new map value
      current[segment] = { mapValue: { fields: {} } }
    }

    const currentValue = current[segment]

    // If current value is not a map, convert it to one
    if (!hasMapFields(currentValue)) {
      current[segment] = { mapValue: { fields: {} } }
    }

    const mapValue = (current[segment] as { mapValue: MapValue }).mapValue

    // Ensure fields exists
    if (mapValue.fields === undefined) {
      mapValue.fields = {}
    }

    current = mapValue.fields
  }

  // Set the final value
  current[finalSegment] = value
}

// ============================================================================
// Field Path Traversal - Delete
// ============================================================================

/**
 * Deletes a field by dot-notation path from a document's fields.
 *
 * This function navigates to the specified path and removes the field.
 * If any part of the path does not exist, this is a no-op.
 *
 * @param fields - The document fields to modify (mutated in place)
 * @param path - Dot-notation path (e.g., "address.city")
 * @returns true if the field was deleted, false if it didn't exist
 *
 * @example
 * ```typescript
 * const fields = {
 *   address: {
 *     mapValue: {
 *       fields: {
 *         city: { stringValue: "NYC" }
 *       }
 *     }
 *   }
 * }
 *
 * deleteFieldByPath(fields, "address.city")  // true
 * deleteFieldByPath(fields, "missing")       // false
 * ```
 */
export function deleteFieldByPath(fields: Fields, path: string): boolean {
  const segments = parseFieldPath(path)
  return deleteFieldBySegments(fields, segments)
}

/**
 * Deletes a field using pre-parsed path segments.
 * Useful when the path has already been parsed for performance.
 *
 * @param fields - The document fields to modify (mutated in place)
 * @param segments - Pre-parsed path segments
 * @returns true if the field was deleted, false if it didn't exist
 */
export function deleteFieldBySegments(
  fields: Fields,
  segments: string[]
): boolean {
  if (segments.length === 0) {
    return false
  }

  if (segments.length === 1) {
    if (segments[0] in fields) {
      delete fields[segments[0]]
      return true
    }
    return false
  }

  // Navigate to the parent
  let current = fields
  const parentSegments = segments.slice(0, -1)
  const finalSegment = segments[segments.length - 1]

  for (const segment of parentSegments) {
    const currentValue = current[segment]

    if (currentValue === undefined) {
      return false
    }

    if (!hasMapFields(currentValue)) {
      return false
    }

    const mapFields = currentValue.mapValue.fields
    if (mapFields === undefined) {
      return false
    }

    current = mapFields
  }

  // Delete the final field
  if (finalSegment in current) {
    delete current[finalSegment]
    return true
  }

  return false
}

// ============================================================================
// Field Path Traversal - Check Existence
// ============================================================================

/**
 * Checks if a field exists at the specified path.
 *
 * @param fields - The document fields to check
 * @param path - Dot-notation path (e.g., "address.city")
 * @returns true if the field exists, false otherwise
 */
export function hasFieldByPath(fields: Fields, path: string): boolean {
  return getFieldByPath(fields, path) !== undefined
}

/**
 * Checks if a field exists using pre-parsed path segments.
 *
 * @param fields - The document fields to check
 * @param segments - Pre-parsed path segments
 * @returns true if the field exists, false otherwise
 */
export function hasFieldBySegments(fields: Fields, segments: string[]): boolean {
  return getFieldBySegments(fields, segments) !== undefined
}

// ============================================================================
// Field Mask Application
// ============================================================================

/**
 * Applies a field mask to extract only specified fields from a document.
 *
 * @param fields - The document fields to filter
 * @param mask - Array of field paths to include
 * @returns New fields object containing only the masked fields
 *
 * @example
 * ```typescript
 * const fields = {
 *   name: { stringValue: "John" },
 *   age: { integerValue: "30" },
 *   address: {
 *     mapValue: {
 *       fields: {
 *         city: { stringValue: "NYC" },
 *         zip: { stringValue: "10001" }
 *       }
 *     }
 *   }
 * }
 *
 * applyFieldMask(fields, ["name", "address.city"])
 * // Result:
 * // {
 * //   name: { stringValue: "John" },
 * //   address: {
 * //     mapValue: {
 * //       fields: {
 * //         city: { stringValue: "NYC" }
 * //       }
 * //     }
 * //   }
 * // }
 * ```
 */
export function applyFieldMask(fields: Fields, mask: string[]): Fields {
  const result: Fields = {}

  for (const path of mask) {
    const value = getFieldByPath(fields, path)
    if (value !== undefined) {
      setFieldByPath(result, path, value)
    }
  }

  return result
}

// ============================================================================
// Field Merge
// ============================================================================

/**
 * Merges source fields into target fields using an update mask.
 *
 * For each path in the mask:
 * - If the value exists in source, it's set in target
 * - If the value doesn't exist in source, it's deleted from target
 *
 * @param target - The target fields to modify (mutated in place)
 * @param source - The source fields to merge from
 * @param mask - Array of field paths to merge
 *
 * @example
 * ```typescript
 * const target = {
 *   name: { stringValue: "John" },
 *   age: { integerValue: "30" }
 * }
 * const source = {
 *   name: { stringValue: "Jane" }
 * }
 *
 * mergeFieldsWithMask(target, source, ["name"])
 * // Result: target.name is now "Jane", age unchanged
 * ```
 */
export function mergeFieldsWithMask(
  target: Fields,
  source: Fields,
  mask: string[]
): void {
  for (const path of mask) {
    const value = getFieldByPath(source, path)
    if (value !== undefined) {
      setFieldByPath(target, path, value)
    } else {
      deleteFieldByPath(target, path)
    }
  }
}
