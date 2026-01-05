/**
 * Firebase Security Rules Built-in Functions Implementation
 *
 * This module implements the built-in functions available in Firebase Security Rules:
 * - Document access: get(), exists(), getAfter(), existsAfter()
 * - Math operations: math.abs(), math.ceil(), math.floor(), math.round()
 * - String operations: matches(), size(), split(), lower(), upper(), trim(), replace()
 * - List operations: hasAny(), hasAll(), hasOnly(), size(), concat(), join(), removeAll()
 * - Map operations: keys(), values(), size(), get(), diff()
 * - Timestamp operations: toMillis(), date(), value()
 * - Duration utilities: value(), abs(), time()
 *
 * @see https://firebase.google.com/docs/rules/rules-language
 * @see https://firebase.google.com/docs/reference/rules/rules
 */

import { safeRegexTest, safeRegexReplace } from './safe-regex'

// Type definitions for Firebase Security Rules context
export interface RulesResource {
  __name__: string
  id: string
  data: Record<string, unknown>
}

export interface RulesTimestamp {
  toMillis(): number
  seconds: number
  nanos: number
}

export interface RulesDuration {
  value(unit: 'w' | 'd' | 'h' | 'm' | 's' | 'ms' | 'ns'): number
}

export interface RulesPath {
  path: string
}

export interface RulesContext {
  // Document access functions
  get(path: RulesPath): RulesResource | null
  exists(path: RulesPath): boolean
  getAfter(path: RulesPath): RulesResource | null
  existsAfter(path: RulesPath): boolean

  // Math namespace
  math: {
    abs(value: number): number
    ceil(value: number): number
    floor(value: number): number
    round(value: number): number
    isInfinite(value: number): boolean
    isNaN(value: number): boolean
  }

  // Timestamp utilities
  timestamp: {
    date(year: number, month: number, day: number): RulesTimestamp
    value(epoch: number): RulesTimestamp
  }

  // Duration utilities
  duration: {
    value(amount: number, unit: 'w' | 'd' | 'h' | 'm' | 's' | 'ms' | 'ns'): RulesDuration
    abs(d: RulesDuration): RulesDuration
    time(hours: number, minutes: number, seconds: number, nanos: number): RulesDuration
  }
}

// String methods available in rules
export interface RulesString {
  matches(regex: string): boolean
  size(): number
  split(delimiter: string): string[]
  lower(): string
  upper(): string
  trim(): string
  replace(regex: string, sub: string): string
  toUtf8(): unknown // bytes
}

// List methods available in rules
export interface RulesList<T = unknown> {
  hasAny(list: T[]): boolean
  hasAll(list: T[]): boolean
  hasOnly(list: T[]): boolean
  size(): number
  join(separator: string): string
  concat(list: T[]): RulesList<T>
  removeAll(list: T[]): RulesList<T>
  toSet(): RulesSet<T>
}

export interface RulesSet<T = unknown> {
  hasAny(set: T[]): boolean
  hasAll(set: T[]): boolean
  hasOnly(set: T[]): boolean
  size(): number
  difference(set: T[]): RulesSet<T>
  intersection(set: T[]): RulesSet<T>
  union(set: T[]): RulesSet<T>
}

// Map methods available in rules
export interface RulesMap<K = string, V = unknown> {
  keys(): K[]
  values(): V[]
  size(): number
  get(key: K, defaultValue?: V): V | undefined
  diff(map: Record<string, V>): RulesSet<K>
}

/**
 * Create a RulesPath object from a string path
 */
export function createPath(pathStr: string): RulesPath {
  return { path: pathStr }
}

/**
 * Create a RulesContext with document stores for testing
 */
export function createRulesContext(
  documentStore: Map<string, RulesResource> = new Map(),
  pendingWrites: Map<string, RulesResource | null> = new Map()
): RulesContext {
  return {
    get(path: RulesPath): RulesResource | null {
      return documentStore.get(path.path) || null
    },

    exists(path: RulesPath): boolean {
      return documentStore.has(path.path)
    },

    getAfter(path: RulesPath): RulesResource | null {
      // Check pending writes first
      if (pendingWrites.has(path.path)) {
        const pending = pendingWrites.get(path.path)
        // null in pendingWrites indicates deletion
        // undefined is not possible here since we checked .has() first
        return pending === null ? null : (pending ?? null)
      }
      // Fall back to current state
      return documentStore.get(path.path) ?? null
    },

    existsAfter(path: RulesPath): boolean {
      // Check pending writes first
      if (pendingWrites.has(path.path)) {
        const pending = pendingWrites.get(path.path)
        // null in pendingWrites indicates deletion
        return pending !== null
      }
      // Fall back to current state
      return documentStore.has(path.path)
    },

    math: {
      abs(value: number): number {
        return Math.abs(value)
      },
      ceil(value: number): number {
        const result = Math.ceil(value)
        // Handle -0 edge case
        return result === 0 ? 0 : result
      },
      floor(value: number): number {
        return Math.floor(value)
      },
      round(value: number): number {
        return Math.round(value)
      },
      isInfinite(value: number): boolean {
        return !isFinite(value) && !isNaN(value)
      },
      isNaN(value: number): boolean {
        return isNaN(value)
      },
    },

    timestamp: {
      date(year: number, month: number, day: number): RulesTimestamp {
        // Note: JavaScript Date months are 0-indexed, but Firebase rules use 1-indexed
        const date = new Date(Date.UTC(year, month - 1, day))
        const millis = date.getTime()
        return createRulesTimestamp(millis)
      },
      value(epoch: number): RulesTimestamp {
        return createRulesTimestamp(epoch)
      },
    },

    duration: {
      value(amount: number, unit: 'w' | 'd' | 'h' | 'm' | 's' | 'ms' | 'ns'): RulesDuration {
        return createRulesDuration(amount, unit)
      },
      abs(d: RulesDuration): RulesDuration {
        const seconds = d.value('s')
        return createRulesDuration(Math.abs(seconds), 's')
      },
      time(hours: number, minutes: number, seconds: number, nanos: number): RulesDuration {
        const totalSeconds = hours * 3600 + minutes * 60 + seconds + nanos / 1000000000
        return createRulesDuration(totalSeconds, 's')
      },
    },
  }
}

/**
 * Create a RulesString wrapper with Firebase rules string methods
 *
 * Note: matches() and replace() use safe regex execution to prevent
 * ReDoS (Regular Expression Denial of Service) attacks from malicious patterns.
 */
export function createRulesString(value: string): RulesString {
  return {
    matches(regex: string): boolean {
      // Use safe regex execution to prevent ReDoS attacks
      const result = safeRegexTest(regex, value)
      if (!result.success) {
        // Return false for invalid or unsafe patterns
        // This maintains backward compatibility while being secure
        return false
      }
      return result.result ?? false
    },
    size(): number {
      return value.length
    },
    split(delimiter: string): string[] {
      return value.split(delimiter)
    },
    lower(): string {
      return value.toLowerCase()
    },
    upper(): string {
      return value.toUpperCase()
    },
    trim(): string {
      return value.trim()
    },
    replace(regex: string, sub: string): string {
      // Use safe regex execution to prevent ReDoS attacks
      const result = safeRegexReplace(regex, value, sub)
      if (!result.success) {
        // Return original value for invalid or unsafe patterns
        // This maintains backward compatibility while being secure
        return value
      }
      return result.result ?? value
    },
    toUtf8(): unknown {
      // Return a byte array representation
      return new TextEncoder().encode(value)
    },
  }
}

/**
 * Create a RulesList wrapper with Firebase rules list methods
 */
export function createRulesList<T>(items: T[]): RulesList<T> {
  return {
    hasAny(list: T[]): boolean {
      if (list.length === 0) return false
      return items.some(item => list.includes(item))
    },
    hasAll(list: T[]): boolean {
      return list.every(item => items.includes(item))
    },
    hasOnly(list: T[]): boolean {
      // All items in the source list must be in the input list
      // AND the source list must contain at least one item from the input list
      if (items.length === 0) return list.length === 0
      return items.every(item => list.includes(item))
    },
    size(): number {
      return items.length
    },
    join(separator: string): string {
      return items.map(String).join(separator)
    },
    concat(list: T[]): RulesList<T> {
      return createRulesList([...items, ...list])
    },
    removeAll(list: T[]): RulesList<T> {
      return createRulesList(items.filter(item => !list.includes(item)))
    },
    toSet(): RulesSet<T> {
      return createRulesSet([...new Set(items)])
    },
  }
}

/**
 * Create a RulesSet wrapper with Firebase rules set methods
 */
export function createRulesSet<T>(items: T[]): RulesSet<T> {
  const uniqueItems = [...new Set(items)]

  return {
    hasAny(set: T[]): boolean {
      if (set.length === 0) return false
      return uniqueItems.some(item => set.includes(item))
    },
    hasAll(set: T[]): boolean {
      const uniqueSet = [...new Set(set)]
      return uniqueSet.every(item => uniqueItems.includes(item))
    },
    hasOnly(set: T[]): boolean {
      if (uniqueItems.length === 0) return set.length === 0
      return uniqueItems.every(item => set.includes(item))
    },
    size(): number {
      return uniqueItems.length
    },
    difference(set: T[]): RulesSet<T> {
      return createRulesSet(uniqueItems.filter(item => !set.includes(item)))
    },
    intersection(set: T[]): RulesSet<T> {
      return createRulesSet(uniqueItems.filter(item => set.includes(item)))
    },
    union(set: T[]): RulesSet<T> {
      return createRulesSet([...uniqueItems, ...set])
    },
  }
}

/**
 * Create a RulesMap wrapper with Firebase rules map methods
 */
export function createRulesMap<K extends string | number | symbol, V>(
  obj: Record<string, V>
): RulesMap<K, V> {
  return {
    keys(): K[] {
      return Object.keys(obj) as K[]
    },
    values(): V[] {
      return Object.values(obj)
    },
    size(): number {
      return Object.keys(obj).length
    },
    get(key: K, defaultValue?: V): V | undefined {
      const k = String(key)
      return k in obj ? obj[k] : defaultValue
    },
    diff(map: Record<string, V>): RulesSet<K> {
      const changedKeys: K[] = []
      const allKeys = new Set([...Object.keys(obj), ...Object.keys(map)])

      for (const key of allKeys) {
        const oldValue = obj[key]
        const newValue = map[key]
        // Key is different if value changed or key exists in only one map
        if (oldValue !== newValue) {
          changedKeys.push(key as K)
        }
      }

      return createRulesSet(changedKeys)
    },
  }
}

/**
 * Create a RulesTimestamp from milliseconds since epoch
 */
export function createRulesTimestamp(millis: number): RulesTimestamp {
  const seconds = Math.floor(millis / 1000)
  const nanos = (millis % 1000) * 1000000

  return {
    toMillis(): number {
      return millis
    },
    seconds,
    nanos,
  }
}

/**
 * Conversion factors for duration units to seconds
 */
const DURATION_CONVERSIONS: Record<string, number> = {
  w: 604800, // weeks to seconds
  d: 86400, // days to seconds
  h: 3600, // hours to seconds
  m: 60, // minutes to seconds
  s: 1, // seconds to seconds
  ms: 0.001, // milliseconds to seconds
  ns: 0.000000001, // nanoseconds to seconds
}

/**
 * Create a RulesDuration from amount and unit
 */
export function createRulesDuration(
  amount: number,
  unit: 'w' | 'd' | 'h' | 'm' | 's' | 'ms' | 'ns'
): RulesDuration {
  // Store internally as seconds
  const seconds = amount * DURATION_CONVERSIONS[unit]

  return {
    value(targetUnit: 'w' | 'd' | 'h' | 'm' | 's' | 'ms' | 'ns'): number {
      // Convert from seconds to target unit
      const result = seconds / DURATION_CONVERSIONS[targetUnit]
      // Round to avoid floating point precision issues for very small/large values
      // Use high precision for nanoseconds
      if (targetUnit === 'ns') {
        return Math.round(result)
      }
      return result
    },
  }
}

/**
 * Request object available in Firebase rules
 */
export interface RulesRequest {
  auth: RulesAuth | null
  resource: RulesResource | null
  time: RulesTimestamp
  method: 'get' | 'list' | 'create' | 'update' | 'delete'
  path: RulesPath
}

/**
 * Auth object in request context
 */
export interface RulesAuth {
  uid: string
  token: Record<string, unknown>
}

/**
 * Create a request object for rules evaluation
 */
export function createRulesRequest(options: {
  auth?: RulesAuth | null
  resource?: RulesResource | null
  time?: RulesTimestamp
  method: 'get' | 'list' | 'create' | 'update' | 'delete'
  path: RulesPath
}): RulesRequest {
  return {
    auth: options.auth || null,
    resource: options.resource || null,
    time: options.time || createRulesTimestamp(Date.now()),
    method: options.method,
    path: options.path,
  }
}

/**
 * Type checking utilities for Firebase rules
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

export function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function isFloat(value: unknown): value is number {
  return typeof value === 'number' && !Number.isInteger(value)
}

export function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isNull(value: unknown): value is null {
  return value === null
}

export function isList(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTimestamp(value: unknown): value is RulesTimestamp {
  return (
    isMap(value) &&
    'toMillis' in value &&
    typeof value.toMillis === 'function' &&
    'seconds' in value &&
    'nanos' in value
  )
}

export function isDuration(value: unknown): value is RulesDuration {
  return isMap(value) && 'value' in value && typeof value.value === 'function'
}

export function isPath(value: unknown): value is RulesPath {
  return isMap(value) && 'path' in value && typeof value.path === 'string'
}
